/** Предел закупки за единицу на сервере (numeric(12,2)). */
export const MAX_PURCHASE_PRICE = 9_999_999_999.99;

/** '' → empty; валидное → ok; иначе invalid. Запятая = точка, пробелы игнорируются, не больше двух знаков после запятой. */
export function parsePrice(raw: string): { kind: 'empty' } | { kind: 'ok'; value: number } | { kind: 'invalid' } {
  const s = raw.replace(/\s+/g, '').replace(',', '.');
  if (s === '') return { kind: 'empty' };
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return { kind: 'invalid' };
  const value = Number(s);
  if (!Number.isFinite(value) || value > MAX_PURCHASE_PRICE) return { kind: 'invalid' };
  return { kind: 'ok', value };
}
