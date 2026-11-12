import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { WorkOrder, WorkOrderStatus } from '../entities/work-order.entity';
import { LaborLine } from '../entities/labor-line.entity';
import { PartLine } from '../entities/part-line.entity';
import { Vehicle } from '../entities/vehicle.entity';
import { WorkOrderPdfService } from './pdf/work-order-pdf.service';
import { SettingsService } from '../settings/settings.service';
import { UsersService } from '../users/users.service';
import { WorkOrdersCoreService } from './work-orders-core.service';
import type { Viewer } from './work-orders-core.service';
import { CreateWorkOrderDto, UpdateWorkOrderDto } from './dto/work-order.dto';

export type { Viewer } from './work-orders-core.service';

/** How many closed orders the board's «Выдана» column shows. Mirrored on the client. */
export const BOARD_CLOSED_LIMIT = 10;

/** Sort options for the closed-orders archive. */
export type ArchiveSort = 'closed_desc' | 'closed_asc' | 'total_desc' | 'total_asc';

export interface ArchiveQuery {
  q?: string;
  sort?: ArchiveSort;
  page?: number;
  pageSize?: number;
}

export interface ArchivePage {
  items: WorkOrder[];
  total: number;
  page: number;
  pageSize: number;
}

@Injectable()
export class WorkOrdersService {
  constructor(
    private readonly core: WorkOrdersCoreService,
    @InjectRepository(Vehicle)
    private readonly vehicleRepo: Repository<Vehicle>,
    private readonly settings: SettingsService,
    private readonly pdf: WorkOrderPdfService,
    private readonly users: UsersService,
  ) {}

  /** Order rows live on core's repository. */
  private get repo() {
    return this.core.repo;
  }

  /** Build the calculation PDF for a frozen order. Filename is ASCII-only. */
  async renderPdf(id: string, viewer: Viewer): Promise<{ buffer: Buffer; filename: string }> {
    let wo = await this.findOne(id, viewer);
    if (wo.status !== 'closed') {
      throw new BadRequestException(
        'Наряд не зафиксирован: PDF доступен после закрытия',
      );
    }
    // Orders closed before doc numbering existed have no number — assign on
    // first print (idempotent; normal closes already get one at freeze time).
    if (wo.doc_number == null) {
      await this.core.assignDocNumber(id);
      wo = await this.core.loadFull(id);
    }
    const settings = await this.settings.getDocSettings();
    const buffer = await this.pdf.build(wo, settings, 'calc');
    const filename = `kalkulyaciya-${wo.doc_number ?? wo.id.slice(0, 8)}.pdf`;
    return { buffer, filename };
  }

  /**
   * Build the «Заказ-наряд» PDF. Available at ANY status (estimate need not be
   * frozen) — uses its own number sequence, assigned lazily on first print.
   */
  async renderOrderPdf(id: string, viewer: Viewer): Promise<{ buffer: Buffer; filename: string }> {
    await this.findOne(id, viewer); // access check
    await this.core.assignOrderNumber(id);
    const wo = await this.core.loadFull(id);
    const settings = await this.settings.getDocSettings();
    const buffer = await this.pdf.build(wo, settings, 'order');
    const filename = `zakaz-naryad-${wo.order_doc_number ?? wo.id.slice(0, 8)}.pdf`;
    return { buffer, filename };
  }

  /**
   * Record how much the client has paid (single running total). Allowed on a
   * closed order too — installments may arrive after pickup, unlike estimate
   * lines which are frozen on close.
   */
  async setPaid(id: string, amount: number, viewer: Viewer): Promise<WorkOrder> {
    await this.findOne(id, viewer); // access check
    await this.repo.update(id, { paid_amount: amount });
    return this.core.loadFull(id);
  }

  async create(dto: CreateWorkOrderDto, viewer: Viewer): Promise<WorkOrder> {
    const vehicle = await this.vehicleRepo.findOne({ where: { id: dto.vehicle_id } });
    if (!vehicle) throw new BadRequestException('ТС не найдено');
    // A plain master always creates orders assigned to themselves; owner and
    // receptionist may assign anyone (validated below).
    const assignedId =
      viewer.role === 'master' ? viewer.id : dto.assigned_master_id ?? null;
    await this.assertAssignable(assignedId);
    const wo = this.repo.create({
      vehicle_id: dto.vehicle_id,
      assigned_master_id: assignedId,
      title: dto.title ?? null,
      scheduled_at: dto.scheduled_at ? new Date(dto.scheduled_at) : null,
      scheduled_duration_min: dto.scheduled_duration_min ?? null,
      status: dto.status ?? 'scheduled',
      total_cached: 0,
      // Both numeric columns carry a transformer, so TypeORM emits them in the
      // INSERT even when unset — an unset paid_amount becomes NULL and trips the
      // NOT NULL constraint (the DB DEFAULT 0 never applies). Set it explicitly,
      // like total_cached above.
      paid_amount: 0,
    });
    const saved = await this.repo.save(wo);
    return this.core.loadFull(saved.id);
  }

  /**
   * Copy an order — «копировать заказ-наряд для переноса работ на нового
   * клиента». The estimate is reproduced exactly, blocks and all; what belongs
   * to the original run is not: schedule, document numbers, payment, freeze.
   *
   * `rate_snapshot` and every price are copied as they stand — the point of a
   * copy is to carry over the quote that was agreed, not to re-price it at
   * today's rate.
   */
  async duplicate(id: string, vehicleId: string | undefined, viewer: Viewer): Promise<WorkOrder> {
    const source = await this.core.findOne(id, viewer);

    const targetVehicleId = vehicleId ?? source.vehicle_id;
    if (vehicleId) {
      const vehicle = await this.vehicleRepo.findOne({ where: { id: vehicleId } });
      if (!vehicle) throw new BadRequestException('ТС не найдено');
    }

    // Mirror create(): a master's copy is assigned to themselves, otherwise they
    // would produce an order and immediately 404 on it. The source's master may
    // also have been deactivated since.
    const assignedId =
      viewer.role === 'master' ? viewer.id : source.assigned_master_id ?? null;
    await this.assertAssignable(assignedId);

    let newId = '';
    // 1 + N + M inserts without a transaction leave a half-copied estimate.
    await this.repo.manager.transaction(async (m: EntityManager) => {
      const copy = await m.save(
        m.create(WorkOrder, {
          vehicle_id: targetVehicleId,
          assigned_master_id: assignedId,
          status: 'scheduled',
          title: source.title,
          notes: source.notes,
          complaint: source.complaint,
          recommendation: source.recommendation,
          discount_type: source.discount_type,
          discount_value: source.discount_value,
          // Deliberately NOT copied: the schedule, both document numbers,
          // closed_at/total_frozen and what the first client already paid.
          scheduled_at: null,
          scheduled_duration_min: null,
          total_cached: 0,
          paid_amount: 0,
        }),
      );
      newId = copy.id;

      for (const l of source.labor_lines ?? []) {
        await m.save(
          m.create(LaborLine, {
            work_order_id: copy.id,
            template_id: l.template_id,
            name: l.name,
            hours: l.hours,
            rate_snapshot: l.rate_snapshot,
            price_override: l.price_override,
            discount_type: l.discount_type,
            discount_value: l.discount_value,
            group_key: l.group_key,
            group_name: l.group_name,
            group_sort: l.group_sort,
            sort: l.sort,
          }),
        );
      }
      for (const part of source.part_lines ?? []) {
        await m.save(
          m.create(PartLine, {
            work_order_id: copy.id,
            name: part.name,
            catalog_number: part.catalog_number,
            manufacturer: part.manufacturer,
            part_template_id: part.part_template_id,
            qty: part.qty,
            unit: part.unit,
            unit_price: part.unit_price,
            discount_type: part.discount_type,
            discount_value: part.discount_value,
            group_key: part.group_key,
            group_name: part.group_name,
            group_sort: part.group_sort,
            sort: part.sort,
          }),
        );
      }
    });

    await this.core.recompute(newId);
    return this.core.loadFull(newId);
  }

  findOne(id: string, viewer: Viewer): Promise<WorkOrder> {
    return this.core.findOne(id, viewer);
  }

  findAll(viewer: Viewer): Promise<WorkOrder[]> {
    return this.core.scope(this.core.baseListQb(), viewer)
      .orderBy('wo.created_at', 'DESC')
      .getMany();
  }

  /**
   * Kanban board: visible orders grouped by status. «Выдана» shows only the
   * most recently closed ones — the rest live in the archive, and loading years
   * of closed orders on every board refresh would only get slower.
   */
  async board(viewer: Viewer): Promise<Record<WorkOrderStatus, WorkOrder[]>> {
    const [open, closed] = await Promise.all([
      this.core
        .scope(this.core.baseListQb(), viewer)
        .andWhere("wo.status <> 'closed'")
        .orderBy('wo.scheduled_at', 'ASC')
        .addOrderBy('wo.created_at', 'ASC')
        .getMany(),
      this.core
        .scope(this.core.baseListQb(), viewer)
        .andWhere("wo.status = 'closed'")
        .orderBy('wo.closed_at', 'DESC', 'NULLS LAST')
        .take(BOARD_CLOSED_LIMIT)
        .getMany(),
    ]);
    const groups: Record<WorkOrderStatus, WorkOrder[]> = {
      scheduled: [],
      in_progress: [],
      waiting: [],
      done: [],
      closed,
    };
    for (const wo of open) groups[wo.status].push(wo);
    return groups;
  }

  async calendar(from: string | undefined, to: string | undefined, viewer: Viewer): Promise<WorkOrder[]> {
    const fromDate = from ? new Date(from) : new Date('1970-01-01');
    let toDate: Date;
    if (!to) {
      toDate = new Date('2999-01-01');
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      // date-only -> make the range inclusive of that whole day
      toDate = new Date(to);
      toDate.setUTCDate(toDate.getUTCDate() + 1);
    } else {
      toDate = new Date(to);
    }
    const qb = this.core.baseListQb()
      .andWhere('wo.scheduled_at IS NOT NULL')
      .andWhere('wo.scheduled_at >= :fromDate', { fromDate })
      .andWhere('wo.scheduled_at < :toDate', { toDate });
    return this.core.scope(qb, viewer).orderBy('wo.scheduled_at', 'ASC').getMany();
  }

  /**
   * Archive: closed orders only, with search / sort / pagination. Role scoping
   * is reused (a plain master sees only their own closed orders). The estimate
   * is already frozen (total_frozen) at close time, so this is a read surface.
   */
  async archive(params: ArchiveQuery, viewer: Viewer): Promise<ArchivePage> {
    const page = Math.max(1, Math.trunc(params.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Math.trunc(params.pageSize ?? 25) || 25));

    const qb = this.core.scope(this.core.baseListQb(), viewer).andWhere(
      "wo.status = 'closed'",
    );

    const term = (params.q ?? '').trim();
    if (term) {
      const like = `%${term}%`;
      qb.andWhere(
        `(wo.title ILIKE :like OR vehicle.plate ILIKE :like OR vehicle.model ILIKE :like
          OR vehicle.make ILIKE :like OR vehicle.generation_code ILIKE :like
          OR client.full_name ILIKE :like OR CAST(wo.doc_number AS TEXT) ILIKE :like)`,
        { like },
      );
    }

    // closed_at is the primary key; NULLS LAST covers orders closed before the
    // closed_at column existed (lazily numbered on first print).
    switch (params.sort) {
      case 'closed_asc':
        qb.orderBy('wo.closed_at', 'ASC', 'NULLS LAST');
        break;
      case 'total_desc':
        qb.orderBy('wo.total_frozen', 'DESC', 'NULLS LAST');
        break;
      case 'total_asc':
        qb.orderBy('wo.total_frozen', 'ASC', 'NULLS LAST');
        break;
      default:
        qb.orderBy('wo.closed_at', 'DESC', 'NULLS LAST');
    }
    qb.addOrderBy('wo.doc_number', 'DESC', 'NULLS LAST'); // stable tie-break

    const [items, total] = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();
    return { items, total, page, pageSize };
  }

  async update(id: string, dto: UpdateWorkOrderDto, viewer: Viewer): Promise<WorkOrder> {
    const wo = await this.findOne(id, viewer);
    const prevStatus = wo.status;
    const willStayClosed = (dto.status ?? prevStatus) === 'closed';
    const touchesMoney =
      dto.discount_type !== undefined || dto.discount_value !== undefined;
    // Only owner / receptionist may (re)assign a master; a plain master's
    // attempt to change assignment is ignored.
    const wantsAssign =
      dto.assigned_master_id !== undefined && this.core.canAssign(viewer.role);
    const nextMaster = wantsAssign ? dto.assigned_master_id ?? null : undefined;
    const touchesMaster = wantsAssign && nextMaster !== wo.assigned_master_id;

    // Estimate edits are blocked only while the order stays closed — a PATCH
    // that re-opens it (status off 'closed') may also touch money/master.
    if (willStayClosed && touchesMoney) {
      throw new BadRequestException(
        'Заказ-наряд закрыт: смета зафиксирована, изменить нельзя',
      );
    }
    if (willStayClosed && touchesMaster) {
      throw new BadRequestException('Заказ-наряд закрыт: мастера изменить нельзя');
    }

    if (dto.title !== undefined) wo.title = dto.title;
    if (dto.notes !== undefined) wo.notes = dto.notes;
    if (dto.complaint !== undefined) wo.complaint = dto.complaint;
    if (dto.recommendation !== undefined) wo.recommendation = dto.recommendation;
    if (dto.scheduled_at !== undefined)
      wo.scheduled_at = dto.scheduled_at ? new Date(dto.scheduled_at) : null;
    if (dto.scheduled_duration_min !== undefined)
      wo.scheduled_duration_min = dto.scheduled_duration_min;
    if (touchesMaster) {
      await this.assertAssignable(nextMaster as string | null);
      wo.assigned_master_id = nextMaster as string | null;
    }
    if (dto.status !== undefined) wo.status = dto.status;
    if (dto.discount_type !== undefined) wo.discount_type = dto.discount_type;
    if (dto.discount_value !== undefined) wo.discount_value = dto.discount_value;

    // Drop the eagerly-loaded ManyToOne relation: a stale assigned_master
    // object would otherwise overwrite the FK column back on save (TypeORM
    // lets the relation entity win over the changed join column).
    delete (wo as Partial<WorkOrder>).assigned_master;
    await this.repo.save(wo);
    await this.core.applyFreezeTransition(id, prevStatus, wo.status);
    if (touchesMoney) await this.core.recompute(id);
    return this.core.loadFull(id);
  }

  async updateStatus(id: string, status: WorkOrderStatus, viewer: Viewer): Promise<WorkOrder> {
    const wo = await this.findOne(id, viewer);
    const prevStatus = wo.status;
    wo.status = status;
    await this.repo.save(wo);
    await this.core.applyFreezeTransition(id, prevStatus, status);
    return this.core.loadFull(id);
  }

  /**
   * Freeze the estimate at closing so future rate changes don't move it (AC-8).
   * Delegates to applyFreezeTransition rather than repeating it — that also
   * makes re-closing an already-closed order a no-op instead of resetting
   * closed_at and re-freezing the total.
   */
  async close(id: string, viewer: Viewer): Promise<WorkOrder> {
    const wo = await this.findOne(id, viewer); // access check
    await this.repo.update(id, { status: 'closed' });
    await this.core.applyFreezeTransition(id, wo.status, 'closed');
    return this.core.loadFull(id);
  }

  async remove(id: string, viewer: Viewer): Promise<void> {
    await this.findOne(id, viewer); // access check (also 404s for masters on others')
    const res = await this.repo.delete(id);
    if (!res.affected) throw new NotFoundException('Заказ-наряд не найден');
  }

  // --- internals ---


  /** Reject an assignment to a non-existent or deactivated user. */
  private async assertAssignable(masterId: string | null): Promise<void> {
    if (!masterId) return;
    if (!(await this.users.isAssignable(masterId))) {
      throw new BadRequestException('Недопустимый мастер для назначения');
    }
  }
}
