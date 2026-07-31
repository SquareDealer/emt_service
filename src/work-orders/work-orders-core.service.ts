import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { WorkOrder, WorkOrderStatus } from '../entities/work-order.entity';
import { UserRole } from '../entities/user.entity';
import { PricingService } from './pricing.service';

/** The acting user, for visibility/permission decisions. */
export interface Viewer {
  id: string;
  role: UserRole;
}

/**
 * Loading, scoping, totals and the freeze lifecycle — everything both the order
 * service and the estimate-lines service need.
 *
 * Extracted as a one-directional dependency rather than splitting WorkOrdersService
 * in half: the two halves would each need the other's helpers, which means a
 * circular dependency and forwardRef. Duplicating `recompute` instead would be
 * worse still — two implementations of the total is how totals drift.
 */
@Injectable()
export class WorkOrdersCoreService {
  constructor(
    @InjectRepository(WorkOrder)
    readonly repo: Repository<WorkOrder>,
    private readonly pricing: PricingService,
  ) {}

  canAssign(role: UserRole): boolean {
    return role === 'owner' || role === 'master_receptionist';
  }

  /**
   * 404 (not 403) on someone else's order: a plain master should not even learn
   * that the id exists.
   */
  assertAccess(wo: WorkOrder, viewer: Viewer): void {
    if (viewer.role === 'master' && wo.assigned_master_id !== viewer.id) {
      throw new NotFoundException('Заказ-наряд не найден');
    }
  }

  scope(
    qb: SelectQueryBuilder<WorkOrder>,
    viewer: Viewer,
  ): SelectQueryBuilder<WorkOrder> {
    if (viewer.role === 'master') {
      qb.andWhere('wo.assigned_master_id = :viewerId', { viewerId: viewer.id });
    }
    return qb;
  }

  baseListQb(): SelectQueryBuilder<WorkOrder> {
    return this.repo
      .createQueryBuilder('wo')
      .leftJoinAndSelect('wo.vehicle', 'vehicle')
      .leftJoinAndSelect('vehicle.client', 'client')
      .leftJoin('wo.assigned_master', 'master')
      .addSelect(['master.id', 'master.name']);
  }

  /** Load one order with all relations (master id+name only) — no access check. */
  async loadFull(id: string): Promise<WorkOrder> {
    const wo = await this.repo
      .createQueryBuilder('wo')
      .leftJoinAndSelect('wo.labor_lines', 'labor')
      .leftJoinAndSelect('wo.part_lines', 'part')
      .leftJoinAndSelect('wo.vehicle', 'vehicle')
      .leftJoinAndSelect('vehicle.client', 'client')
      .leftJoin('wo.assigned_master', 'master')
      .addSelect(['master.id', 'master.name'])
      .where('wo.id = :id', { id })
      // Without an explicit order Postgres returns lines in heap order, which
      // changes after every UPDATE (MVCC rewrite) — lines visibly jumped around
      // after an edit. Blocks come first, then position inside the block, with
      // created_at as the permanent tiebreak.
      .orderBy('labor.group_sort', 'ASC')
      .addOrderBy('labor.sort', 'ASC')
      .addOrderBy('labor.created_at', 'ASC')
      .addOrderBy('part.group_sort', 'ASC')
      .addOrderBy('part.sort', 'ASC')
      .addOrderBy('part.created_at', 'ASC')
      .getOne();
    if (!wo) throw new NotFoundException('Заказ-наряд не найден');
    return wo;
  }

  async findOne(id: string, viewer: Viewer): Promise<WorkOrder> {
    const wo = await this.loadFull(id);
    this.assertAccess(wo, viewer);
    return wo;
  }

  /** A closed estimate is frozen — every line mutation goes through here. */
  async assertOpen(id: string, viewer: Viewer): Promise<WorkOrder> {
    const wo = await this.findOne(id, viewer);
    if (wo.status === 'closed') {
      throw new BadRequestException(
        'Заказ-наряд закрыт: смета зафиксирована, изменить нельзя',
      );
    }
    return wo;
  }

  /**
   * Freeze on close, un-freeze on re-open — for ANY status path (kanban drag
   * to "Выдана", the dedicated /close endpoint, or re-opening).
   */
  async applyFreezeTransition(
    id: string,
    prev: WorkOrderStatus,
    next: WorkOrderStatus,
  ): Promise<void> {
    if (next === 'closed' && prev !== 'closed') {
      const total = await this.recompute(id);
      await this.repo.update(id, { total_frozen: total, closed_at: new Date() });
      await this.assignDocNumber(id);
    } else if (next !== 'closed' && prev === 'closed') {
      await this.repo.update(id, { total_frozen: null, closed_at: null });
      await this.recompute(id);
    }
  }

  /**
   * Assign the sequential document number on first freeze. Idempotent: once set,
   * re-opening/re-closing keeps the same number (the PDF must stay stable).
   */
  async assignDocNumber(id: string): Promise<void> {
    const wo = await this.repo.findOne({
      where: { id },
      select: { id: true, doc_number: true },
    });
    if (!wo || wo.doc_number != null) return;
    const rows = await this.repo.query(
      `SELECT nextval('work_order_doc_number_seq') AS n`,
    );
    await this.repo.update(id, { doc_number: Number(rows[0].n) });
  }

  /** «Заказ-наряд» number, from its own sequence, on first print. Idempotent. */
  async assignOrderNumber(id: string): Promise<void> {
    const wo = await this.repo.findOne({
      where: { id },
      select: { id: true, order_doc_number: true },
    });
    if (!wo || wo.order_doc_number != null) return;
    const rows = await this.repo.query(
      `SELECT nextval('work_order_order_number_seq') AS n`,
    );
    await this.repo.update(id, { order_doc_number: Number(rows[0].n) });
  }

  async recompute(id: string): Promise<number> {
    const wo = await this.loadFull(id);
    const total = this.pricing.computeTotal(
      wo.labor_lines ?? [],
      wo.part_lines ?? [],
      wo.discount_type,
      wo.discount_value,
    );
    await this.repo.update(id, { total_cached: total });
    return total;
  }
}
