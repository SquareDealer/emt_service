import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { WorkOrder, WorkOrderStatus } from '../entities/work-order.entity';
import { UserRole } from '../entities/user.entity';
import { LaborLine } from '../entities/labor-line.entity';
import { PartLine } from '../entities/part-line.entity';
import { Vehicle } from '../entities/vehicle.entity';
import { PricingService } from './pricing.service';
import { WorkOrderPdfService } from './pdf/work-order-pdf.service';
import { SettingsService } from '../settings/settings.service';
import { TaskTemplatesService } from '../task-templates/task-templates.service';
import { UsersService } from '../users/users.service';
import {
  CreateLaborLineDto,
  CreatePartLineDto,
  CreateWorkOrderDto,
  UpdateWorkOrderDto,
} from './dto/work-order.dto';

/** The acting user, for visibility/permission decisions. */
export interface Viewer {
  id: string;
  role: UserRole;
}

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
    @InjectRepository(WorkOrder)
    private readonly repo: Repository<WorkOrder>,
    @InjectRepository(LaborLine)
    private readonly laborRepo: Repository<LaborLine>,
    @InjectRepository(PartLine)
    private readonly partRepo: Repository<PartLine>,
    @InjectRepository(Vehicle)
    private readonly vehicleRepo: Repository<Vehicle>,
    private readonly pricing: PricingService,
    private readonly settings: SettingsService,
    private readonly templates: TaskTemplatesService,
    private readonly pdf: WorkOrderPdfService,
    private readonly users: UsersService,
  ) {}

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
      await this.assignDocNumber(id);
      wo = await this.loadFull(id);
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
    await this.assignOrderNumber(id);
    const wo = await this.loadFull(id);
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
    return this.loadFull(id);
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
    return this.loadFull(saved.id);
  }

  async findOne(id: string, viewer: Viewer): Promise<WorkOrder> {
    const wo = await this.loadFull(id);
    this.assertAccess(wo, viewer);
    return wo;
  }

  findAll(viewer: Viewer): Promise<WorkOrder[]> {
    return this.scope(this.baseListQb(), viewer)
      .orderBy('wo.created_at', 'DESC')
      .getMany();
  }

  /** Kanban board: visible orders grouped by status. */
  async board(viewer: Viewer): Promise<Record<WorkOrderStatus, WorkOrder[]>> {
    const all = await this.scope(this.baseListQb(), viewer)
      .orderBy('wo.scheduled_at', 'ASC')
      .addOrderBy('wo.created_at', 'ASC')
      .getMany();
    const groups: Record<WorkOrderStatus, WorkOrder[]> = {
      scheduled: [],
      in_progress: [],
      waiting: [],
      done: [],
      closed: [],
    };
    for (const wo of all) groups[wo.status].push(wo);
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
    const qb = this.baseListQb()
      .andWhere('wo.scheduled_at IS NOT NULL')
      .andWhere('wo.scheduled_at >= :fromDate', { fromDate })
      .andWhere('wo.scheduled_at < :toDate', { toDate });
    return this.scope(qb, viewer).orderBy('wo.scheduled_at', 'ASC').getMany();
  }

  /**
   * Archive: closed orders only, with search / sort / pagination. Role scoping
   * is reused (a plain master sees only their own closed orders). The estimate
   * is already frozen (total_frozen) at close time, so this is a read surface.
   */
  async archive(params: ArchiveQuery, viewer: Viewer): Promise<ArchivePage> {
    const page = Math.max(1, Math.trunc(params.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Math.trunc(params.pageSize ?? 25) || 25));

    const qb = this.scope(this.baseListQb(), viewer).andWhere(
      "wo.status = 'closed'",
    );

    const term = (params.q ?? '').trim();
    if (term) {
      const like = `%${term}%`;
      qb.andWhere(
        `(wo.title ILIKE :like OR vehicle.plate ILIKE :like OR vehicle.model ILIKE :like
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
      dto.assigned_master_id !== undefined && this.canAssign(viewer.role);
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
    await this.applyFreezeTransition(id, prevStatus, wo.status);
    if (touchesMoney) await this.recompute(id);
    return this.loadFull(id);
  }

  async updateStatus(id: string, status: WorkOrderStatus, viewer: Viewer): Promise<WorkOrder> {
    const wo = await this.findOne(id, viewer);
    const prevStatus = wo.status;
    wo.status = status;
    await this.repo.save(wo);
    await this.applyFreezeTransition(id, prevStatus, status);
    return this.loadFull(id);
  }

  async addLaborLine(id: string, dto: CreateLaborLineDto, viewer: Viewer): Promise<WorkOrder> {
    const wo = await this.assertOpen(id, viewer);

    let name = dto.name;
    let hours = dto.hours;
    let priceOverride = dto.price_override;
    const templateId: string | null = dto.template_id ?? null;

    if (dto.template_id) {
      const tpl = await this.templates.findOne(dto.template_id);
      name = name ?? tpl.name;
      hours = hours ?? tpl.default_hours ?? undefined;
      // template fixed price prefills override unless caller set one explicitly
      if (priceOverride === undefined && tpl.default_price !== null) {
        priceOverride = tpl.default_price;
      }
    }

    if (!name) throw new BadRequestException('Не указано название операции');

    const rate =
      dto.rate_snapshot !== undefined
        ? dto.rate_snapshot
        : await this.settings.getLaborRate();

    const line = this.laborRepo.create({
      work_order_id: wo.id,
      template_id: templateId,
      name,
      hours: hours ?? null,
      rate_snapshot: rate,
      price_override: priceOverride ?? null,
    });
    await this.laborRepo.save(line);
    await this.recompute(id);
    return this.loadFull(id);
  }

  async removeLaborLine(id: string, lineId: string, viewer: Viewer): Promise<WorkOrder> {
    await this.assertOpen(id, viewer);
    await this.laborRepo.delete({ id: lineId, work_order_id: id });
    await this.recompute(id);
    return this.loadFull(id);
  }

  async addPartLine(id: string, dto: CreatePartLineDto, viewer: Viewer): Promise<WorkOrder> {
    const wo = await this.assertOpen(id, viewer);
    const line = this.partRepo.create({
      work_order_id: wo.id,
      name: dto.name,
      catalog_number: dto.catalog_number ?? null,
      qty: dto.qty ?? 1,
      unit_price: dto.unit_price,
    });
    await this.partRepo.save(line);
    await this.recompute(id);
    return this.loadFull(id);
  }

  async removePartLine(id: string, lineId: string, viewer: Viewer): Promise<WorkOrder> {
    await this.assertOpen(id, viewer);
    await this.partRepo.delete({ id: lineId, work_order_id: id });
    await this.recompute(id);
    return this.loadFull(id);
  }

  /** Freeze the estimate at closing so future rate changes don't move it (AC-8). */
  async close(id: string, viewer: Viewer): Promise<WorkOrder> {
    await this.findOne(id, viewer); // access check
    const total = await this.recompute(id);
    await this.repo.update(id, {
      status: 'closed',
      total_frozen: total,
      closed_at: new Date(),
    });
    await this.assignDocNumber(id);
    return this.loadFull(id);
  }

  async remove(id: string, viewer: Viewer): Promise<void> {
    await this.findOne(id, viewer); // access check (also 404s for masters on others')
    const res = await this.repo.delete(id);
    if (!res.affected) throw new NotFoundException('Заказ-наряд не найден');
  }

  // --- internals ---

  private canAssign(role: UserRole): boolean {
    return role === 'owner' || role === 'master_receptionist';
  }

  /** A master may only see/touch orders assigned to themselves. */
  private assertAccess(wo: WorkOrder, viewer: Viewer): void {
    if (viewer.role === 'master' && wo.assigned_master_id !== viewer.id) {
      throw new NotFoundException('Заказ-наряд не найден');
    }
  }

  private scope(
    qb: SelectQueryBuilder<WorkOrder>,
    viewer: Viewer,
  ): SelectQueryBuilder<WorkOrder> {
    if (viewer.role === 'master') {
      qb.andWhere('wo.assigned_master_id = :viewerId', { viewerId: viewer.id });
    }
    return qb;
  }

  /** Shared list query: vehicle+client joined, master id+name only (no hash). */
  private baseListQb(): SelectQueryBuilder<WorkOrder> {
    return this.repo
      .createQueryBuilder('wo')
      .leftJoinAndSelect('wo.vehicle', 'vehicle')
      .leftJoinAndSelect('vehicle.client', 'client')
      .leftJoin('wo.assigned_master', 'master')
      .addSelect(['master.id', 'master.name']);
  }

  /** Load one order with all relations (master id+name only) — no access check. */
  private async loadFull(id: string): Promise<WorkOrder> {
    const wo = await this.repo
      .createQueryBuilder('wo')
      .leftJoinAndSelect('wo.labor_lines', 'labor')
      .leftJoinAndSelect('wo.part_lines', 'part')
      .leftJoinAndSelect('wo.vehicle', 'vehicle')
      .leftJoinAndSelect('vehicle.client', 'client')
      .leftJoin('wo.assigned_master', 'master')
      .addSelect(['master.id', 'master.name'])
      .where('wo.id = :id', { id })
      .getOne();
    if (!wo) throw new NotFoundException('Заказ-наряд не найден');
    return wo;
  }

  /** Reject an assignment to a non-existent or deactivated user. */
  private async assertAssignable(masterId: string | null): Promise<void> {
    if (!masterId) return;
    if (!(await this.users.isAssignable(masterId))) {
      throw new BadRequestException('Недопустимый мастер для назначения');
    }
  }

  private async assertOpen(id: string, viewer: Viewer): Promise<WorkOrder> {
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
   * to "Выдана" via PATCH, the dedicated /close endpoint, or re-opening).
   * Keeps total_frozen/closed_at consistent so revenue reporting stays correct.
   */
  private async applyFreezeTransition(
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
  private async assignDocNumber(id: string): Promise<void> {
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

  /**
   * Assign the «Заказ-наряд» number from its own sequence on first print.
   * Idempotent — repeated prints keep the same number.
   */
  private async assignOrderNumber(id: string): Promise<void> {
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

  private async recompute(id: string): Promise<number> {
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
