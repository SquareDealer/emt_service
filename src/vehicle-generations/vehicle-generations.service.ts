import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VehicleGeneration } from '../entities/vehicle-generation.entity';

export interface GenerationInput {
  make: string;
  model: string;
  code?: string | null;
  years?: string | null;
  sort?: number;
  active?: boolean;
}

@Injectable()
export class VehicleGenerationsService {
  constructor(
    @InjectRepository(VehicleGeneration)
    private readonly repo: Repository<VehicleGeneration>,
  ) {}

  findAll(includeInactive = false): Promise<VehicleGeneration[]> {
    return this.repo.find({
      where: includeInactive ? {} : { active: true },
      order: { make: 'ASC', sort: 'ASC', model: 'ASC' },
    });
  }

  async findOne(id: string): Promise<VehicleGeneration> {
    const g = await this.repo.findOne({ where: { id } });
    if (!g) throw new NotFoundException('Поколение не найдено');
    return g;
  }

  async create(dto: GenerationInput): Promise<VehicleGeneration> {
    const row = this.repo.create(this.normalize(dto));
    await this.assertUnique(row);
    return this.repo.save(row);
  }

  async update(id: string, dto: Partial<GenerationInput>): Promise<VehicleGeneration> {
    const g = await this.findOne(id);
    Object.assign(g, this.normalize({ ...g, ...dto } as GenerationInput));
    await this.assertUnique(g, id);
    return this.repo.save(g);
  }

  /**
   * Retire rather than delete: vehicles reference generations, and historic
   * documents must keep rendering. `active: false` hides it from the pickers.
   */
  async deactivate(id: string): Promise<VehicleGeneration> {
    const g = await this.findOne(id);
    g.active = false;
    return this.repo.save(g);
  }

  private normalize(dto: GenerationInput): GenerationInput {
    const make = dto.make?.trim();
    const model = dto.model?.trim();
    if (!make) throw new BadRequestException('Не указана марка');
    if (!model) throw new BadRequestException('Не указана модель');
    return {
      make,
      model,
      code: dto.code?.trim() || null,
      years: dto.years?.trim() || null,
      sort: dto.sort ?? 0,
      active: dto.active ?? true,
    };
  }

  /**
   * Mirrors the case-folded unique index, so the user gets a readable message
   * instead of a raw 23505 from Postgres.
   */
  private async assertUnique(row: GenerationInput, exceptId?: string): Promise<void> {
    const clash = await this.repo
      .createQueryBuilder('g')
      .where('lower(g.make) = lower(:make)', { make: row.make })
      .andWhere('lower(g.model) = lower(:model)', { model: row.model })
      .andWhere("lower(coalesce(g.code, '')) = lower(coalesce(:code, ''))", {
        code: row.code ?? null,
      })
      .andWhere(exceptId ? 'g.id <> :exceptId' : '1=1', { exceptId })
      .getOne();
    if (clash) throw new BadRequestException('Такое поколение уже есть в справочнике');
  }
}
