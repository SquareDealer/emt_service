import { PricingService } from '../work-orders/pricing.service';
import { WorkOrder } from '../entities/work-order.entity';
import { LaborLine } from '../entities/labor-line.entity';
import { PartLine } from '../entities/part-line.entity';
import {
  AnalyticsOrder, AnalyticsPart, breakdown, buckets, toAnalyticsOrder, totals,
} from './analytics-calc';

const pricing = new PricingService();

function labor(p: Partial<LaborLine> = {}): LaborLine {
  return {
    id: 'l1', template_id: null, name: 'Замена масла', hours: 2, rate_snapshot: 2500,
    price_override: null, discount_type: null, discount_value: null, ...p,
  } as LaborLine;
}
function part(p: Partial<PartLine> = {}): PartLine {
  return {
    id: 'p1', part_template_id: null, name: 'Фильтр', manufacturer: null, qty: 2, unit: 'pcs',
    unit_price: 6900, discount_type: null, discount_value: null, purchase_price: 4700, ...p,
  } as PartLine;
}
function wo(p: Partial<WorkOrder> = {}): WorkOrder {
  return {
    id: 'wo1', doc_number: 1, status: 'closed', discount_type: null, discount_value: null,
    total_frozen: null, closed_at: new Date('2026-11-01T10:00:00Z'),
    labor_lines: [], part_lines: [],
    vehicle: { make: 'MINI', model: 'Hatch', generation_code: 'R56', client: { id: 'c1', full_name: 'Иванов' } },
    ...p,
  } as unknown as WorkOrder;
}

function order(p: Partial<AnalyticsOrder> = {}): AnalyticsOrder {
  return {
    id: 'o', doc_number: 1, closed_at: new Date('2026-11-01T10:00:00Z'), total: 0, discounts: 0,
    client: { id: 'c1', name: 'Иванов' }, vehicle: 'MINI Hatch R56', labor: [], parts: [], ...p,
  };
}
function aPart(p: Partial<AnalyticsPart> = {}): AnalyticsPart {
  return {
    id: 'p', key: 'k', name: 'Фильтр', manufacturer: null, qty: 1, unit: 'pcs', net: 0, cost: null, ...p,
  };
}

describe('toAnalyticsOrder', () => {
  it('без скидок: net строк = суммам строк, cost = qty × purchase_price', () => {
    const o = toAnalyticsOrder(
      wo({ labor_lines: [labor()], part_lines: [part()], total_frozen: 18800 }), pricing);
    expect(o.labor[0].net).toBe(5000);
    expect(o.parts[0]).toMatchObject({ net: 13800, cost: 9400 });
    expect(o.discounts).toBe(0);
  });

  it('скидка наряда 10 % раскладывается пропорционально', () => {
    const o = toAnalyticsOrder(
      wo({
        labor_lines: [labor()], part_lines: [part()],
        discount_type: 'percent', discount_value: 10, total_frozen: 16920,
      }), pricing);
    expect(o.labor[0].net).toBe(4500);
    expect(o.parts[0].net).toBe(12420);
    expect(o.discounts).toBe(1880);
  });

  it('копейки: сумма net строго равна total_frozen', () => {
    const lines = [1, 2, 3].map((i) =>
      labor({ id: 'l' + i, name: 'Работа ' + i, hours: null, price_override: 333.33 }));
    const o = toAnalyticsOrder(
      wo({ labor_lines: lines, discount_type: 'fixed', discount_value: 100, total_frozen: 899.99 }),
      pricing);
    const sum = o.labor.reduce((s, l) => s + Math.round(l.net * 100), 0);
    expect(sum).toBe(89999);
  });

  it('скидка 100 %: все net = 0, без NaN', () => {
    const o = toAnalyticsOrder(
      wo({
        labor_lines: [labor()], part_lines: [part()],
        discount_type: 'percent', discount_value: 100, total_frozen: 0,
      }), pricing);
    expect(o.labor[0].net).toBe(0);
    expect(o.parts[0].net).toBe(0);
    expect(o.total).toBe(0);
  });

  it('purchase_price 0 — закупка известна и равна нулю', () => {
    const o = toAnalyticsOrder(
      wo({ labor_lines: [labor()], part_lines: [part({ purchase_price: 0 })], total_frozen: 18800 }),
      pricing);
    expect(o.parts[0].cost).toBe(0);
  });

  it('purchase_price отсутствует — cost null', () => {
    const o = toAnalyticsOrder(
      wo({
        labor_lines: [labor()], part_lines: [part({ purchase_price: undefined })], total_frozen: 18800,
      }), pricing);
    expect(o.parts[0].cost).toBeNull();
    const o2 = toAnalyticsOrder(
      wo({ part_lines: [part({ purchase_price: null })], total_frozen: 13800 }), pricing);
    expect(o2.parts[0].cost).toBeNull();
  });

  it('работа без часов (только price_override) даёт hours 0', () => {
    const o = toAnalyticsOrder(
      wo({ labor_lines: [labor({ hours: null, price_override: 1500 })], total_frozen: 1500 }), pricing);
    expect(o.labor[0].hours).toBe(0);
    expect(o.labor[0].net).toBe(1500);
  });

  it('нет клиента или машины: запасные значения, без исключения', () => {
    const o = toAnalyticsOrder(wo({ vehicle: undefined, total_frozen: 0 }), pricing);
    expect(o.client).toEqual({ id: '', name: '—' });
    expect(o.vehicle).toBe('Автомобиль');
  });
});

describe('totals', () => {
  it('запчасть без закупки входит в выручку, но не в прибыль', () => {
    const t = totals([
      order({
        labor: [{ key: 'a', name: 'Работа', hours: 2, net: 5000 }],
        parts: [
          aPart({ id: 'a', key: 'A', net: 13800, cost: 9400 }),
          aPart({ id: 'b', key: 'B', net: 1600, cost: null }),
        ],
      }),
    ]);
    expect(t).toMatchObject({
      revenue: 20400, labor: 5000, parts_sale: 13800, parts_cost: 9400, markup: 4400,
      unknown_sale: 1600, unknown_count: 1, profit: 9400, avg_check: 20400,
    });
    expect(t.margin).toBeCloseTo(9400 / 20400, 10);
  });

  it('пустой список: нули, margin и avg_check null', () => {
    expect(totals([])).toMatchObject({ orders: 0, revenue: 0, margin: null, avg_check: null });
  });
});

describe('buckets', () => {
  const edges = [
    new Date('2026-11-01T00:00:00Z'),
    new Date('2026-11-02T00:00:00Z'),
    new Date('2026-11-03T00:00:00Z'),
  ];

  it('наряд ровно на границе попадает в следующую корзину', () => {
    const b = buckets(
      [order({ closed_at: new Date('2026-11-02T00:00:00Z'), labor: [{ key: 'a', name: 'x', hours: 1, net: 100 }] })],
      edges);
    expect(b.map((x) => x.orders)).toEqual([0, 1]);
    expect(b[1]).toMatchObject({ labor: 100, revenue: 100, profit: 100 });
    expect(b[0].from).toBe('2026-11-01T00:00:00.000Z');
    expect(b[0].to).toBe('2026-11-02T00:00:00.000Z');
  });

  it('корзина без нарядов отдаётся нулями, а не пропускается', () => {
    const b = buckets([], edges);
    expect(b).toHaveLength(2);
    expect(b[0]).toMatchObject({ orders: 0, revenue: 0, profit: 0, cost: 0, unknown: 0 });
  });
});

describe('breakdown', () => {
  it('работы группируются по template_id, даже если имя правили', () => {
    const bd = breakdown([
      order({ closed_at: new Date('2026-11-01T10:00:00Z'), labor: [{ key: 't1', name: 'Старое имя', hours: 1, net: 100 }] }),
      order({ closed_at: new Date('2026-11-02T10:00:00Z'), labor: [{ key: 't1', name: 'Новое имя', hours: 1, net: 200 }] }),
    ]);
    expect(bd.labor).toHaveLength(1);
    expect(bd.labor[0]).toMatchObject({ name: 'Новое имя', count: 2, revenue: 300 });
  });

  it('ручные работы группируются по имени без учёта регистра и пробелов', () => {
    const a = toAnalyticsOrder(
      wo({ labor_lines: [labor({ name: ' Диагностика ', hours: null, price_override: 100 })], total_frozen: 100 }),
      pricing);
    const b = toAnalyticsOrder(
      wo({ id: 'wo2', labor_lines: [labor({ name: 'диагностика', hours: null, price_override: 200 })], total_frozen: 200 }),
      pricing);
    const bd = breakdown([a, b]);
    expect(bd.labor).toHaveLength(1);
    expect(bd.labor[0].revenue).toBe(300);
  });

  it('per_hour = revenue / hours, null при нуле часов', () => {
    const bd = breakdown([
      order({
        labor: [
          { key: 'a', name: 'A', hours: 2, net: 5000 },
          { key: 'b', name: 'B', hours: 0, net: 700 },
        ],
      }),
    ]);
    expect(bd.labor.find((r) => r.key === 'a')?.per_hour).toBe(2500);
    expect(bd.labor.find((r) => r.key === 'b')?.per_hour).toBeNull();
  });

  it('запчасти: markup и markup_pct считаются только по строкам с закупкой', () => {
    const bd = breakdown([
      order({ parts: [aPart({ key: 'X', net: 950, cost: 520 })] }),
      order({ parts: [aPart({ key: 'X', net: 1000, cost: null })] }),
    ]);
    const row = bd.parts[0];
    expect(bd.parts).toHaveLength(1);
    expect(row).toMatchObject({ revenue: 1950, cost: 520, markup: 430, unknown_count: 1 });
    expect(row.markup_pct).toBeCloseTo(430 / 520, 10);
  });

  it('клиенты: last_closed_at и vehicle берутся из последнего наряда', () => {
    const bd = breakdown([
      order({ closed_at: new Date('2026-11-05T10:00:00Z'), vehicle: 'BMW X5', client: { id: 'c1', name: 'Иванов И.' } }),
      order({ closed_at: new Date('2026-11-01T10:00:00Z'), vehicle: 'MINI Hatch R56' }),
    ]);
    expect(bd.clients).toHaveLength(1);
    expect(bd.clients[0]).toMatchObject({
      client_id: 'c1', name: 'Иванов И.', vehicle: 'BMW X5',
      last_closed_at: '2026-11-05T10:00:00.000Z', orders: 2,
    });
  });

  it('машины группируются по подписи vehicleLabelOr', () => {
    const a = toAnalyticsOrder(wo({ total_frozen: 0 }), pricing);
    const b = toAnalyticsOrder(wo({ id: 'wo2', total_frozen: 0 }), pricing);
    const c = toAnalyticsOrder(
      wo({ id: 'wo3', total_frozen: 0, vehicle: { make: 'BMW', model: 'X5', client: { id: 'c2', full_name: 'Петров' } } as never }),
      pricing);
    const bd = breakdown([a, b, c]);
    expect(bd.vehicles.map((v) => [v.key, v.orders]).sort()).toEqual([['BMW X5', 1], ['MINI Hatch R56', 2]]);
  });
});
