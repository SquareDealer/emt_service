import { Injectable } from '@nestjs/common';

export interface LaborLineLike {
  hours?: number | null;
  rate_snapshot: number;
  price_override?: number | null;
}

export interface PartLineLike {
  qty: number;
  unit_price: number;
}

export type DiscountType = 'percent' | 'fixed';

/**
 * Pure estimate math — no DB. Single source of truth for the smeta:
 *   labor line = price_override ?? hours × rate_snapshot   (snapshot, AC-8)
 *   part line  = qty × unit_price
 *   total      = (Σ labor + Σ parts) − order-level discount  (AC-4)
 */
@Injectable()
export class PricingService {
  round2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  laborLineTotal(line: LaborLineLike): number {
    if (line.price_override !== null && line.price_override !== undefined) {
      return line.price_override;
    }
    return (line.hours ?? 0) * line.rate_snapshot;
  }

  partLineTotal(line: PartLineLike): number {
    return line.qty * line.unit_price;
  }

  subtotal(labor: LaborLineLike[], parts: PartLineLike[]): number {
    const l = labor.reduce((s, x) => s + this.laborLineTotal(x), 0);
    const p = parts.reduce((s, x) => s + this.partLineTotal(x), 0);
    return l + p;
  }

  applyDiscount(
    subtotal: number,
    type?: DiscountType | null,
    value?: number | null,
  ): number {
    if (!type || value === null || value === undefined) return subtotal;
    if (type === 'percent') {
      const pct = Math.min(Math.max(value, 0), 100);
      return subtotal * (1 - pct / 100);
    }
    // fixed — never go below zero
    return Math.max(0, subtotal - value);
  }

  computeTotal(
    labor: LaborLineLike[],
    parts: PartLineLike[],
    type?: DiscountType | null,
    value?: number | null,
  ): number {
    return this.round2(this.applyDiscount(this.subtotal(labor, parts), type, value));
  }
}
