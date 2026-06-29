import { PricingService } from './pricing.service';

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
});
