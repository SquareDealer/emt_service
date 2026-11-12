import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkOrder } from '../entities/work-order.entity';
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

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(WorkOrder) private readonly repo: Repository<WorkOrder>,
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
}
