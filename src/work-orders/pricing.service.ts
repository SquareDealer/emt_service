import { Injectable } from '@nestjs/common';

export type DiscountType = 'percent' | 'fixed';

/** Anything carrying a per-line discount. */
export interface DiscountableLike {
  discount_type?: DiscountType | null;
  discount_value?: number | null;
}

export interface LaborLineLike extends DiscountableLike {
  hours?: number | null;
  rate_snapshot: number;
  price_override?: number | null;
}

export interface PartLineLike extends DiscountableLike {
  qty: number;
  unit_price: number;
}

/**
 * Pure estimate math — no DB. Single source of truth for the smeta.
 *
 * Vocabulary (mirrored in client/src/lib/format.ts — keep the two in step; the
 * shared fixture table in pricing-fixtures.json fails one suite if they drift):
 *
 *   gross(line)      price_override ?? hours × rate_snapshot   (labor, AC-8 snapshot)
 *                    qty × unit_price                          (part)
 *   lineDiscount     percent → round2(gross × pct/100); fixed → capped at gross
 *   net(line)        gross − lineDiscount
 *   netSubtotal      Σ net
 *   total            round2(netSubtotal − order discount)      (AC-4)
 *
 * Line and order discounts STACK: the order discount applies to what is left
 * after the per-line ones, so 10% + 10% is 19%, not 20%.
 *
 * Rounding: only the per-line discount and the final total are rounded. Line
 * gross values stay full precision (1.5 × 333.33 = 499.995 → total 500), but the
 * discount is rounded per line so the printed «Скидка» column adds up.
 */
@Injectable()
export class PricingService {
  round2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  /** Labor line before any discount. */
  laborLineGross(line: LaborLineLike): number {
    if (line.price_override !== null && line.price_override !== undefined) {
      return line.price_override;
    }
    return (line.hours ?? 0) * line.rate_snapshot;
  }

  /** Part line before any discount. */
  partLineGross(line: PartLineLike): number {
    return line.qty * line.unit_price;
  }

  /** Discount amount for one line — never more than the line itself. */
  lineDiscount(gross: number, line: DiscountableLike): number {
    const { discount_type: type, discount_value: value } = line;
    if (!type || value === null || value === undefined) return 0;
    if (type === 'percent') {
      const pct = Math.min(Math.max(value, 0), 100);
      return this.round2((gross * pct) / 100);
    }
    return Math.min(Math.max(value, 0), Math.max(gross, 0));
  }

  /** What the line actually costs — this is the «Сумма» column. */
  laborLineTotal(line: LaborLineLike): number {
    const gross = this.laborLineGross(line);
    return gross - this.lineDiscount(gross, line);
  }

  partLineTotal(line: PartLineLike): number {
    const gross = this.partLineGross(line);
    return gross - this.lineDiscount(gross, line);
  }

  /** Σ of labor lines before discounts — the «Стоимость работ» figure. */
  laborGross(labor: LaborLineLike[]): number {
    return labor.reduce((s, x) => s + this.laborLineGross(x), 0);
  }

  /** Σ of part lines before discounts — the «Стоимость запчастей» figure. */
  partsGross(parts: PartLineLike[]): number {
    return parts.reduce((s, x) => s + this.partLineGross(x), 0);
  }

  /** Everything before any discount. */
  grossTotal(labor: LaborLineLike[], parts: PartLineLike[]): number {
    return this.laborGross(labor) + this.partsGross(parts);
  }

  /** Σ of the per-line discounts (shown separately from the order discount). */
  lineDiscountTotal(labor: LaborLineLike[], parts: PartLineLike[]): number {
    const l = labor.reduce((s, x) => s + this.lineDiscount(this.laborLineGross(x), x), 0);
    const p = parts.reduce((s, x) => s + this.lineDiscount(this.partLineGross(x), x), 0);
    return l + p;
  }

  /**
   * Σ of line totals — what the order discount is then applied to. Also the
   * per-group figure once the estimate is split into blocks.
   */
  netSubtotal(labor: LaborLineLike[], parts: PartLineLike[]): number {
    const l = labor.reduce((s, x) => s + this.laborLineTotal(x), 0);
    const p = parts.reduce((s, x) => s + this.partLineTotal(x), 0);
    return l + p;
  }

  /** Kept for callers that only need the pre-discount sum. */
  subtotal(labor: LaborLineLike[], parts: PartLineLike[]): number {
    return this.grossTotal(labor, parts);
  }

  /** Value remaining after the order-level discount. */
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

  /** How much the order-level discount takes off, after per-line discounts. */
  orderDiscountAmount(
    labor: LaborLineLike[],
    parts: PartLineLike[],
    type?: DiscountType | null,
    value?: number | null,
  ): number {
    const net = this.netSubtotal(labor, parts);
    return net - this.applyDiscount(net, type, value);
  }

  computeTotal(
    labor: LaborLineLike[],
    parts: PartLineLike[],
    type?: DiscountType | null,
    value?: number | null,
  ): number {
    return this.round2(this.applyDiscount(this.netSubtotal(labor, parts), type, value));
  }

  /**
   * The documents' «Сумма скидок». Derived from the ROUNDED group figures the
   * documents actually print, so that on paper
   *   Стоимость работ + Стоимость запчастей − Сумма скидок === Итого
   * holds exactly rather than to within a kopeck.
   */
  discountSum(
    labor: LaborLineLike[],
    parts: PartLineLike[],
    type?: DiscountType | null,
    value?: number | null,
  ): number {
    const printedGross = this.round2(this.laborGross(labor)) + this.round2(this.partsGross(parts));
    return this.round2(printedGross - this.computeTotal(labor, parts, type, value));
  }
}
