import { describe, expect, it } from 'vitest';
import { comparisonFor, delta, niceScale, periodOf } from './analytics';

describe('analytics: периоды и шкала', () => {
  it('periodOf(week) начинается с понедельника и даёт 7 корзин', () => {
    const p = periodOf('week', new Date(2026, 10, 12)); // четверг
    expect(p.from.getDay()).toBe(1);
    expect(p.from.getDate()).toBe(9);
    expect(p.buckets).toHaveLength(7);
  });

  it('periodOf(year) даёт 12 корзин-месяцев', () => {
    const p = periodOf('year', new Date(2026, 10, 12));
    expect(p.buckets).toHaveLength(12);
    expect(p.buckets[0].from.getMonth()).toBe(0);
    expect(p.buckets[11].from.getMonth()).toBe(11);
  });

  it('comparisonFor для идущего месяца режет прошлый до того же числа дней', () => {
    const p = periodOf('month', new Date(2026, 10, 12));
    const c = comparisonFor(p, new Date(2026, 10, 12, 15));
    expect(c.partial).toBe(true);
    expect(c.previous.to.getTime() - c.previous.from.getTime()).toBe(12 * 86_400_000);
  });

  it('comparisonFor для завершённого месяца берёт прошлый целиком', () => {
    const p = periodOf('month', new Date(2026, 8, 10));
    const c = comparisonFor(p, new Date(2026, 10, 12));
    expect(c.partial).toBe(false);
    expect(c.previous.from).toEqual(new Date(2026, 7, 1));
    expect(c.previous.to).toEqual(new Date(2026, 8, 1));
  });

  it('delta: нет базы → null', () => {
    expect(delta(5, 0)).toBeNull();
    expect(delta(5, null)).toBeNull();
    expect(delta(150, 100)).toBe(0.5);
  });

  it('niceScale(0) не даёт нулевой шаг', () => {
    expect(niceScale(0).step).toBeGreaterThan(0);
  });

  it('модуль не экспортирует клиентскую агрегацию', async () => {
    const m = await import('./analytics');
    const keys = Object.keys(m);
    for (const k of ['totals', 'series', 'breakdown', 'inRange']) expect(keys).not.toContain(k);
  });
});
