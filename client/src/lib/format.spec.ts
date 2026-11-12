import { describe, expect, it } from 'vitest';
import fixtures from './pricing-fixtures.json';
import {
  discountAmount,
  laborGross,
  laborTotal,
  lineDiscountTotal,
  orderTotal,
  partGross,
  partTotal,
  subtotal,
  vehicleLabel,
  clientDeals,
} from './format';
import type { LaborLine, PartLine, WorkOrder } from './types';

/**
 * The estimate math here mirrors the server's PricingService. Both suites read
 * the SAME fixture table, so if the two implementations drift, one of them fails
 * instead of the screen quietly disagreeing with the printed invoice.
 *
 * The table lives here, inside the client, because the client's Docker build
 * context is ./client — a file at the repo root is simply absent there, and
 * `npm run build` (tsc --noEmit && vite build) typechecks this spec.
 */

interface Fixture {
  name: string;
  labor: Partial<LaborLine>[];
  parts: Partial<PartLine>[];
  order: { type: 'percent' | 'fixed'; value: number } | null;
  expect: {
    laborGross: number;
    partsGross: number;
    lineDiscountTotal: number;
    orderDiscountAmount: number;
    total: number;
    discountSum: number;
  };
}

const cases = (fixtures as { cases: Fixture[] }).cases;

/** Build the WorkOrder shape the client helpers expect from a fixture row. */
function woFrom(c: Fixture): WorkOrder {
  return {
    labor_lines: c.labor.map((l, i) => ({
      id: `l${i}`,
      work_order_id: 'wo',
      template_id: null,
      name: 'работа',
      hours: l.hours ?? null,
      rate_snapshot: l.rate_snapshot ?? 0,
      price_override: l.price_override ?? null,
      discount_type: l.discount_type ?? null,
      discount_value: l.discount_value ?? null,
      sort: i,
    })) as LaborLine[],
    part_lines: c.parts.map((p, i) => ({
      id: `p${i}`,
      work_order_id: 'wo',
      name: 'деталь',
      catalog_number: null,
      manufacturer: null,
      qty: p.qty ?? 0,
      unit: 'pcs',
      unit_price: p.unit_price ?? 0,
      discount_type: p.discount_type ?? null,
      discount_value: p.discount_value ?? null,
      sort: i,
    })) as PartLine[],
    discount_type: c.order?.type ?? null,
    discount_value: c.order?.value ?? null,
  } as WorkOrder;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

describe('estimate math mirrors the server (shared fixtures)', () => {
  for (const c of cases) {
    it(c.name, () => {
      const wo = woFrom(c);
      const laborSum = (wo.labor_lines ?? []).reduce((s, l) => s + laborGross(l), 0);
      const partsSum = (wo.part_lines ?? []).reduce((s, p) => s + partGross(p), 0);

      expect(laborSum).toBeCloseTo(c.expect.laborGross, 6);
      expect(partsSum).toBeCloseTo(c.expect.partsGross, 6);
      expect(subtotal(wo)).toBeCloseTo(c.expect.laborGross + c.expect.partsGross, 6);
      expect(lineDiscountTotal(wo)).toBeCloseTo(c.expect.lineDiscountTotal, 6);
      expect(discountAmount(wo)).toBeCloseTo(c.expect.orderDiscountAmount, 6);
      expect(orderTotal(wo)).toBe(c.expect.total);
    });
  }

  it('the summary reconciles for every fixture', () => {
    // What the panel shows: работы+запчасти − скидки по строкам − скидка наряда.
    for (const c of cases) {
      const wo = woFrom(c);
      const shown = subtotal(wo) - lineDiscountTotal(wo) - discountAmount(wo);
      expect(round2(shown)).toBe(c.expect.total);
    }
  });
});

describe('line helpers', () => {
  it('a per-line discount reduces only its own line', () => {
    const a = { hours: 1, rate_snapshot: 1000, price_override: null, discount_type: 'percent', discount_value: 10 } as LaborLine;
    const b = { hours: 1, rate_snapshot: 1000, price_override: null, discount_type: null, discount_value: null } as LaborLine;
    expect(laborTotal(a)).toBe(900);
    expect(laborTotal(b)).toBe(1000);
  });

  it('a fixed line discount cannot exceed the line', () => {
    const p = { qty: 1, unit_price: 500, discount_type: 'fixed', discount_value: 800 } as PartLine;
    expect(partTotal(p)).toBe(0);
  });
});

describe('vehicleLabel', () => {
  it('joins make, model and generation', () => {
    expect(vehicleLabel({ make: 'MINI', model: 'Hatch', generation_code: 'R56' })).toBe('MINI Hatch R56');
  });

  it('does not repeat a code the model already contains', () => {
    expect(vehicleLabel({ make: 'MINI', model: 'R56', generation_code: 'R56' })).toBe('MINI R56');
  });

  it('falls back only when there is nothing to show', () => {
    expect(vehicleLabel(null)).toBe('Автомобиль');
    expect(vehicleLabel({ make: 'BMW' })).toBe('BMW');
  });
});

describe('clientDeals', () => {
  it('sums the imported history with orders closed in the CRM', () => {
    expect(
      clientDeals({
        imported_deals_count: 2,
        imported_deals_sum: 1000,
        closed_orders_count: 3,
        closed_orders_sum: 4500.5,
      }),
    ).toEqual({ count: 5, sum: 5500.5 });
  });

  it('tolerates a cached client without the live fields', () => {
    expect(clientDeals({ imported_deals_count: 0, imported_deals_sum: 0 } as never)).toEqual({
      count: 0,
      sum: 0,
    });
  });
});
