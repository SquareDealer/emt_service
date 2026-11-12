import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { WorkOrder } from '../entities/work-order.entity';
import { LaborLine } from '../entities/labor-line.entity';
import { PartLine } from '../entities/part-line.entity';
import { TaskTemplatePart } from '../entities/task-template-part.entity';
import { SettingsService } from '../settings/settings.service';
import { TaskTemplatesService } from '../task-templates/task-templates.service';
import { PriceListService } from '../task-templates/price-list.service';
import { WorkOrdersCoreService } from './work-orders-core.service';
import type { Viewer } from './work-orders-core.service';
import {
  CreateLaborLineDto,
  CreatePartLineDto,
  UpdateLaborLineDto,
  UpdatePartLineDto,
} from './dto/work-order.dto';

/** A part the template suggests, resolved for one car. */
export interface TemplatePartCandidate {
  part_template_id: string;
  name: string;
  manufacturer: string | null;
  catalog_number: string | null;
  unit: string;
  qty: number;
  unit_price: number | null;
  /** Ticked on the confirmation sheet by default. */
  is_default: boolean;
  /** True when this row was chosen because it names the car's generation. */
  generation_specific: boolean;
}

export interface TemplatePreview {
  template_id: string;
  group_name: string;
  labor: { name: string; hours: number | null; rate_snapshot: number; price_override: number | null };
  price_source: 'generation' | 'template' | 'rate';
  parts: TemplatePartCandidate[];
}

export interface ApplyTemplateDto {
  template_id: string;
  /** Which candidates to actually add. Omit to take the defaults. */
  part_template_ids?: string[];
  /** Per-part quantity overrides, keyed by part_template_id. */
  qty?: Record<string, number>;
  /**
   * Which generation's prices and parts to use: absent → the car's own,
   * null → the shared base, uuid → that generation.
   */
  generation_id?: string | null;
}

/** Next free position, so a new line lands at the end of its list. */
function nextSort(lines: { sort: number }[] | undefined): number {
  return (lines ?? []).reduce((max, l) => Math.max(max, l.sort ?? 0), -1) + 1;
}

/** Next free block position, so a new block lands after the existing ones. */
function nextGroupSort(wo: WorkOrder): number {
  const all = [...(wo.labor_lines ?? []), ...(wo.part_lines ?? [])];
  return all.reduce((max, l) => Math.max(max, l.group_sort ?? 0), 0) + 1;
}

@Injectable()
export class WorkOrderLinesService {
  constructor(
    private readonly core: WorkOrdersCoreService,
    @InjectRepository(LaborLine)
    private readonly laborRepo: Repository<LaborLine>,
    @InjectRepository(PartLine)
    private readonly partRepo: Repository<PartLine>,
    @InjectRepository(TaskTemplatePart)
    private readonly templateParts: Repository<TaskTemplatePart>,
    private readonly settings: SettingsService,
    private readonly templates: TaskTemplatesService,
    private readonly priceList: PriceListService,
  ) {}

  // ---------------- labor ----------------

  async addLaborLine(id: string, dto: CreateLaborLineDto, viewer: Viewer): Promise<WorkOrder> {
    const wo = await this.core.assertOpen(id, viewer);

    let name = dto.name;
    let hours = dto.hours;
    let priceOverride = dto.price_override;
    const templateId: string | null = dto.template_id ?? null;

    const rate =
      dto.rate_snapshot !== undefined
        ? dto.rate_snapshot
        : await this.settings.getLaborRate();

    if (dto.template_id) {
      const tpl = await this.templates.findOne(dto.template_id);
      name = name ?? tpl.name;
      // Price comes from the price list for THIS car's generation, falling back
      // to the template's own defaults and finally to plain hours × rate.
      const resolved = await this.priceList.resolveForLine(
        dto.template_id,
        wo.vehicle?.generation_id ?? null,
        rate,
      );
      hours = hours ?? resolved.hours ?? undefined;
      if (priceOverride === undefined && resolved.price_override !== null) {
        priceOverride = resolved.price_override;
      }
    }

    if (!name) throw new BadRequestException('Не указано название операции');

    const line = this.laborRepo.create({
      work_order_id: wo.id,
      template_id: templateId,
      name,
      hours: hours ?? null,
      rate_snapshot: rate,
      price_override: priceOverride ?? null,
      discount_type: dto.discount_type ?? null,
      discount_value: dto.discount_value ?? null,
      group_key: dto.group_key ?? null,
      group_name: dto.group_name ?? null,
      group_sort: dto.group_key ? nextGroupSort(wo) : 0,
      sort: nextSort(wo.labor_lines),
    });
    await this.laborRepo.save(line);
    await this.core.recompute(id);
    return this.core.loadFull(id);
  }

  async updateLaborLine(
    id: string,
    lineId: string,
    dto: UpdateLaborLineDto,
    viewer: Viewer,
  ): Promise<WorkOrder> {
    await this.core.assertOpen(id, viewer);
    const line = await this.laborRepo.findOne({ where: { id: lineId, work_order_id: id } });
    if (!line) throw new NotFoundException('Строка работы не найдена');

    if (dto.name !== undefined) {
      if (!dto.name) throw new BadRequestException('Не указано название операции');
      line.name = dto.name;
    }
    if (dto.hours !== undefined) line.hours = dto.hours ?? null;
    if (dto.rate_snapshot !== undefined) line.rate_snapshot = dto.rate_snapshot;
    if (dto.price_override !== undefined) line.price_override = dto.price_override ?? null;
    if (dto.discount_type !== undefined) line.discount_type = dto.discount_type ?? null;
    if (dto.discount_value !== undefined) line.discount_value = dto.discount_value ?? null;

    await this.laborRepo.save(line);
    await this.core.recompute(id);
    return this.core.loadFull(id);
  }

  async removeLaborLine(id: string, lineId: string, viewer: Viewer): Promise<WorkOrder> {
    await this.core.assertOpen(id, viewer);
    // The parts keep their group_key, so the block survives as a parts-only
    // block under the same heading — the work was dropped, the parts were fitted.
    await this.laborRepo.delete({ id: lineId, work_order_id: id });
    await this.core.recompute(id);
    return this.core.loadFull(id);
  }

  // ---------------- parts ----------------

  async addPartLine(id: string, dto: CreatePartLineDto, viewer: Viewer): Promise<WorkOrder> {
    const wo = await this.core.assertOpen(id, viewer);
    const line = this.partRepo.create({
      work_order_id: wo.id,
      name: dto.name,
      catalog_number: dto.catalog_number ?? null,
      manufacturer: dto.manufacturer ?? null,
      part_template_id: dto.part_template_id ?? null,
      qty: dto.qty ?? 1,
      unit: dto.unit ?? 'pcs',
      unit_price: dto.unit_price,
      discount_type: dto.discount_type ?? null,
      discount_value: dto.discount_value ?? null,
      group_key: dto.group_key ?? null,
      group_name: dto.group_name ?? null,
      group_sort: dto.group_key ? this.groupSortOf(wo, dto.group_key) : 0,
      sort: nextSort(wo.part_lines),
    });
    await this.partRepo.save(line);
    await this.core.recompute(id);
    return this.core.loadFull(id);
  }

  async updatePartLine(
    id: string,
    lineId: string,
    dto: UpdatePartLineDto,
    viewer: Viewer,
  ): Promise<WorkOrder> {
    await this.core.assertOpen(id, viewer);
    const line = await this.partRepo.findOne({ where: { id: lineId, work_order_id: id } });
    if (!line) throw new NotFoundException('Строка запчасти не найдена');

    if (dto.name !== undefined) {
      if (!dto.name) throw new BadRequestException('Не указано название запчасти');
      line.name = dto.name;
    }
    if (dto.catalog_number !== undefined) line.catalog_number = dto.catalog_number ?? null;
    if (dto.manufacturer !== undefined) line.manufacturer = dto.manufacturer ?? null;
    if (dto.qty !== undefined) line.qty = dto.qty;
    if (dto.unit !== undefined) line.unit = dto.unit;
    if (dto.unit_price !== undefined) line.unit_price = dto.unit_price;
    if (dto.discount_type !== undefined) line.discount_type = dto.discount_type ?? null;
    if (dto.discount_value !== undefined) line.discount_value = dto.discount_value ?? null;

    await this.partRepo.save(line);
    await this.core.recompute(id);
    return this.core.loadFull(id);
  }

  async removePartLine(id: string, lineId: string, viewer: Viewer): Promise<WorkOrder> {
    await this.core.assertOpen(id, viewer);
    await this.partRepo.delete({ id: lineId, work_order_id: id });
    await this.core.recompute(id);
    return this.core.loadFull(id);
  }

  // ---------------- groups ----------------

  /** Rename a block — one UPDATE per table, no group rows to keep in sync. */
  async renameGroup(
    id: string,
    groupKey: string,
    name: string,
    viewer: Viewer,
  ): Promise<WorkOrder> {
    await this.core.assertOpen(id, viewer);
    const trimmed = name.trim();
    if (!trimmed) throw new BadRequestException('Не указано название блока');
    await this.laborRepo.update({ work_order_id: id, group_key: groupKey }, { group_name: trimmed });
    await this.partRepo.update({ work_order_id: id, group_key: groupKey }, { group_name: trimmed });
    return this.core.loadFull(id);
  }

  /** Move a block up or down relative to the others. */
  async moveGroup(
    id: string,
    groupKey: string,
    direction: 'up' | 'down',
    viewer: Viewer,
  ): Promise<WorkOrder> {
    const wo = await this.core.assertOpen(id, viewer);
    const order = this.groupOrder(wo);
    const index = order.findIndex((g) => g.key === groupKey);
    if (index < 0) throw new NotFoundException('Блок не найден');
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= order.length) return wo;

    const a = order[index];
    const b = order[target];
    await this.setGroupSort(id, a.key, b.sort);
    await this.setGroupSort(id, b.key, a.sort);
    return this.core.loadFull(id);
  }

  /** Detach a block: its lines stay, they just stop being grouped. */
  async ungroup(id: string, groupKey: string, viewer: Viewer): Promise<WorkOrder> {
    await this.core.assertOpen(id, viewer);
    const patch = { group_key: null, group_name: null, group_sort: 0 };
    await this.laborRepo.update({ work_order_id: id, group_key: groupKey }, patch);
    await this.partRepo.update({ work_order_id: id, group_key: groupKey }, patch);
    return this.core.loadFull(id);
  }

  // ---------------- template expansion ----------------

  /**
   * What applying a price-list entry to this car would add. Returned for
   * confirmation rather than inserted straight away: an unwanted part left in
   * by accident becomes a wrong quote handed to the customer.
   *
   * `generationId`: undefined → the car's own generation, null → the shared
   * base prices, uuid → that generation. Null is a deliberate choice («Базовые
   * цены») and must not be swapped back for the car's generation.
   */
  async previewTemplate(
    id: string,
    templateId: string,
    viewer: Viewer,
    generationId?: string | null,
  ): Promise<TemplatePreview> {
    const wo = await this.core.assertOpen(id, viewer);
    const tpl = await this.templates.findOne(templateId);
    if (generationId === undefined) generationId = wo.vehicle?.generation_id ?? null;
    const rate = await this.settings.getLaborRate();
    const resolved = await this.priceList.resolveForLine(templateId, generationId, rate);

    return {
      template_id: templateId,
      group_name: tpl.name,
      labor: {
        name: tpl.name,
        hours: resolved.hours,
        rate_snapshot: resolved.rate_snapshot,
        price_override: resolved.price_override,
      },
      price_source: resolved.source,
      parts: await this.resolveTemplateParts(templateId, generationId),
    };
  }

  /**
   * Insert the work and the chosen parts as ONE block, inside a transaction —
   * 1 + N inserts without one produce a half-built estimate if anything fails.
   */
  async applyTemplate(id: string, dto: ApplyTemplateDto, viewer: Viewer): Promise<WorkOrder> {
    const wo = await this.core.assertOpen(id, viewer);
    const preview = await this.previewTemplate(id, dto.template_id, viewer, dto.generation_id);

    const chosen = dto.part_template_ids
      ? preview.parts.filter((p) => dto.part_template_ids!.includes(p.part_template_id))
      : preview.parts.filter((p) => p.is_default);

    const groupKey = randomUUID();
    const groupSort = nextGroupSort(wo);
    let laborSort = nextSort(wo.labor_lines);
    let partSort = nextSort(wo.part_lines);

    await this.laborRepo.manager.transaction(async (m: EntityManager) => {
      await m.save(
        m.create(LaborLine, {
          work_order_id: id,
          template_id: dto.template_id,
          name: preview.labor.name,
          hours: preview.labor.hours,
          rate_snapshot: preview.labor.rate_snapshot,
          price_override: preview.labor.price_override,
          discount_type: null,
          discount_value: null,
          group_key: groupKey,
          group_name: preview.group_name,
          group_sort: groupSort,
          sort: laborSort++,
        }),
      );

      for (const part of chosen) {
        await m.save(
          m.create(PartLine, {
            work_order_id: id,
            name: part.name,
            manufacturer: part.manufacturer,
            catalog_number: part.catalog_number,
            part_template_id: part.part_template_id,
            qty: dto.qty?.[part.part_template_id] ?? part.qty,
            unit: part.unit as PartLine['unit'],
            unit_price: part.unit_price ?? 0,
            discount_type: null,
            discount_value: null,
            group_key: groupKey,
            group_name: preview.group_name,
            group_sort: groupSort,
            sort: partSort++,
          }),
        );
      }
    });

    await this.core.recompute(id);
    return this.core.loadFull(id);
  }

  /**
   * Universal rows always apply; a row naming this generation replaces the
   * universal row occupying the SAME slot («фильтр масляный»). Matching on
   * part_template_id cannot work — the R56 filter is a different catalog entry —
   * and replacing the whole set would silently drop the oil.
   */
  private async resolveTemplateParts(
    templateId: string,
    generationId: string | null,
  ): Promise<TemplatePartCandidate[]> {
    const universal = await this.templateParts.find({
      where: { task_template_id: templateId, generation_id: IsNull() },
    });
    const specific = generationId
      ? await this.templateParts.find({
          where: { task_template_id: templateId, generation_id: generationId },
        })
      : [];

    // Slotted rows compete for their slot; unslotted ones are keyed by the part
    // itself, so they can only ever replace an identical row.
    const key = (row: TaskTemplatePart) =>
      row.slot?.trim().toLowerCase() || `part:${row.part_template_id}`;

    const bySlot = new Map<string, { row: TaskTemplatePart; specific: boolean }>();
    for (const row of universal) bySlot.set(key(row), { row, specific: false });
    for (const row of specific) bySlot.set(key(row), { row, specific: true });

    return [...bySlot.values()].map(({ row, specific: isSpecific }) => ({
      part_template_id: row.part_template_id,
      name: row.part_template?.name ?? '',
      manufacturer: row.part_template?.manufacturer ?? null,
      catalog_number: row.part_template?.catalog_number ?? null,
      unit: row.part_template?.unit ?? 'pcs',
      qty: row.qty ?? 1,
      unit_price: row.part_template?.default_price ?? null,
      is_default: row.is_default,
      generation_specific: isSpecific,
    }));
  }

  /** Blocks in display order, with the sort value each one currently holds. */
  private groupOrder(wo: WorkOrder): { key: string; sort: number }[] {
    const seen = new Map<string, number>();
    for (const l of [...(wo.labor_lines ?? []), ...(wo.part_lines ?? [])]) {
      if (l.group_key && !seen.has(l.group_key)) seen.set(l.group_key, l.group_sort ?? 0);
    }
    return [...seen.entries()]
      .map(([key, sort]) => ({ key, sort }))
      .sort((a, b) => a.sort - b.sort);
  }

  private groupSortOf(wo: WorkOrder, groupKey: string): number {
    const found = [...(wo.labor_lines ?? []), ...(wo.part_lines ?? [])].find(
      (l) => l.group_key === groupKey,
    );
    return found?.group_sort ?? nextGroupSort(wo);
  }

  private async setGroupSort(id: string, groupKey: string, sort: number): Promise<void> {
    await this.laborRepo.update({ work_order_id: id, group_key: groupKey }, { group_sort: sort });
    await this.partRepo.update({ work_order_id: id, group_key: groupKey }, { group_sort: sort });
  }
}
