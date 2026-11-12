import { parsePrice } from '../features/analytics/query';
import type { PartTemplate, PartUnit } from './types';

export interface PartFilter {
  /** Free text; every word must be found in name, manufacturer or article. */
  q: string;
  /** Exact manufacturer, null = any. */
  manufacturer: string | null;
  /** Parts to leave out — e.g. the ones already attached to the work. */
  excludeIds?: ReadonlySet<string>;
}

/**
 * Local catalog filter for the part picker. The words of the query may land in
 * different fields («фильтр mann» = name + brand), which is how a receptionist
 * actually types. Incoming order is kept — the server already sorts by name.
 */
export function filterParts(parts: PartTemplate[], f: PartFilter): PartTemplate[] {
  const words = f.q.toLowerCase().split(/\s+/).filter(Boolean);
  return parts.filter((p) => {
    if (f.excludeIds?.has(p.id)) return false;
    if (f.manufacturer !== null && (p.manufacturer ?? '').trim() !== f.manufacturer) return false;
    if (words.length === 0) return true;
    const hay = `${p.name} ${p.manufacturer ?? ''} ${p.catalog_number ?? ''}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** Unique non-empty manufacturers of a catalog, sorted for the filter chips. */
export function manufacturersOf(parts: PartTemplate[]): string[] {
  const set = new Set<string>();
  for (const p of parts) {
    const m = (p.manufacturer ?? '').trim();
    if (m) set.add(m);
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'ru'));
}

export interface PartTemplateFields {
  name: string;
  manufacturer: string;
  catalog_number: string;
  unit: PartUnit;
  price: string;
  purchase: string;
}

/**
 * Body of POST/PATCH for the parts catalog. The server answers 403 to a
 * non-owner whose body has a `purchase_price` key at all (even null), so the key
 * exists only for the owner, and only when a value is set (create) or changed
 * (edit). An invalid entry is never sent — the form blocks submit before that.
 */
export function partTemplateBody(
  f: PartTemplateFields,
  opts: { owner: boolean; initial?: PartTemplate },
): Partial<PartTemplate> {
  const body: Partial<PartTemplate> = {
    name: f.name.trim(),
    manufacturer: f.manufacturer.trim() || null,
    catalog_number: f.catalog_number.trim() || null,
    unit: f.unit,
    // Cleared price → explicit null: «цена не задана», never 0.
    default_price: f.price ? Number(f.price) : null,
  };
  if (!opts.owner) return body;
  const parsed = parsePrice(f.purchase);
  if (parsed.kind === 'invalid') return body;
  const before = opts.initial?.purchase_price ?? null;
  const next = parsed.kind === 'ok' ? parsed.value : null;
  if (opts.initial ? next !== before : next !== null) body.purchase_price = next;
  return body;
}
