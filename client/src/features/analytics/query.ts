import type { Comparison, Period } from './analytics';

/** Предел закупки за единицу на сервере (numeric(12,2)). */
export const MAX_PURCHASE_PRICE = 9_999_999_999.99;
/** Сервер принимает не более 200 строк за один PATCH /analytics/part-costs. */
export const COSTS_CHUNK = 200;

/** Границы корзин (на одну больше корзин) и период сравнения — полные ISO-инстанты. */
export function summaryParams(p: Period, cmp: Comparison): { edges: string[]; prev: { from: string; to: string } } {
  return {
    edges: [...p.buckets.map((b) => b.from.toISOString()), p.to.toISOString()],
    prev: { from: cmp.previous.from.toISOString(), to: cmp.previous.to.toISOString() },
  };
}

/** '' → empty; валидное → ok; иначе invalid. Запятая = точка, пробелы игнорируются. */
export function parsePrice(raw: string): { kind: 'empty' } | { kind: 'ok'; value: number } | { kind: 'invalid' } {
  const s = raw.replace(/\s+/g, '').replace(',', '.');
  if (s === '') return { kind: 'empty' };
  if (!/^\d+(\.\d+)?$/.test(s)) return { kind: 'invalid' };
  const value = Number(s);
  if (!Number.isFinite(value) || value > MAX_PURCHASE_PRICE) return { kind: 'invalid' };
  return { kind: 'ok', value };
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
