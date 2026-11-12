/**
 * Преобразование ответа `/analytics/summary` в вид экрана. Подписи периода строит клиент
 * (`periodOf`), цифры приходят с сервера; склейка — по индексу корзины.
 */
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import type { AnalyticsBreakdown, AnalyticsBucket } from '../../lib/types';
import type { Breakdown, BreakdownKind, Period } from './analytics';

export interface ChartBucket {
  from: Date;
  to: Date;
  label: string;
  title: string;
  orders: number;
  labor: number;
  markup: number;
  cost: number;
  unknown: number;
  revenue: number;
  profit: number;
}

export function bucketsView(p: Period, api: AnalyticsBucket[]): ChartBucket[] {
  if (api.length !== p.buckets.length) {
    throw new Error(`Число корзин в ответе (${api.length}) не совпадает с периодом (${p.buckets.length})`);
  }
  return p.buckets.map((b, i) => {
    const a = api[i];
    return {
      ...b,
      orders: a.orders,
      labor: a.labor,
      markup: a.markup,
      cost: a.cost,
      unknown: a.unknown,
      revenue: a.revenue,
      profit: a.profit,
    };
  });
}

export { unitLabel } from '../../lib/parts';

const day = (iso: string) => format(new Date(iso), 'd MMM', { locale: ru });

export function breakdownView(kind: BreakdownKind, bd: AnalyticsBreakdown): Breakdown {
  if (kind === 'labor') {
    return {
      cols: [
        { label: 'Раз', kind: 'num', minor: true },
        { label: 'Часы', kind: 'num', minor: true },
        { label: 'Выручка', kind: 'money' },
        { label: '₽ за час', kind: 'money' },
      ],
      defaultSort: 2,
      rows: bd.labor.map((r) => ({
        key: r.key,
        name: r.name,
        vals: [r.count, r.hours, r.revenue, r.per_hour],
        revenue: r.revenue,
      })),
    };
  }

  if (kind === 'parts') {
    return {
      cols: [
        { label: 'Кол-во', kind: 'num', minor: true },
        { label: 'Продажа', kind: 'money' },
        { label: 'Закупка', kind: 'money', minor: true },
        { label: 'Наценка', kind: 'money' },
        { label: 'Наценка %', kind: 'pct' },
      ],
      defaultSort: 3,
      rows: bd.parts.map((r) => ({
        key: r.key,
        name: r.name,
        sub: r.manufacturer ?? undefined,
        vals: [r.qty, r.revenue, r.cost, r.markup, r.markup_pct],
        revenue: r.revenue,
        unknown: r.unknown_count,
      })),
    };
  }

  const cols = [
    { label: 'Нарядов', kind: 'num' as const, minor: true },
    { label: 'Выручка', kind: 'money' as const },
    { label: 'Прибыль', kind: 'money' as const },
    { label: 'Маржа', kind: 'pct' as const, minor: true },
    { label: 'Средний чек', kind: 'money' as const, minor: true },
  ];

  if (kind === 'vehicles') {
    return {
      cols,
      defaultSort: 2,
      rows: bd.vehicles.map((r) => ({
        key: r.key,
        name: r.name,
        vals: [r.orders, r.revenue, r.profit, r.margin, r.avg_check],
        revenue: r.revenue,
        unknown: r.unknown_count,
      })),
    };
  }

  return {
    cols,
    defaultSort: 1,
    rows: bd.clients.map((r) => ({
      key: r.client_id,
      name: r.name,
      sub: `${r.vehicle} · закрыт ${day(r.last_closed_at)}`,
      href: `/clients/${r.client_id}`,
      vals: [r.orders, r.revenue, r.profit, r.margin, r.avg_check],
      revenue: r.revenue,
      unknown: r.unknown_count,
    })),
  };
}
