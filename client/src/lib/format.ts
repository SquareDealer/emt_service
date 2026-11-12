import { BOARD_CLOSED_LIMIT } from './types';
import type { Client, LaborLine, PartLine, WorkOrder } from './types';

/** Format a number as RUB without trailing kopecks unless present. */
export function money(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  const v = Number(n);
  const hasFraction = Math.round(v * 100) % 100 !== 0;
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(v) + ' ₽';
}

export function num(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('ru-RU').format(Number(n));
}

/** Pretty Russian phone: +7 (999) 123-45-67 */
export function phone(raw: string | null | undefined): string {
  if (!raw) return '—';
  const d = raw.replace(/\D/g, '');
  if (d.length === 11 && (d[0] === '7' || d[0] === '8')) {
    return `+7 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9, 11)}`;
  }
  return raw;
}

export function dateShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function timeOnly(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

/**
 * Client mirror of the server's PricingService. The two are pinned against the
 * same table in pricing-fixtures.json, so a drift fails a suite rather than
 * showing a different number on screen than on the invoice.
 */
type Discountable = Pick<LaborLine, 'discount_type' | 'discount_value'>;
type LaborLineLike = Pick<LaborLine, 'hours' | 'rate_snapshot' | 'price_override'> & Discountable;
type PartLineLike = Pick<PartLine, 'qty' | 'unit_price'> & Discountable;

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Labor line before any discount. */
export function laborGross(l: Pick<LaborLine, 'hours' | 'rate_snapshot' | 'price_override'>): number {
  if (l.price_override !== null && l.price_override !== undefined) return l.price_override;
  return (l.hours ?? 0) * l.rate_snapshot;
}

export function partGross(p: Pick<PartLine, 'qty' | 'unit_price'>): number {
  return p.qty * p.unit_price;
}

/** Discount amount for one line — never more than the line itself. */
export function lineDiscount(gross: number, line: Discountable): number {
  const { discount_type: type, discount_value: value } = line;
  if (!type || value == null) return 0;
  if (type === 'percent') {
    return round2((gross * Math.min(Math.max(value, 0), 100)) / 100);
  }
  return Math.min(Math.max(value, 0), Math.max(gross, 0));
}

/** What the line actually costs — the «Сумма» column. */
export function laborTotal(l: LaborLineLike): number {
  const gross = laborGross(l);
  return gross - lineDiscount(gross, l);
}

export function partTotal(p: PartLineLike): number {
  const gross = partGross(p);
  return gross - lineDiscount(gross, p);
}

/** Everything before any discount — the «Работы + запчасти» figure. */
export function subtotal(wo: WorkOrder): number {
  const l = (wo.labor_lines ?? []).reduce((s, x) => s + laborGross(x), 0);
  const p = (wo.part_lines ?? []).reduce((s, x) => s + partGross(x), 0);
  return l + p;
}

/** Σ of the per-line discounts, shown apart from the order-level one. */
export function lineDiscountTotal(wo: WorkOrder): number {
  const l = (wo.labor_lines ?? []).reduce((s, x) => s + lineDiscount(laborGross(x), x), 0);
  const p = (wo.part_lines ?? []).reduce((s, x) => s + lineDiscount(partGross(x), x), 0);
  return l + p;
}

/** What the order discount applies to: line totals after their own discounts. */
export function netSubtotal(wo: WorkOrder): number {
  const l = (wo.labor_lines ?? []).reduce((s, x) => s + laborTotal(x), 0);
  const p = (wo.part_lines ?? []).reduce((s, x) => s + partTotal(x), 0);
  return l + p;
}

/**
 * The order-level discount, applied AFTER the per-line ones — the two stack, so
 * 10% on a line plus 10% on the order is 19% off, not 20%.
 */
export function discountAmount(wo: WorkOrder): number {
  const net = netSubtotal(wo);
  if (!wo.discount_type || wo.discount_value == null) return 0;
  if (wo.discount_type === 'percent') {
    return net * (Math.min(Math.max(wo.discount_value, 0), 100) / 100);
  }
  return Math.min(net, Math.max(wo.discount_value, 0));
}

export function orderTotal(wo: WorkOrder): number {
  return round2(netSubtotal(wo) - discountAmount(wo));
}

/** Just the fields the label needs — mirrors src/common/vehicle-label.util.ts. */
type VehicleLike = {
  make?: string | null;
  model?: string | null;
  generation_code?: string | null;
};

/**
 * Human label for a car: «MINI Hatch R56», «BMW X5 G05», «Renault Logan».
 *
 * The generation code is dropped when `model` already contains it — before the
 * make/generation split `model` was the only field and held the code itself, so
 * backfilled rows have model = 'R56' AND generation_code = 'R56'.
 */
export function vehicleLabel(v: VehicleLike | null | undefined, fallback = 'Автомобиль'): string {
  const make = v?.make?.trim() || '';
  const model = v?.model?.trim() || '';
  const code = v?.generation_code?.trim() || '';

  const parts = [make, model];
  if (code && !model.toUpperCase().includes(code.toUpperCase())) parts.push(code);
  return parts.filter(Boolean).join(' ') || fallback;
}

export interface EstimateGroup {
  key: string;
  name: string;
  sort: number;
  labor: LaborLine[];
  parts: PartLine[];
  /** Net of the block — what «Замена масла ... 7800 ₽» shows. */
  total: number;
}

/**
 * The estimate split into blocks, in display order. Ungrouped lines are not
 * included — they render as loose rows after the blocks.
 */
export function estimateGroups(wo: WorkOrder): EstimateGroup[] {
  const byKey = new Map<string, EstimateGroup>();
  const ensure = (key: string, name: string | null, sort: number) => {
    let g = byKey.get(key);
    if (!g) {
      g = { key, name: name || 'Блок', sort, labor: [], parts: [], total: 0 };
      byKey.set(key, g);
    }
    return g;
  };
  for (const l of wo.labor_lines ?? []) {
    if (!l.group_key) continue;
    ensure(l.group_key, l.group_name, l.group_sort).labor.push(l);
  }
  for (const p of wo.part_lines ?? []) {
    if (!p.group_key) continue;
    ensure(p.group_key, p.group_name, p.group_sort).parts.push(p);
  }
  for (const g of byKey.values()) {
    g.total =
      g.labor.reduce((s, l) => s + laborTotal(l), 0) +
      g.parts.reduce((s, x) => s + partTotal(x), 0);
  }
  return [...byKey.values()].sort((a, b) => a.sort - b.sort);
}

const SOURCE_LABEL: Record<string, string> = {
  manual: 'Вручную',
  csv_import: 'Импорт',
  telegram_bot: 'Telegram',
};
export function sourceLabel(s: string | undefined): string {
  return s ? SOURCE_LABEL[s] ?? s : '';
}

/**
 * A client's deal history: what came over from the old base plus every order
 * closed here since. Either source alone under-reports a long-standing client.
 */
export function clientDeals(
  c: Pick<
    Client,
    'imported_deals_count' | 'imported_deals_sum' | 'closed_orders_count' | 'closed_orders_sum'
  >,
): { count: number; sum: number } {
  return {
    count: (c.imported_deals_count ?? 0) + (c.closed_orders_count ?? 0),
    sum: (c.imported_deals_sum ?? 0) + (c.closed_orders_sum ?? 0),
  };
}

/** The board's «Выдана» column holds only the newest few; the rest are in the archive. */
export function capClosed<T>(items: T[], limit = BOARD_CLOSED_LIMIT): T[] {
  return items.slice(0, limit);
}
