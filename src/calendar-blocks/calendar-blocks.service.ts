import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { CalendarBlock } from '../entities/calendar-block.entity';
import { Viewer } from '../work-orders/work-orders.service';

export interface CreateBlockInput {
  title?: string | null;
  starts_at: string;
  duration_min: number;
  user_id?: string | null;
  notes?: string | null;
}

export type UpdateBlockInput = Partial<CreateBlockInput>;

@Injectable()
export class CalendarBlocksService {
  constructor(
    @InjectRepository(CalendarBlock)
    private readonly repo: Repository<CalendarBlock>,
  ) {}

  /**
   * Blocks OVERLAPPING [from, to) — not blocks *starting* in it. A three-day
   * «отпуск» beginning on Monday must still show on Wednesday, and work_orders'
   * start-only filter is a latent bug of the same shape.
   */
  async range(from: string | undefined, to: string | undefined, viewer: Viewer): Promise<CalendarBlock[]> {
    const fromDate = from ? new Date(from) : new Date('1970-01-01');
    const toDate = to ? new Date(to) : new Date('2999-01-01');
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      throw new BadRequestException('Некорректный диапазон дат');
    }

    const qb = this.repo
      .createQueryBuilder('b')
      .leftJoin('b.user', 'u')
      .addSelect(['u.id', 'u.name'])
      .where('b.starts_at < :toDate', { toDate })
      .andWhere(
        `b.starts_at + (b.duration_min * interval '1 minute') > :fromDate`,
        { fromDate },
      );
    return this.scope(qb, viewer).orderBy('b.starts_at', 'ASC').getMany();
  }

  async create(dto: CreateBlockInput, viewer: Viewer): Promise<CalendarBlock> {
    const owner = this.resolveOwner(dto.user_id ?? null, viewer);
    const block = this.repo.create({
      title: dto.title?.trim() || null,
      starts_at: this.parseStart(dto.starts_at),
      duration_min: this.parseDuration(dto.duration_min),
      user_id: owner,
      notes: dto.notes?.trim() || null,
      created_by: viewer.id,
    });
    await this.repo.save(block);
    return this.findOne(block.id, viewer);
  }

  async update(id: string, dto: UpdateBlockInput, viewer: Viewer): Promise<CalendarBlock> {
    const block = await this.findOne(id, viewer);
    this.assertWritable(block.user_id, viewer);

    if (dto.title !== undefined) block.title = dto.title?.trim() || null;
    if (dto.notes !== undefined) block.notes = dto.notes?.trim() || null;
    if (dto.starts_at !== undefined) block.starts_at = this.parseStart(dto.starts_at);
    if (dto.duration_min !== undefined) block.duration_min = this.parseDuration(dto.duration_min);
    if (dto.user_id !== undefined) {
      block.user_id = this.resolveOwner(dto.user_id ?? null, viewer);
    }
    // The loaded relation would otherwise win over the changed FK column on save.
    delete (block as Partial<CalendarBlock>).user;
    await this.repo.save(block);
    return this.findOne(id, viewer);
  }

  async remove(id: string, viewer: Viewer): Promise<void> {
    const block = await this.findOne(id, viewer);
    this.assertWritable(block.user_id, viewer);
    await this.repo.delete(id);
  }

  async findOne(id: string, viewer: Viewer): Promise<CalendarBlock> {
    const qb = this.repo
      .createQueryBuilder('b')
      .leftJoin('b.user', 'u')
      .addSelect(['u.id', 'u.name'])
      .where('b.id = :id', { id });
    const block = await this.scope(qb, viewer).getOne();
    if (!block) throw new NotFoundException('Запись не найдена');
    return block;
  }

  /**
   * Visibility is NOT the work-order rule (`assigned to me`). A shop-wide block
   * means everyone is busy, so a plain master has to see it — otherwise they
   * double-book the reserved lift. They just cannot see another master's
   * personal blocks.
   */
  private scope(
    qb: SelectQueryBuilder<CalendarBlock>,
    viewer: Viewer,
  ): SelectQueryBuilder<CalendarBlock> {
    if (viewer.role === 'master') {
      qb.andWhere('(b.user_id IS NULL OR b.user_id = :viewerId)', { viewerId: viewer.id });
    }
    return qb;
  }

  /** A master's blocks are always their own; only owner/receptionist book the shop. */
  private resolveOwner(requested: string | null, viewer: Viewer): string | null {
    if (viewer.role === 'master') return viewer.id;
    return requested;
  }

  private assertWritable(ownerId: string | null, viewer: Viewer): void {
    if (viewer.role !== 'master') return;
    if (ownerId !== viewer.id) {
      throw new ForbiddenException('Можно менять только свои резервные записи');
    }
  }

  private parseStart(value: string): Date {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) throw new BadRequestException('Некорректное время начала');
    return d;
  }

  private parseDuration(value: number): number {
    if (!Number.isFinite(value) || value < 5 || value > 60 * 24 * 30) {
      throw new BadRequestException('Некорректная длительность');
    }
    return Math.round(value);
  }
}
