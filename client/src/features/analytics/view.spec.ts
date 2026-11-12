import { describe, expect, it } from 'vitest';
import type { AnalyticsBreakdown, AnalyticsBucket } from '../../lib/types';
import { periodOf } from './analytics';
import { breakdownView, bucketsView, unitLabel } from './view';

const week = periodOf('week', new Date(2026, 10, 11));
const apiBuckets: AnalyticsBucket[] = week.buckets.map((b, i) => ({
  from: b.from.toISOString(),
  to: b.to.toISOString(),
  orders: i,
  labor: 100 * i,
  markup: 10 * i,
  cost: 5 * i,
  unknown: i,
  revenue: i === 2 ? 5000 : 0,
  profit: 50 * i,
}));

const empty: AnalyticsBreakdown = { labor: [], parts: [], vehicles: [], clients: [] };
const part = {
  key: 'k1', name: 'Фильтр', manufacturer: 'Mann', unit: 'pcs' as const, qty: 3, revenue: 2850,
  cost: 1560 as number | null, markup: 1290 as number | null, markup_pct: 0.827 as number | null, unknown_count: 1,
};
const bd: AnalyticsBreakdown = {
  labor: [{ key: 'Замена масла', name: 'Замена масла', count: 4, hours: 2, revenue: 8000, per_hour: 4000 }],
  parts: [part],
  vehicles: [{ key: 'v1', name: 'MINI Cooper · F56', orders: 2, revenue: 9000, profit: 4000, margin: 0.44, avg_check: 4500, unknown_count: 0 }],
  clients: [{
    client_id: 'c1', name: 'Иванов', vehicle: 'MINI Cooper · F56', last_closed_at: new Date(2026, 10, 11, 12).toISOString(),
    orders: 2, revenue: 9000, profit: 4000, margin: 0.44, avg_check: 4500, unknown_count: 2,
  }],
};

describe('bucketsView', () => {
  it('склеивает подписи периода с цифрами по индексу', () => {
    const view = bucketsView(week, apiBuckets);
    expect(view).toHaveLength(7);
    expect(view[2].revenue).toBe(5000);
    expect(view[2].label).toBe('ср');
    expect(view[2].from.getTime()).toBe(week.buckets[2].from.getTime());
    expect(view[2].title).toBe(week.buckets[2].title);
    expect(view[3]).toMatchObject({ orders: 3, labor: 300, markup: 30, cost: 15, unknown: 3, profit: 150 });
  });
  it('бросает ошибку при несовпадении числа корзин', () => {
    expect(() => bucketsView(week, apiBuckets.slice(1))).toThrow(/корзин/);
  });
});

describe('breakdownView', () => {
  it('labor: значения и колонки прототипа', () => {
    const v = breakdownView('labor', bd);
    expect(v.cols.map((c) => [c.label, !!c.minor])).toEqual([['Раз', true], ['Часы', true], ['Выручка', false], ['₽ за час', false]]);
    expect(v.rows[0]).toMatchObject({ key: 'Замена масла', vals: [4, 2, 8000, 4000], revenue: 8000 });
  });
  it('parts: значения, производитель в sub, без ссылки', () => {
    const v = breakdownView('parts', bd);
    expect(v.cols.map((c) => [c.label, !!c.minor])).toEqual([
      ['Кол-во', true], ['Продажа', false], ['Закупка', true], ['Наценка', false], ['Наценка %', false],
    ]);
    const row = v.rows[0];
    expect(row).toMatchObject({ key: 'k1', name: 'Фильтр', sub: 'Mann', vals: [3, 2850, 1560, 1290, 0.827], unknown: 1 });
    expect(row.href).toBeUndefined();
  });
  it('parts: cost null остаётся null, а 0 остаётся 0', () => {
    const nulls = breakdownView('parts', { ...empty, parts: [{ ...part, cost: null, markup: null, markup_pct: null }] });
    expect(nulls.rows[0].vals).toEqual([3, 2850, null, null, null]);
    const zeros = breakdownView('parts', { ...empty, parts: [{ ...part, cost: 0, markup: 0, markup_pct: 0 }] });
    expect(zeros.rows[0].vals).toEqual([3, 2850, 0, 0, 0]);
  });
  it('parts: без производителя нет sub', () => {
    const v = breakdownView('parts', { ...empty, parts: [{ ...part, manufacturer: null }] });
    expect(v.rows[0].sub).toBeUndefined();
  });
  it('vehicles: без ссылки и подписи', () => {
    const row = breakdownView('vehicles', bd).rows[0];
    expect(row).toMatchObject({ key: 'v1', name: 'MINI Cooper · F56', vals: [2, 9000, 4000, 0.44, 4500], unknown: 0 });
    expect(row.href).toBeUndefined();
    expect(row.sub).toBeUndefined();
  });
  it('clients: ссылка на карточку и дата последнего наряда', () => {
    const row = breakdownView('clients', bd).rows[0];
    expect(row.key).toBe('c1');
    expect(row.href).toBe('/clients/c1');
    expect(row.sub).toMatch(/MINI Cooper · F56 · закрыт 11 нояб/);
    expect(row.unknown).toBe(2);
  });
  it('сохраняет сортировку по умолчанию прототипа', () => {
    expect([breakdownView('labor', bd).defaultSort, breakdownView('parts', bd).defaultSort,
      breakdownView('vehicles', bd).defaultSort, breakdownView('clients', bd).defaultSort]).toEqual([2, 3, 2, 1]);
  });
  it('пустой ответ → пустые rows, колонки на месте', () => {
    const counts = (['labor', 'parts', 'vehicles', 'clients'] as const).map((k) => {
      const v = breakdownView(k, empty);
      expect(v.rows).toEqual([]);
      return v.cols.length;
    });
    expect(counts).toEqual([4, 5, 5, 5]);
  });
});

describe('unitLabel', () => {
  it('pcs → шт, l → л', () => {
    expect([unitLabel('pcs'), unitLabel('l')]).toEqual(['шт', 'л']);
  });
});
