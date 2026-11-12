/** Периоды, сравнение и шкала экрана аналитики. Цифры считает сервер (`/analytics/summary`). */
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
  /** Куда ведёт строка; у работ, запчастей и машин ссылки нет. */
  href?: string;
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
