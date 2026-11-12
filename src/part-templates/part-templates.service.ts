import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PartTemplate } from '../entities/part-template.entity';
import { PartUnit } from '../entities/part-line.entity';

export interface PartTemplateInput {
  name: string;
  manufacturer?: string | null;
  catalog_number?: string | null;
  unit?: PartUnit;
  default_price?: number | null;
  /** Owner-only; kept out of normalize() so an edit by a receptionist never overwrites it. */
  purchase_price?: number | null;
  active?: boolean;
}

/** The part picker lists the whole catalog and filters it locally, so the page
 *  must be large enough to hold it — at 100 the tail was silently cut off. */
export const PART_TEMPLATES_LIMIT = 500;

@Injectable()
export class PartTemplatesService {
  constructor(
    @InjectRepository(PartTemplate)
    private readonly repo: Repository<PartTemplate>,
  ) {}

  /**
   * Search across name, article and brand — a parts catalog you cannot search
   * by article is unusable. Backed by the trigram indexes from the migration.
   */
  async findAll(
    q?: string,
    includeInactive = false,
    withCost = false,
  ): Promise<PartTemplate[]> {
    const qb = this.repo.createQueryBuilder('p');
    // purchase_price is select:false — it only comes back when asked for.
    if (withCost) qb.addSelect('p.purchase_price');
    if (!includeInactive) qb.where('p.active = true');
    const term = (q ?? '').trim();
    if (term) {
      const like = `%${term}%`;
      qb.andWhere(
        '(p.name ILIKE :like OR p.catalog_number ILIKE :like OR p.manufacturer ILIKE :like)',
        { like },
      );
    }
    return qb.orderBy('p.name', 'ASC').limit(PART_TEMPLATES_LIMIT).getMany();
  }

  async findOne(id: string, withCost = false): Promise<PartTemplate> {
    const qb = this.repo.createQueryBuilder('p').where('p.id = :id', { id });
    if (withCost) qb.addSelect('p.purchase_price');
    const t = await qb.getOne();
    if (!t) throw new NotFoundException('Запчасть не найдена в каталоге');
    return t;
  }

  create(dto: PartTemplateInput): Promise<PartTemplate> {
    const t = this.repo.create(this.normalize(dto));
    if (dto.purchase_price !== undefined) t.purchase_price = dto.purchase_price;
    return this.repo.save(t);
  }

  async update(id: string, dto: Partial<PartTemplateInput>): Promise<PartTemplate> {
    const t = await this.findOne(id);
    Object.assign(t, this.normalize({ ...t, ...dto } as PartTemplateInput));
    // Only touch the cost when the caller sent it: t was loaded without the column.
    if (dto.purchase_price !== undefined) t.purchase_price = dto.purchase_price;
    return this.repo.save(t);
  }

  /**
   * Retire instead of deleting: estimate lines keep a link to the catalog entry,
   * and historic orders must not lose it.
   */
  async deactivate(id: string): Promise<PartTemplate> {
    const t = await this.findOne(id);
    t.active = false;
    return this.repo.save(t);
  }

  /** Purchase price by catalog id (null when unset or the id is unknown). */
  async purchasePrices(ids: string[]): Promise<Map<string, number | null>> {
    const out = new Map<string, number | null>();
    if (ids.length === 0) return out;
    const rows = await this.repo
      .createQueryBuilder('p')
      .select('p.id')
      .addSelect('p.purchase_price')
      .where('p.id IN (:...ids)', { ids })
      .getMany();
    for (const r of rows) out.set(r.id, r.purchase_price ?? null);
    return out;
  }

  count(): Promise<number> {
    return this.repo.count();
  }

  private normalize(dto: PartTemplateInput): PartTemplateInput {
    return {
      name: dto.name.trim(),
      manufacturer: dto.manufacturer?.trim() || null,
      catalog_number: dto.catalog_number?.trim() || null,
      unit: dto.unit ?? 'pcs',
      // Explicit null, never undefined — numericTransformer would otherwise
      // write NULL anyway, and this keeps the intent visible.
      default_price: dto.default_price ?? null,
      active: dto.active ?? true,
    };
  }
}
