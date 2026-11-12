import type { PartTemplate } from './types';

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
