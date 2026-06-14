import type { LaborLine, PartLine, WorkOrder } from './types';

/** Format a number as RUB without trailing kopecks unless present. */
export function money(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  const v = Number(n);
  const hasFraction = Math.round(v * 100) % 100 !== 0;
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(v) + ' ₽';
}

export function num(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('ru-RU').format(Number(n));
}

/** Pretty Russian phone: +7 (999) 123-45-67 */
export function phone(raw: string | null | undefined): string {
  if (!raw) return '—';
  const d = raw.replace(/\D/g, '');
  if (d.length === 11 && (d[0] === '7' || d[0] === '8')) {
    return `+7 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9, 11)}`;
  }
  return raw;
}

export function dateShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function timeOnly(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

export function laborTotal(l: Pick<LaborLine, 'hours' | 'rate_snapshot' | 'price_override'>): number {
  if (l.price_override !== null && l.price_override !== undefined) return l.price_override;
  return (l.hours ?? 0) * l.rate_snapshot;
}

export function partTotal(p: Pick<PartLine, 'qty' | 'unit_price'>): number {
  return p.qty * p.unit_price;
}

export function subtotal(wo: WorkOrder): number {
  const l = (wo.labor_lines ?? []).reduce((s, x) => s + laborTotal(x), 0);
  const p = (wo.part_lines ?? []).reduce((s, x) => s + partTotal(x), 0);
  return l + p;
}

export function discountAmount(wo: WorkOrder): number {
  const sub = subtotal(wo);
  if (!wo.discount_type || wo.discount_value == null) return 0;
  if (wo.discount_type === 'percent') {
    return sub * (Math.min(Math.max(wo.discount_value, 0), 100) / 100);
  }
  return Math.min(sub, wo.discount_value);
}

const SOURCE_LABEL: Record<string, string> = {
  manual: 'Вручную',
  csv_import: 'Импорт',
  telegram_bot: 'Telegram',
};
export function sourceLabel(s: string | undefined): string {
  return s ? SOURCE_LABEL[s] ?? s : '';
}
