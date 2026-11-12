import { WorkOrder } from '../entities/work-order.entity';
import { PricingService } from '../work-orders/pricing.service';
import { vehicleLabelOr } from '../common/vehicle-label.util';

/**
 * Чистый расчёт аналитики по закрытым нарядам — без БД и без Nest.
 * Формулы зеркалят клиентский прототип client/src/features/analytics/analytics.ts.
 */

export interface AnalyticsLabor { key: string; name: string; hours: number; net: number }
export interface AnalyticsPart {
  id: string; key: string; name: string; manufacturer: string | null;
  qty: number; unit: 'pcs' | 'l'; net: number; cost: number | null;
}
export interface AnalyticsOrder {
  id: string; doc_number: number | null; closed_at: Date; total: number; discounts: number;
  client: { id: string; name: string }; vehicle: string;
  labor: AnalyticsLabor[]; parts: AnalyticsPart[];
}
export interface Totals {
  orders: number; hours: number; revenue: number; labor: number;
  parts_sale: number; parts_cost: number; markup: number;
  unknown_sale: number; unknown_count: number; discounts: number;
  profit: number; margin: number | null; avg_check: number | null;
}
export interface Bucket {
  from: string; to: string; orders: number;
  labor: number; markup: number; cost: number; unknown: number; revenue: number; profit: number;
}
export interface LaborRow { key: string; name: string; count: number; hours: number; revenue: number; per_hour: number | null }
export interface PartRow {
  key: string; name: string; manufacturer: string | null; unit: 'pcs' | 'l'; qty: number;
  revenue: number; cost: number | null; markup: number | null; markup_pct: number | null; unknown_count: number;
}
export interface VehicleRow {
  key: string; name: string; orders: number; revenue: number; profit: number;
  margin: number | null; avg_check: number | null; unknown_count: number;
}
export interface ClientRow extends Omit<VehicleRow, 'key'> { client_id: string; vehicle: string; last_closed_at: string }
export interface Breakdown { labor: LaborRow[]; parts: PartRow[]; vehicles: VehicleRow[]; clients: ClientRow[] }

const pricing = new PricingService();
const r2 = (n: number) => pricing.round2(n);

/**
 * Раскладывает итог наряда (с учётом скидки наряда) по строкам пропорционально
 * их собственным суммам; остаток копеек уходит в самую крупную строку, чтобы
 * Σ net === total ровно.
 */
export function toAnalyticsOrder(wo: WorkOrder, pricingSvc: PricingService): AnalyticsOrder {
  const laborLines = wo.labor_lines ?? [];
  const partLines = wo.part_lines ?? [];
  const lineNets = [
    ...laborLines.map((l) => pricingSvc.laborLineTotal(l)),
    ...partLines.map((p) => pricingSvc.partLineTotal(p)),
  ];
  const S = lineNets.reduce((s, x) => s + x, 0);
  const T =
    wo.total_frozen ??
    pricingSvc.computeTotal(laborLines, partLines, wo.discount_type, wo.discount_value);

  let nets: number[];
  if (S <= 0) {
    nets = lineNets.map(() => 0);
  } else {
    nets = lineNets.map((n) => pricingSvc.round2((n * T) / S));
    if (nets.length > 0) {
      const diff = pricingSvc.round2(T - nets.reduce((s, x) => s + x, 0));
      let max = 0;
      nets.forEach((n, i) => { if (n > nets[max]) max = i; });
      nets[max] = pricingSvc.round2(nets[max] + diff);
    }
  }

  const labor: AnalyticsLabor[] = laborLines.map((l, i) => ({
    key: l.template_id ?? 'name:' + l.name.trim().toLowerCase(),
    name: l.name,
    hours: l.hours ?? 0,
    net: nets[i],
  }));
  const parts: AnalyticsPart[] = partLines.map((p, i) => ({
    id: p.id,
    key: p.part_template_id ?? 'name:' + (p.name + '|' + (p.manufacturer ?? '')).trim().toLowerCase(),
    name: p.name,
    manufacturer: p.manufacturer ?? null,
    qty: p.qty,
    unit: p.unit,
    net: nets[laborLines.length + i],
    cost: p.purchase_price == null ? null : pricingSvc.round2(p.qty * p.purchase_price),
  }));

  const client = wo.vehicle?.client;
  return {
    id: wo.id,
    doc_number: wo.doc_number ?? null,
    closed_at: wo.closed_at as Date,
    total: pricingSvc.round2(T),
    discounts: pricingSvc.round2(pricingSvc.grossTotal(laborLines, partLines) - T),
    client: client ? { id: client.id, name: client.full_name } : { id: '', name: '—' },
    vehicle: vehicleLabelOr(wo.vehicle),
    labor,
    parts,
  };
}

export function totals(orders: AnalyticsOrder[]): Totals {
  let hours = 0, labor = 0, sale = 0, cost = 0, unknownSale = 0, unknownCount = 0, discounts = 0;
  for (const o of orders) {
    discounts += o.discounts;
    for (const l of o.labor) { labor += l.net; hours += l.hours; }
    for (const p of o.parts) {
      if (p.cost === null) { unknownSale += p.net; unknownCount += 1; }
      else { sale += p.net; cost += p.cost; }
    }
  }
  const markup = r2(sale - cost);
  const revenue = r2(labor + sale + unknownSale);
  const profit = r2(labor + markup);
  return {
    orders: orders.length,
    hours: r2(hours),
    revenue,
    labor: r2(labor),
    parts_sale: r2(sale),
    parts_cost: r2(cost),
    markup,
    unknown_sale: r2(unknownSale),
    unknown_count: unknownCount,
    discounts: r2(discounts),
    profit,
    margin: revenue > 0 ? profit / revenue : null,
    avg_check: orders.length > 0 ? r2(revenue / orders.length) : null,
  };
}

/** Корзина i — полуинтервал [edges[i], edges[i+1]). */
export function buckets(orders: AnalyticsOrder[], edges: Date[]): Bucket[] {
  const out: Bucket[] = [];
  for (let i = 0; i + 1 < edges.length; i++) {
    const from = edges[i].getTime();
    const to = edges[i + 1].getTime();
    const t = totals(orders.filter((o) => o.closed_at.getTime() >= from && o.closed_at.getTime() < to));
    out.push({
      from: edges[i].toISOString(),
      to: edges[i + 1].toISOString(),
      orders: t.orders,
      labor: t.labor,
      markup: t.markup,
      cost: t.parts_cost,
      unknown: t.unknown_sale,
      revenue: t.revenue,
      profit: t.profit,
    });
  }
  return out;
}

function byRecency(orders: AnalyticsOrder[]): AnalyticsOrder[] {
  return [...orders].sort((a, b) => a.closed_at.getTime() - b.closed_at.getTime());
}

function pushTo<T>(map: Map<string, T[]>, key: string, item: T): void {
  const list = map.get(key);
  if (list) list.push(item);
  else map.set(key, [item]);
}

export function breakdown(orders: AnalyticsOrder[]): Breakdown {
  // Старые → новые: отображаемые поля группы перезаписываются самым поздним нарядом.
  const sorted = byRecency(orders);

  const labor = new Map<string, { name: string; count: number; hours: number; revenue: number }>();
  const parts = new Map<string, {
    name: string; manufacturer: string | null; unit: 'pcs' | 'l'; qty: number; revenue: number;
    sale: number; cost: number; known: number; unknown: number;
  }>();
  const vehicles = new Map<string, AnalyticsOrder[]>();
  const clients = new Map<string, AnalyticsOrder[]>();

  for (const o of sorted) {
    for (const l of o.labor) {
      const g = labor.get(l.key) ?? { name: l.name, count: 0, hours: 0, revenue: 0 };
      g.name = l.name;
      g.count += 1;
      g.hours += l.hours;
      g.revenue += l.net;
      labor.set(l.key, g);
    }
    for (const p of o.parts) {
      // Одна позиция каталога в штуках и в литрах — разные строки, иначе qty складывает несопоставимое.
      const gkey = p.key + '|' + p.unit;
      const g = parts.get(gkey) ?? {
        name: p.name, manufacturer: p.manufacturer, unit: p.unit, qty: 0, revenue: 0,
        sale: 0, cost: 0, known: 0, unknown: 0,
      };
      g.name = p.name;
      g.manufacturer = p.manufacturer;
      g.unit = p.unit;
      g.qty += p.qty;
      g.revenue += p.net;
      if (p.cost === null) g.unknown += 1;
      else { g.sale += p.net; g.cost += p.cost; g.known += 1; }
      parts.set(gkey, g);
    }
    pushTo(vehicles, o.vehicle, o);
    pushTo(clients, o.client.id, o);
  }

  const stats = (list: AnalyticsOrder[]) => {
    const t = totals(list);
    return {
      orders: t.orders, revenue: t.revenue, profit: t.profit, margin: t.margin,
      avg_check: t.avg_check, unknown_count: t.unknown_count,
    };
  };

  return {
    labor: [...labor].map(([key, g]) => ({
      key, name: g.name, count: g.count, hours: r2(g.hours), revenue: r2(g.revenue),
      per_hour: g.hours > 0 ? r2(g.revenue / g.hours) : null,
    })),
    parts: [...parts].map(([key, g]) => {
      const cost = g.known > 0 ? r2(g.cost) : null;
      const markup = g.known > 0 ? r2(g.sale - g.cost) : null;
      return {
        key, name: g.name, manufacturer: g.manufacturer, unit: g.unit, qty: Math.round((g.qty + Number.EPSILON) * 1000) / 1000,
        revenue: r2(g.revenue), cost, markup,
        markup_pct: markup !== null && g.cost > 0 ? (g.sale - g.cost) / g.cost : null,
        unknown_count: g.unknown,
      };
    }),
    vehicles: [...vehicles].map(([name, list]) => ({ key: name, name, ...stats(list) })),
    clients: [...clients].map(([client_id, list]) => {
      const last = list[list.length - 1];
      return {
        client_id,
        name: last.client.name,
        vehicle: last.vehicle,
        last_closed_at: last.closed_at.toISOString(),
        ...stats(list),
      };
    }),
  };
}
