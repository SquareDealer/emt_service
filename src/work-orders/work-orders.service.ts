import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkOrder, WorkOrderStatus } from '../entities/work-order.entity';
import { LaborLine } from '../entities/labor-line.entity';
import { PartLine } from '../entities/part-line.entity';
import { Vehicle } from '../entities/vehicle.entity';
import { PricingService } from './pricing.service';
import { WorkOrderPdfService } from './pdf/work-order-pdf.service';
import { SettingsService } from '../settings/settings.service';
import { TaskTemplatesService } from '../task-templates/task-templates.service';
import {
  CreateLaborLineDto,
  CreatePartLineDto,
  CreateWorkOrderDto,
  UpdateWorkOrderDto,
} from './dto/work-order.dto';

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
  ) {}

  /** Build the calculation PDF for a frozen order. Filename is ASCII-only. */
  async renderPdf(id: string): Promise<{ buffer: Buffer; filename: string }> {
    let wo = await this.findOne(id);
    if (wo.status !== 'closed') {
      throw new BadRequestException(
        'Наряд не зафиксирован: PDF доступен после закрытия',
      );
    }
    // Orders closed before doc numbering existed have no number — assign on
    // first print (idempotent; normal closes already get one at freeze time).
    if (wo.doc_number == null) {
      await this.assignDocNumber(id);
      wo = await this.findOne(id);
    }
    const settings = await this.settings.getDocSettings();
    const buffer = await this.pdf.build(wo, settings);
    const filename = `kalkulyaciya-${wo.doc_number ?? wo.id.slice(0, 8)}.pdf`;
    return { buffer, filename };
  }

  async create(dto: CreateWorkOrderDto): Promise<WorkOrder> {
    const vehicle = await this.vehicleRepo.findOne({ where: { id: dto.vehicle_id } });
    if (!vehicle) throw new BadRequestException('ТС не найдено');
    const wo = this.repo.create({
      vehicle_id: dto.vehicle_id,
      assigned_master_id: dto.assigned_master_id ?? null,
      title: dto.title ?? null,
      scheduled_at: dto.scheduled_at ? new Date(dto.scheduled_at) : null,
      scheduled_duration_min: dto.scheduled_duration_min ?? null,
      status: dto.status ?? 'scheduled',
      total_cached: 0,
    });
    const saved = await this.repo.save(wo);
    return this.findOne(saved.id);
  }

  async findOne(id: string): Promise<WorkOrder> {
    const wo = await this.repo.findOne({
      where: { id },
      relations: {
        labor_lines: true,
        part_lines: true,
        vehicle: { client: true },
      },
    });
    if (!wo) throw new NotFoundException('Заказ-наряд не найден');
    return wo;
  }

  findAll(): Promise<WorkOrder[]> {
    return this.repo.find({
      relations: { vehicle: { client: true } },
      order: { created_at: 'DESC' },
    });
  }

  /** Kanban board: all orders grouped by status. */
  async board(): Promise<Record<WorkOrderStatus, WorkOrder[]>> {
    const all = await this.repo.find({
      relations: { vehicle: { client: true } },
      order: { scheduled_at: 'ASC', created_at: 'ASC' },
    });
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

  async calendar(from?: string, to?: string): Promise<WorkOrder[]> {
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
    return this.repo
      .createQueryBuilder('wo')
      .leftJoinAndSelect('wo.vehicle', 'vehicle')
      .leftJoinAndSelect('vehicle.client', 'client')
      .where('wo.scheduled_at IS NOT NULL')
      .andWhere('wo.scheduled_at >= :fromDate', { fromDate })
      .andWhere('wo.scheduled_at < :toDate', { toDate })
      .orderBy('wo.scheduled_at', 'ASC')
      .getMany();
  }

  async update(id: string, dto: UpdateWorkOrderDto): Promise<WorkOrder> {
    const wo = await this.findOne(id);
    const prevStatus = wo.status;
    const willStayClosed = (dto.status ?? prevStatus) === 'closed';
    const touchesMoney =
      dto.discount_type !== undefined || dto.discount_value !== undefined;
    // Editing the estimate is only blocked while the order remains closed —
    // a PATCH that re-opens it (status off 'closed') may also touch money.
    if (willStayClosed && touchesMoney) {
      throw new BadRequestException(
        'Заказ-наряд закрыт: смета зафиксирована, изменить нельзя',
      );
    }

    if (dto.title !== undefined) wo.title = dto.title;
    if (dto.notes !== undefined) wo.notes = dto.notes;
    if (dto.scheduled_at !== undefined)
      wo.scheduled_at = dto.scheduled_at ? new Date(dto.scheduled_at) : null;
    if (dto.scheduled_duration_min !== undefined)
      wo.scheduled_duration_min = dto.scheduled_duration_min;
    if (dto.assigned_master_id !== undefined)
      wo.assigned_master_id = dto.assigned_master_id;
    if (dto.status !== undefined) wo.status = dto.status;
    if (dto.discount_type !== undefined) wo.discount_type = dto.discount_type;
    if (dto.discount_value !== undefined) wo.discount_value = dto.discount_value;

    await this.repo.save(wo);
    await this.applyFreezeTransition(id, prevStatus, wo.status);
    if (touchesMoney) await this.recompute(id);
    return this.findOne(id);
  }

  async updateStatus(id: string, status: WorkOrderStatus): Promise<WorkOrder> {
    const wo = await this.findOne(id);
    const prevStatus = wo.status;
    wo.status = status;
    await this.repo.save(wo);
    await this.applyFreezeTransition(id, prevStatus, status);
    return this.findOne(id);
  }

  async addLaborLine(id: string, dto: CreateLaborLineDto): Promise<WorkOrder> {
    const wo = await this.assertOpen(id);

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
    return this.findOne(id);
  }

  async removeLaborLine(id: string, lineId: string): Promise<WorkOrder> {
    await this.assertOpen(id);
    await this.laborRepo.delete({ id: lineId, work_order_id: id });
    await this.recompute(id);
    return this.findOne(id);
  }

  async addPartLine(id: string, dto: CreatePartLineDto): Promise<WorkOrder> {
    const wo = await this.assertOpen(id);
    const line = this.partRepo.create({
      work_order_id: wo.id,
      name: dto.name,
      catalog_number: dto.catalog_number ?? null,
      qty: dto.qty ?? 1,
      unit_price: dto.unit_price,
    });
    await this.partRepo.save(line);
    await this.recompute(id);
    return this.findOne(id);
  }

  async removePartLine(id: string, lineId: string): Promise<WorkOrder> {
    await this.assertOpen(id);
    await this.partRepo.delete({ id: lineId, work_order_id: id });
    await this.recompute(id);
    return this.findOne(id);
  }

  /** Freeze the estimate at closing so future rate changes don't move it (AC-8). */
  async close(id: string): Promise<WorkOrder> {
    const total = await this.recompute(id);
    await this.repo.update(id, {
      status: 'closed',
      total_frozen: total,
      closed_at: new Date(),
    });
    await this.assignDocNumber(id);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const res = await this.repo.delete(id);
    if (!res.affected) throw new NotFoundException('Заказ-наряд не найден');
  }

  // --- internals ---

  private async assertOpen(id: string): Promise<WorkOrder> {
    const wo = await this.findOne(id);
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

  private async recompute(id: string): Promise<number> {
    const wo = await this.findOne(id);
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
