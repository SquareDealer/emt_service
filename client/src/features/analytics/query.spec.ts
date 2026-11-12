import { describe, expect, it } from 'vitest';
import { comparisonFor, periodOf, type PeriodKind } from './analytics';
import { chunk, parsePrice, summaryParams } from './query';

const NOV12 = new Date(2026, 10, 12);
const params = (kind: PeriodKind, anchor: Date, now = new Date(2026, 10, 12, 15)) => {
  const p = periodOf(kind, anchor);
  return summaryParams(p, comparisonFor(p, now));
};

describe('summaryParams', () => {
  it('месяц: границ на одну больше, чем дней, все — полные ISO с Z', () => {
    const { edges } = params('month', NOV12);
    expect(edges).toHaveLength(31);
    expect(edges.every((e) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(e))).toBe(true);
    expect(new Date(edges[0]).getTime()).toBe(new Date(2026, 10, 1).getTime());
    expect(new Date(edges[30]).getTime()).toBe(new Date(2026, 11, 1).getTime());
  });

  it.each(['week', 'month', 'quarter', 'year'] as const)('границы строго возрастают: %s', (kind) => {
    const { edges } = params(kind, NOV12);
    for (let i = 0; i < edges.length - 1; i++) {
      expect(new Date(edges[i]).getTime()).toBeLessThan(new Date(edges[i + 1]).getTime());
    }
  });

  it('квартал укладывается в лимит 63 границы', () => {
    expect(params('quarter', NOV12).edges.length).toBeLessThanOrEqual(63);
  });

  it('идущий период: prev — столько же дней с начала прошлого', () => {
    const { prev } = params('month', NOV12);
    expect(new Date(prev.from).getTime()).toBe(new Date(2026, 9, 1).getTime());
    expect(new Date(prev.to).getTime()).toBe(new Date(2026, 9, 13).getTime());
  });

  it('завершённый период: prev — весь предыдущий', () => {
    const { prev } = params('month', new Date(2026, 9, 15));
    expect(new Date(prev.from).getTime()).toBe(new Date(2026, 8, 1).getTime());
    expect(new Date(prev.to).getTime()).toBe(new Date(2026, 9, 1).getTime());
  });
});

describe('parsePrice', () => {
  it.each([['520', 520], ['12,5', 12.5], ['1 250,40', 1250.4], ['0', 0]])('parsePrice(%s) = %s', (raw, v) => {
    expect(parsePrice(raw)).toEqual({ kind: 'ok', value: v });
  });
  it.each(['abc', '-3', '1e30', '9999999999.999', '12,5,1'])('parsePrice(%s) невалидно', (raw) => {
    expect(parsePrice(raw)).toEqual({ kind: 'invalid' });
  });
  it.each(['', '   '])('parsePrice(%p) пусто', (raw) => {
    expect(parsePrice(raw)).toEqual({ kind: 'empty' });
  });
  it('верхний предел включительно', () => {
    expect(parsePrice('9999999999.99')).toEqual({ kind: 'ok', value: 9_999_999_999.99 });
  });
});

describe('chunk', () => {
  it('401 элемент по 200 → 200, 200, 1', () => {
    expect(chunk(Array.from({ length: 401 }, (_, i) => i), 200).map((c) => c.length)).toEqual([200, 200, 1]);
  });
  it('chunk([]) → []', () => {
    expect(chunk([], 200)).toEqual([]);
  });
});
