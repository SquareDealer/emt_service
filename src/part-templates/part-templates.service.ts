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
  active?: boolean;
}

const LIMIT = 100;

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
  async findAll(q?: string, includeInactive = false): Promise<PartTemplate[]> {
    const qb = this.repo.createQueryBuilder('p');
    if (!includeInactive) qb.where('p.active = true');
    const term = (q ?? '').trim();
    if (term) {
      const like = `%${term}%`;
      qb.andWhere(
        '(p.name ILIKE :like OR p.catalog_number ILIKE :like OR p.manufacturer ILIKE :like)',
        { like },
      );
    }
    return qb.orderBy('p.name', 'ASC').limit(LIMIT).getMany();
  }

  async findOne(id: string): Promise<PartTemplate> {
    const t = await this.repo.findOne({ where: { id } });
    if (!t) throw new NotFoundException('Запчасть не найдена в каталоге');
    return t;
  }

  create(dto: PartTemplateInput): Promise<PartTemplate> {
    return this.repo.save(this.repo.create(this.normalize(dto)));
  }

  async update(id: string, dto: Partial<PartTemplateInput>): Promise<PartTemplate> {
    const t = await this.findOne(id);
    Object.assign(t, this.normalize({ ...t, ...dto } as PartTemplateInput));
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
