import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { WorkOrder } from '../entities/work-order.entity';
import { PartLine } from '../entities/part-line.entity';
import { PricingService } from '../work-orders/pricing.service';
import {
  AnalyticsOrder,
  Breakdown,
  Bucket,
  Totals,
  breakdown,
  buckets,
  toAnalyticsOrder,
  totals,
} from './analytics-calc';

export interface AnalyticsSummary {
  totals: Totals;
  previous: Totals | null;
  buckets: Bucket[];
  breakdown: Breakdown;
}

export interface MissingCostRow {
  part_line_id: string; work_order_id: string; doc_number: number | null; closed_at: string;
  vehicle: string; client: string; name: string; manufacturer: string | null;
  qty: number; unit: 'pcs' | 'l'; net: number;
}
export interface PartCostRow {
  part_line_id: string; name: string; manufacturer: string | null;
  qty: number; unit: 'pcs' | 'l'; purchase_price: number | null;
}

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(WorkOrder) private readonly repo: Repository<WorkOrder>,
    @InjectRepository(PartLine) private readonly partRepo: Repository<PartLine>,
    private readonly pricing: PricingService,
  ) {}

  /** Закрытые наряды с closed_at в [from, to), со строками и закупкой. */
  async loadClosed(from: Date, to: Date): Promise<AnalyticsOrder[]> {
    const rows = await this.repo
      .createQueryBuilder('wo')
      .leftJoinAndSelect('wo.labor_lines', 'labor')
      .leftJoinAndSelect('wo.part_lines', 'part')
      .addSelect('part.purchase_price')
      .leftJoinAndSelect('wo.vehicle', 'vehicle')
      .leftJoinAndSelect('vehicle.client', 'client')
      .where("wo.status = 'closed'")
      .andWhere('wo.closed_at >= :from AND wo.closed_at < :to', { from, to })
      .getMany();
    return rows.map((wo) => toAnalyticsOrder(wo, this.pricing));
  }

  async summary(
    edges: Date[],
    prev: { from: Date; to: Date } | null,
  ): Promise<AnalyticsSummary> {
    const from = edges[0];
    const to = edges[edges.length - 1];
    const loadFrom = prev && prev.from < from ? prev.from : from;
    const loadTo = prev && prev.to > to ? prev.to : to;
    const all = await this.loadClosed(loadFrom, loadTo);

    const inRange = (o: AnalyticsOrder, a: Date, b: Date) =>
      o.closed_at.getTime() >= a.getTime() && o.closed_at.getTime() < b.getTime();
    const current = all.filter((o) => inRange(o, from, to));
    const previous = prev ? all.filter((o) => inRange(o, prev.from, prev.to)) : null;

    return {
      totals: totals(current),
      previous: previous ? totals(previous) : null,
      buckets: buckets(current, edges),
      breakdown: breakdown(current),
    };
  }

  /** Запчасти закрытых нарядов периода без закупки; новые наряды сверху. */
  async missingCosts(from: Date, to: Date): Promise<MissingCostRow[]> {
    const orders = await this.loadClosed(from, to);
    const sorted = [...orders].sort((a, b) => b.closed_at.getTime() - a.closed_at.getTime());
    const rows: MissingCostRow[] = [];
    for (const o of sorted) {
      for (const p of o.parts) {
        if (p.cost !== null) continue;
        rows.push({
          part_line_id: p.id,
          work_order_id: o.id,
          doc_number: o.doc_number,
          closed_at: o.closed_at.toISOString(),
          vehicle: o.vehicle,
          client: o.client.name,
          name: p.name,
          manufacturer: p.manufacturer,
          qty: p.qty,
          unit: p.unit,
          net: p.net,
        });
      }
    }
    return rows;
  }

  /** Закупки всех запчастей одного наряда (любой статус) — для правки введённого. */
  async partCosts(workOrderId: string): Promise<PartCostRow[]> {
    const wo = await this.repo.findOne({ where: { id: workOrderId }, select: { id: true } });
    if (!wo) throw new NotFoundException('Заказ-наряд не найден');
    const lines = await this.partRepo
      .createQueryBuilder('p')
      .addSelect('p.purchase_price')
      .where('p.work_order_id = :id', { id: workOrderId })
      .orderBy('p.group_sort', 'ASC')
      .addOrderBy('p.sort', 'ASC')
      .addOrderBy('p.created_at', 'ASC')
      .getMany();
    return lines.map((p) => ({
      part_line_id: p.id,
      name: p.name,
      manufacturer: p.manufacturer ?? null,
      qty: p.qty,
      unit: p.unit,
      purchase_price: p.purchase_price ?? null,
    }));
  }

  /**
   * Пишет закупки одной транзакцией. Мимо assertOpen намеренно: закупка не часть
   * сметы, total_frozen не трогаем.
   */
  async setPartCosts(
    items: { part_line_id: string; purchase_price: number | null }[],
  ): Promise<{ updated: number }> {
    const ids = items.map((i) => i.part_line_id);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('part_line_id повторяется');
    }
    const found = await this.partRepo.find({ where: { id: In(ids) }, select: { id: true } });
    const known = new Set(found.map((p) => p.id));
    const missing = ids.filter((id) => !known.has(id));
    if (missing.length > 0) {
      throw new NotFoundException(`Строка запчасти не найдена: ${missing.join(', ')}`);
    }
    await this.partRepo.manager.transaction(async (m) => {
      for (const i of items) {
        await m.update(PartLine, i.part_line_id, { purchase_price: i.purchase_price });
      }
    });
    return { updated: items.length };
  }
}
