/**
 * Чистые агрегаты экрана аналитики. В прототипе считаются на клиенте по демо-данным;
 * в боевой версии то же самое вернёт сервер — формы `Totals` / `Bucket` / `Breakdown`
 * задуманы как контракт ответа.
 */
import {
  addDays,
  addMonths,
  addQuarters,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  format,
  getQuarter,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
} from 'date-fns';
import { ru } from 'date-fns/locale';
import type { MockOrder } from './mock';

export type PeriodKind = 'week' | 'month' | 'quarter' | 'year';

export const PERIOD_LABEL: Record<PeriodKind, string> = {
  week: 'Неделя',
  month: 'Месяц',
  quarter: 'Квартал',
  year: 'Год',
};

/** Полуинтервал [from, to). */
export interface Range {
  from: Date;
  to: Date;
}

export interface BucketRange extends Range {
  /** Подпись на оси. */
  label: string;
  /** Полная подпись для подсказки и таблицы. */
  title: string;
}

export interface Period extends Range {
  kind: PeriodKind;
  label: string;
  buckets: BucketRange[];
}

const f = (d: Date, p: string) => format(d, p, { locale: ru });

function start(kind: PeriodKind, d: Date): Date {
  if (kind === 'week') return startOfWeek(d, { weekStartsOn: 1 });
  if (kind === 'month') return startOfMonth(d);
  if (kind === 'quarter') return startOfQuarter(d);
  return startOfYear(d);
}

export function shift(kind: PeriodKind, d: Date, n: number): Date {
  if (kind === 'week') return addWeeks(d, n);
  if (kind === 'month') return addMonths(d, n);
  if (kind === 'quarter') return addQuarters(d, n);
  return addYears(d, n);
}

/** «6–12 окт» / «28 сен – 4 окт» для полуинтервала. */
export function spanLabel(from: Date, to: Date): string {
  const last = addDays(to, -1);
  if (differenceInCalendarDays(last, from) === 0) return f(from, 'd MMM');
  return from.getMonth() === last.getMonth()
    ? `${f(from, 'd')}–${f(last, 'd MMM')}`
    : `${f(from, 'd MMM')} – ${f(last, 'd MMM')}`;
}

export function periodOf(kind: PeriodKind, anchor: Date): Period {
  const from = start(kind, anchor);
  const to = shift(kind, from, 1);
  const buckets: BucketRange[] = [];

  if (kind === 'week' || kind === 'month') {
    for (let d = from; d < to; d = addDays(d, 1)) {
      buckets.push({
        from: d,
        to: addDays(d, 1),
        label: kind === 'week' ? f(d, 'EEEEEE') : f(d, 'd'),
        title: f(d, 'd MMMM, EEEEEE'),
      });
    }
  } else if (kind === 'quarter') {
    for (let w = startOfWeek(from, { weekStartsOn: 1 }); w < to; w = addWeeks(w, 1)) {
      const a = w < from ? from : w;
      const next = addWeeks(w, 1);
      const b = next > to ? to : next;
      buckets.push({ from: a, to: b, label: f(a, 'd.MM'), title: spanLabel(a, b) });
    }
  } else {
    for (let m = from; m < to; m = addMonths(m, 1)) {
      buckets.push({ from: m, to: addMonths(m, 1), label: f(m, 'LLL').replace('.', ''), title: f(m, 'LLLL yyyy') });
    }
  }

  const label =
    kind === 'week'
      ? `${spanLabel(from, to)} ${f(from, 'yyyy')}`
      : kind === 'month'
        ? f(from, 'LLLL yyyy')
        : kind === 'quarter'
          ? `${getQuarter(from)} квартал ${f(from, 'yyyy')}`
          : f(from, 'yyyy');

  return { kind, from, to, label, buckets };
}

export interface Comparison {
  /** Текущий период, обрезанный по сегодняшний день, если он ещё идёт. */
  current: Range;
  previous: Range;
  /** «к сентябрю 2026» или «к 1–12 окт» — чем именно меряем. */
  label: string;
  /** Период ещё не закончился → сравниваем равные отрезки. */
  partial: boolean;
}

/**
 * Незавершённый период нельзя сравнивать с полным прошлым: 12 дней ноября против всего
 * октября всегда «минус 60 %». Берём у прошлого периода столько же дней с начала.
 */
export function comparisonFor(p: Period, now: Date): Comparison {
  const prevFrom = shift(p.kind, p.from, -1);
  const prevTo = p.from;
  if (now >= p.from && now < p.to) {
    const cut = addDays(startOfDay(now), 1);
    const days = differenceInCalendarDays(cut, p.from);
    const prevCut = addDays(prevFrom, days);
    const previous = { from: prevFrom, to: prevCut > prevTo ? prevTo : prevCut };
    return {
      current: { from: p.from, to: cut },
      previous,
      label: `к ${spanLabel(previous.from, previous.to)}`,
      partial: true,
    };
  }
  return {
    current: { from: p.from, to: p.to },
    previous: { from: prevFrom, to: prevTo },
    label: `к прошлому: ${periodOf(p.kind, prevFrom).label}`,
    partial: false,
  };
}

export function inRange(orders: MockOrder[], r: Range): MockOrder[] {
  return orders.filter((o) => o.closedAt >= r.from && o.closedAt < r.to);
}

export interface Totals {
  orders: number;
  hours: number;
  /** Всё, что выставлено клиентам: работы + запчасти, после скидок. */
  revenue: number;
  labor: number;
  /** Продажа запчастей, у которых закупка известна. */
  partsSale: number;
  partsCost: number;
  /** partsSale − partsCost. */
  markup: number;
  /** Продажа запчастей без закупки — в прибыль НЕ входит. */
  unknownSale: number;
  unknownCount: number;
  discounts: number;
  /** labor + markup. Нижняя оценка, пока есть unknownSale. */
  profit: number;
  /** profit / revenue, доля 0..1. */
  margin: number | null;
  avgCheck: number | null;
}

export function totals(orders: MockOrder[]): Totals {
  const t: Totals = {
    orders: orders.length, hours: 0, revenue: 0, labor: 0, partsSale: 0, partsCost: 0,
    markup: 0, unknownSale: 0, unknownCount: 0, discounts: 0, profit: 0, margin: null, avgCheck: null,
  };
  for (const o of orders) {
    t.discounts += o.discount;
    for (const l of o.labor) {
      t.labor += l.net;
      t.hours += l.hours;
    }
    for (const p of o.parts) {
      if (p.cost === null) {
        t.unknownSale += p.net;
        t.unknownCount += 1;
      } else {
        t.partsSale += p.net;
        t.partsCost += p.cost;
      }
    }
  }
  t.markup = t.partsSale - t.partsCost;
  t.revenue = t.labor + t.partsSale + t.unknownSale;
  t.profit = t.labor + t.markup;
  t.margin = t.revenue > 0 ? t.profit / t.revenue : null;
  t.avgCheck = t.orders > 0 ? t.revenue / t.orders : null;
  return t;
}

export interface Bucket extends BucketRange {
  labor: number;
  markup: number;
  cost: number;
  unknown: number;
  revenue: number;
  profit: number;
  orders: number;
}

export function series(orders: MockOrder[], p: Period): Bucket[] {
  return p.buckets.map((b) => {
    const t = totals(inRange(orders, b));
    return {
      ...b,
      labor: t.labor,
      markup: t.markup,
      cost: t.partsCost,
      unknown: t.unknownSale,
      revenue: t.revenue,
      profit: t.profit,
      orders: t.orders,
    };
  });
}

export type BreakdownKind = 'labor' | 'parts' | 'vehicles' | 'clients';

export interface BreakdownCol {
  label: string;
  kind: 'money' | 'num' | 'pct';
  /** Прятать на узком экране. */
  minor?: boolean;
}

export interface BreakdownRow {
  key: string;
  name: string;
  sub?: string;
  vals: (number | null)[];
  revenue: number;
  /** Сколько строк запчастей без закупки спрятано в этой строке. */
  unknown?: number;
}

export interface Breakdown {
  cols: BreakdownCol[];
  rows: BreakdownRow[];
  /** Индекс колонки сортировки по умолчанию — «что выгодно» для этого разреза. */
  defaultSort: number;
}

function group<T>(map: Map<string, T>, key: string, init: () => T): T {
  let v = map.get(key);
  if (!v) {
    v = init();
    map.set(key, v);
  }
  return v;
}

export function breakdown(orders: MockOrder[], kind: BreakdownKind): Breakdown {
  if (kind === 'labor') {
    const m = new Map<string, { n: number; hours: number; rev: number }>();
    for (const o of orders)
      for (const l of o.labor) {
        const g = group(m, l.name, () => ({ n: 0, hours: 0, rev: 0 }));
        g.n += 1;
        g.hours += l.hours;
        g.rev += l.net;
      }
    return {
      cols: [
        { label: 'Раз', kind: 'num', minor: true },
        { label: 'Часы', kind: 'num', minor: true },
        { label: 'Выручка', kind: 'money' },
        { label: '₽ за час', kind: 'money' },
      ],
      defaultSort: 2,
      rows: [...m].map(([name, g]) => ({
        key: name,
        name,
        vals: [g.n, g.hours, g.rev, g.hours > 0 ? g.rev / g.hours : null],
        revenue: g.rev,
      })),
    };
  }

  if (kind === 'parts') {
    const m = new Map<string, { name: string; man: string; qty: number; unit: string; rev: number; sale: number; cost: number; unknown: number }>();
    for (const o of orders)
      for (const p of o.parts) {
        const g = group(m, `${p.name}|${p.manufacturer}`, () => ({
          name: p.name, man: p.manufacturer, qty: 0, unit: p.unit, rev: 0, sale: 0, cost: 0, unknown: 0,
        }));
        g.qty += p.qty;
        g.rev += p.net;
        if (p.cost === null) g.unknown += 1;
        else {
          g.sale += p.net;
          g.cost += p.cost;
        }
      }
    return {
      cols: [
        { label: 'Кол-во', kind: 'num', minor: true },
        { label: 'Продажа', kind: 'money' },
        { label: 'Закупка', kind: 'money', minor: true },
        { label: 'Наценка', kind: 'money' },
        { label: 'Наценка %', kind: 'pct' },
      ],
      defaultSort: 3,
      rows: [...m].map(([key, g]) => ({
        key,
        name: g.name,
        sub: g.man,
        vals: [g.qty, g.rev, g.cost || null, g.cost ? g.sale - g.cost : null, g.cost ? (g.sale - g.cost) / g.cost : null],
        revenue: g.rev,
        unknown: g.unknown,
      })),
    };
  }

  const byClient = kind === 'clients';
  const m = new Map<string, MockOrder[]>();
  for (const o of orders) group(m, byClient ? o.client : o.vehicle, () => [] as MockOrder[]).push(o);
  return {
    cols: [
      { label: 'Нарядов', kind: 'num', minor: true },
      { label: 'Выручка', kind: 'money' },
      { label: 'Прибыль', kind: 'money' },
      { label: 'Маржа', kind: 'pct', minor: true },
      { label: 'Средний чек', kind: 'money', minor: true },
    ],
    defaultSort: byClient ? 1 : 2,
    rows: [...m].map(([name, list]) => {
      const t = totals(list);
      const last = list.reduce((a, o) => (o.closedAt > a ? o.closedAt : a), list[0].closedAt);
      return {
        key: name,
        name,
        sub: byClient ? `${list[0].vehicle} · закрыт ${f(last, 'd MMM')}` : undefined,
        vals: [t.orders, t.revenue, t.profit, t.margin, t.avgCheck],
        revenue: t.revenue,
        unknown: t.unknownCount,
      };
    }),
  };
}

/** Относительное изменение; `null`, когда сравнивать не с чем. */
export function delta(cur: number | null, prev: number | null): number | null {
  if (cur === null || prev === null || prev === 0) return null;
  return (cur - prev) / Math.abs(prev);
}

/** Круглая верхняя граница оси и шаг: 4–5 делений вида 1/2/2.5/5 × 10ⁿ. */
export function niceScale(max: number): { top: number; step: number } {
  if (max <= 0) return { top: 4, step: 1 };
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * pow).find((s) => s >= raw) ?? 10 * pow;
  return { top: Math.ceil(max / step) * step, step };
}
