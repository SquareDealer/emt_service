import type { Comparison, Period } from './analytics';

export { MAX_PURCHASE_PRICE, parsePrice } from '../../lib/price';

/** Сервер принимает не более 200 строк за один PATCH /analytics/part-costs. */
export const COSTS_CHUNK = 200;

/** Границы корзин (на одну больше корзин) и период сравнения — полные ISO-инстанты. */
export function summaryParams(p: Period, cmp: Comparison): { edges: string[]; prev: { from: string; to: string } } {
  return {
    edges: [...p.buckets.map((b) => b.from.toISOString()), p.to.toISOString()],
    prev: { from: cmp.previous.from.toISOString(), to: cmp.previous.to.toISOString() },
  };
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
