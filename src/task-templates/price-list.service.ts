import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { TaskTemplate } from '../entities/task-template.entity';
import { TemplateGenerationPrice } from '../entities/template-generation-price.entity';
import { TaskTemplatePart } from '../entities/task-template-part.entity';
import { VehicleGeneration } from '../entities/vehicle-generation.entity';
import { SettingsService } from '../settings/settings.service';
import { PriceResolutionService, PriceSource, ResolvedPrice } from './price-resolution.service';

export interface PriceListRow {
  template: TaskTemplate;
  /** The shared base — what applies when a generation has no row of its own. */
  base: { hours: number | null; price: number | null };
  /** This generation's override, or null when it inherits. */
  override: { hours: number | null; price: number | null } | null;
  /** What the shop actually charges, plus where the figure came from. */
  effective: { hours: number | null; price: number | null; source: PriceSource };
  /** How many parts this work pulls in — universal plus this generation's. */
  parts_count: number;
}

export interface CopyResult {
  copied: number;
  skipped: number;
}

@Injectable()
export class PriceListService {
  constructor(
    @InjectRepository(TaskTemplate)
    private readonly templates: Repository<TaskTemplate>,
    @InjectRepository(TemplateGenerationPrice)
    private readonly prices: Repository<TemplateGenerationPrice>,
    @InjectRepository(VehicleGeneration)
    private readonly generations: Repository<VehicleGeneration>,
    @InjectRepository(TaskTemplatePart)
    private readonly templateParts: Repository<TaskTemplatePart>,
    private readonly settings: SettingsService,
    private readonly resolution: PriceResolutionService,
  ) {}

  /** The whole works list as priced for one generation (or the bare base). */
  async list(generationId?: string): Promise<PriceListRow[]> {
    if (generationId) await this.assertGeneration(generationId);
    const rate = await this.settings.getLaborRate();
    const templates = await this.templates.find({
      where: { active: true },
      order: { name: 'ASC' },
    });
    const overrides = generationId
      ? await this.prices.find({ where: { generation_id: generationId } })
      : [];
    const byTemplate = new Map(overrides.map((o) => [o.template_id, o]));

    // One query for every template, so the screen shows at a glance which works
    // already pull parts in.
    const partCounts = await this.countPartsByTemplate(generationId);

    return templates.map((t) => {
      const o = byTemplate.get(t.id) ?? null;
      return {
        template: t,
        base: { hours: t.default_hours, price: t.default_price },
        override: o ? { hours: o.hours, price: o.price } : null,
        effective: this.resolution.effective(t, o, rate),
        parts_count: partCounts.get(t.id) ?? 0,
      };
    });
  }

  /** Set (or replace) one generation's price for one work. */
  async setPrice(
    templateId: string,
    generationId: string,
    body: { hours?: number | null; price?: number | null },
  ): Promise<TemplateGenerationPrice> {
    await this.assertGeneration(generationId);
    const existing = await this.prices.findOne({
      where: { template_id: templateId, generation_id: generationId },
    });
    const row =
      existing ??
      this.prices.create({ template_id: templateId, generation_id: generationId });
    row.hours = body.hours ?? null;
    row.price = body.price ?? null;
    return this.prices.save(row);
  }

  /** Drop the override so the work falls back to the shared base price. */
  async clearPrice(templateId: string, generationId: string): Promise<void> {
    await this.prices.delete({ template_id: templateId, generation_id: generationId });
  }

  /**
   * Bulk fill — the one thing that makes a 15-generations × N-works grid
   * maintainable by hand. 'replace' overwrites the target's own prices;
   * 'fill' only adds where the target has nothing yet.
   */
  async copy(
    fromGenerationId: string,
    toGenerationId: string,
    mode: 'replace' | 'fill' = 'fill',
  ): Promise<CopyResult> {
    if (fromGenerationId === toGenerationId) {
      throw new BadRequestException('Выберите разные поколения');
    }
    await this.assertGeneration(fromGenerationId);
    await this.assertGeneration(toGenerationId);

    const source = await this.prices.find({ where: { generation_id: fromGenerationId } });
    const target = await this.prices.find({ where: { generation_id: toGenerationId } });
    const existing = new Map(target.map((t) => [t.template_id, t]));

    let copied = 0;
    let skipped = 0;
    for (const src of source) {
      const found = existing.get(src.template_id);
      if (found && mode === 'fill') {
        skipped += 1;
        continue;
      }
      const row =
        found ??
        this.prices.create({ template_id: src.template_id, generation_id: toGenerationId });
      row.hours = src.hours;
      row.price = src.price;
      await this.prices.save(row);
      copied += 1;
    }
    return { copied, skipped };
  }

  /**
   * The figures a new labor line should start from, for the vehicle's
   * generation. Falls back cleanly when the car is not in the catalog.
   */
  async resolveForLine(
    templateId: string,
    generationId: string | null,
    laborRate: number,
  ): Promise<ResolvedPrice> {
    const template = await this.templates.findOne({ where: { id: templateId } });
    const override = generationId
      ? await this.prices.findOne({
          where: { template_id: templateId, generation_id: generationId },
        })
      : null;
    return this.resolution.resolve(template, override, laborRate);
  }

  // ---------------- parts attached to a work ----------------

  /**
   * The parts a work pulls in. `generation_id: null` rows are universal; a row
   * naming a generation supersedes its universal twin when the estimate is
   * built (see WorkOrderLinesService).
   */
  listParts(templateId: string): Promise<TaskTemplatePart[]> {
    return this.templateParts.find({
      where: { task_template_id: templateId },
      order: { generation_id: 'ASC' },
    });
  }

  async attachPart(
    templateId: string,
    partTemplateId: string,
    body: { generation_id?: string | null; qty?: number | null; is_default?: boolean; slot?: string | null },
  ): Promise<TaskTemplatePart> {
    const generationId = body.generation_id ?? null;
    if (generationId) await this.assertGeneration(generationId);

    const existing = await this.templateParts.findOne({
      where: {
        task_template_id: templateId,
        part_template_id: partTemplateId,
        generation_id: generationId === null ? IsNull() : generationId,
      },
    });
    const row =
      existing ??
      this.templateParts.create({
        task_template_id: templateId,
        part_template_id: partTemplateId,
        generation_id: generationId,
      });
    row.qty = body.qty ?? null;
    row.is_default = body.is_default ?? true;
    row.slot = body.slot?.trim() || null;
    return this.templateParts.save(row);
  }

  async detachPart(
    templateId: string,
    partTemplateId: string,
    generationId: string | null,
  ): Promise<void> {
    await this.templateParts.delete({
      task_template_id: templateId,
      part_template_id: partTemplateId,
      generation_id: generationId === null ? IsNull() : generationId,
    });
  }

  /**
   * Parts per template, counted the way the estimate will resolve them:
   * universal rows plus this generation's, with a generation row replacing the
   * universal one sharing its slot.
   */
  private async countPartsByTemplate(generationId?: string): Promise<Map<string, number>> {
    const qb = this.templateParts
      .createQueryBuilder('ttp')
      .where('ttp.generation_id IS NULL');
    if (generationId) {
      qb.orWhere('ttp.generation_id = :generationId', { generationId });
    }
    const rows = await qb.getMany();

    const perTemplate = new Map<string, Set<string>>();
    for (const row of rows) {
      const slot = row.slot?.trim().toLowerCase() || `part:${row.part_template_id}`;
      const set = perTemplate.get(row.task_template_id) ?? new Set<string>();
      set.add(slot);
      perTemplate.set(row.task_template_id, set);
    }
    return new Map([...perTemplate].map(([id, set]) => [id, set.size]));
  }

  private async assertGeneration(id: string): Promise<void> {
    const found = await this.generations.findOne({ where: { id } });
    if (!found) throw new BadRequestException('Поколение не найдено в справочнике');
  }
}
