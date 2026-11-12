const nf0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });

/** Аналитика показывает рубли без копеек: копейки тут шум, а не точность. */
export function rub(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : `${nf0.format(Math.round(n))} ₽`;
}

export function count(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : nf1.format(n);
}

export function pct(share: number | null | undefined, digits = 0): string {
  if (share === null || share === undefined) return '—';
  return `${(share * 100).toFixed(digits).replace('.', ',')} %`;
}

/** Подпись оси: 0 · 50 тыс · 1,5 млн. */
export function rubAxis(n: number): string {
  if (n === 0) return '0';
  if (n >= 1_000_000) return `${nf1.format(n / 1_000_000)} млн`;
  if (n >= 1000) return `${nf1.format(n / 1000)} тыс`;
  return nf0.format(n);
}

export function signedPct(share: number): string {
  const v = Math.round(Math.abs(share) * 100);
  return `${share < 0 ? '−' : '+'}${v} %`;
}
