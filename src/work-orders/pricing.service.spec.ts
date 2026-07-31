import * as fs from 'fs';
import * as path from 'path';
import { PricingService, LaborLineLike, PartLineLike, DiscountType } from './pricing.service';

interface Fixture {
  name: string;
  labor: LaborLineLike[];
  parts: PartLineLike[];
  order: { type: DiscountType; value: number } | null;
  expect: {
    laborGross: number;
    partsGross: number;
    lineDiscountTotal: number;
    orderDiscountAmount: number;
    total: number;
    discountSum: number;
  };
}

// Read rather than import: the table lives in the client tree, outside Jest's
// rootDir and outside the API image's build context — which is fine, because
// only the specs need it. client/src/lib/format.spec.ts imports the very same
// file, so a divergence between the server math and its client mirror fails one
// of the two suites instead of showing up on a customer's invoice.
//
// It lives on the client side because the client's Docker build context is
// ./client and its production build typechecks the spec; the API image excludes
// **/*spec.ts via tsconfig.build.json and never needs the file at all.
const fixtures: { cases: Fixture[] } = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '../../client/src/lib/pricing-fixtures.json'),
    'utf8',
  ),
);

describe('PricingService', () => {
  const p = new PricingService();

  describe('laborLineTotal', () => {
    it('uses hours × rate_snapshot when no override', () => {
      expect(p.laborLineTotal({ hours: 2, rate_snapshot: 2000 })).toBe(4000);
    });

    it('price_override beats hours × rate', () => {
      expect(
        p.laborLineTotal({ hours: 5, rate_snapshot: 2000, price_override: 500 }),
      ).toBe(500);
    });

    it('override of 0 still beats the calc', () => {
      expect(
        p.laborLineTotal({ hours: 5, rate_snapshot: 2000, price_override: 0 }),
      ).toBe(0);
    });

    it('null hours treated as 0', () => {
      expect(p.laborLineTotal({ hours: null, rate_snapshot: 2000 })).toBe(0);
    });
  });

  describe('partLineTotal', () => {
    it('qty × unit_price', () => {
      expect(p.partLineTotal({ qty: 2, unit_price: 800 })).toBe(1600);
    });

    it('fractional qty (liters) multiplies correctly', () => {
      expect(p.partLineTotal({ qty: 1.5, unit_price: 350 })).toBe(525);
    });
  });

  describe('computeTotal', () => {
    it('AC-4: Σ lines − fixed discount', () => {
      const total = p.computeTotal(
        [{ hours: 1, rate_snapshot: 2000 }],
        [{ qty: 1, unit_price: 800 }],
        'fixed',
        300,
      );
      expect(total).toBe(2500); // 2000 + 800 − 300
    });

    it('percent discount applies', () => {
      const total = p.computeTotal(
        [{ hours: 1, rate_snapshot: 1000 }],
        [],
        'percent',
        10,
      );
      expect(total).toBe(900);
    });

    it('no discount = subtotal', () => {
      expect(
        p.computeTotal([{ hours: 1, rate_snapshot: 1000 }], [{ qty: 2, unit_price: 250 }]),
      ).toBe(1500);
    });

    it('fixed discount never goes below zero', () => {
      expect(p.computeTotal([], [{ qty: 1, unit_price: 100 }], 'fixed', 300)).toBe(0);
    });

    it('rounds to 2 decimals', () => {
      expect(p.computeTotal([{ hours: 0.333, rate_snapshot: 100 }], [])).toBe(33.3);
    });

    it('fractional part qty rounds at the total', () => {
      // 1.5 л × 333.33 = 499.995 → 500.00
      expect(p.computeTotal([], [{ qty: 1.5, unit_price: 333.33 }])).toBe(500);
    });
  });

  describe('per-line discounts', () => {
    it('a percent discount on a line reduces only that line', () => {
      const labor: LaborLineLike[] = [
        { hours: 1, rate_snapshot: 1000, discount_type: 'percent', discount_value: 10 },
        { hours: 1, rate_snapshot: 1000 },
      ];
      expect(p.laborLineTotal(labor[0])).toBe(900);
      expect(p.laborLineTotal(labor[1])).toBe(1000);
      expect(p.computeTotal(labor, [])).toBe(1900);
    });

    it('caps a fixed line discount at the line value', () => {
      expect(
        p.partLineTotal({ qty: 1, unit_price: 500, discount_type: 'fixed', discount_value: 800 }),
      ).toBe(0);
    });

    it('ignores a negative discount value', () => {
      expect(
        p.partLineTotal({ qty: 1, unit_price: 500, discount_type: 'fixed', discount_value: -100 }),
      ).toBe(500);
    });

    it('treats a type without a value as no discount', () => {
      expect(
        p.laborLineTotal({ hours: 1, rate_snapshot: 1000, discount_type: 'percent' }),
      ).toBe(1000);
    });

    it('rounds the discount, not the gross, so the printed column adds up', () => {
      // 3 × 33.33 = 99.99; 10% = 9.999 → 10.00 taken off, line prints 89.99.
      const line: PartLineLike = {
        qty: 3,
        unit_price: 33.33,
        discount_type: 'percent',
        discount_value: 10,
      };
      expect(p.lineDiscount(p.partLineGross(line), line)).toBe(10);
      expect(p.partLineTotal(line)).toBeCloseTo(89.99, 10);
    });

    it('stacks with the order discount instead of adding the percentages', () => {
      const labor: LaborLineLike[] = [
        { hours: 1, rate_snapshot: 2500, discount_type: 'percent', discount_value: 10 },
      ];
      // 2500 → 2250 → 2025, i.e. 19% off, not 20%.
      expect(p.computeTotal(labor, [], 'percent', 10)).toBe(2025);
      expect(p.computeTotal(labor, [], 'percent', 20)).not.toBe(2025);
    });
  });

  describe('document figures (shared fixtures)', () => {
    for (const c of fixtures.cases) {
      it(c.name, () => {
        const { labor, parts, order } = c;
        const type = order?.type ?? null;
        const value = order?.value ?? null;

        expect(p.laborGross(labor)).toBeCloseTo(c.expect.laborGross, 6);
        expect(p.partsGross(parts)).toBeCloseTo(c.expect.partsGross, 6);
        expect(p.lineDiscountTotal(labor, parts)).toBeCloseTo(c.expect.lineDiscountTotal, 6);
        expect(p.orderDiscountAmount(labor, parts, type, value)).toBeCloseTo(
          c.expect.orderDiscountAmount,
          6,
        );
        expect(p.computeTotal(labor, parts, type, value)).toBe(c.expect.total);
        expect(p.discountSum(labor, parts, type, value)).toBe(c.expect.discountSum);
      });
    }

    it('the totals block reconciles on paper for every fixture', () => {
      // Both PDFs print «Стоимость работ», «Стоимость запчастей», «Сумма скидок»
      // and «Итого». This identity is what makes those four numbers add up.
      for (const c of fixtures.cases) {
        const type = c.order?.type ?? null;
        const value = c.order?.value ?? null;
        const printedLabor = p.round2(p.laborGross(c.labor));
        const printedParts = p.round2(p.partsGross(c.parts));
        const total = p.computeTotal(c.labor, c.parts, type, value);
        const discounts = p.discountSum(c.labor, c.parts, type, value);
        expect(p.round2(printedLabor + printedParts - discounts)).toBe(total);
      }
    });

    it('never reports a negative discount total', () => {
      for (const c of fixtures.cases) {
        const type = c.order?.type ?? null;
        const value = c.order?.value ?? null;
        expect(p.discountSum(c.labor, c.parts, type, value)).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
