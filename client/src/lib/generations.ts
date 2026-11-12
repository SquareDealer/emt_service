import type { VehicleGeneration } from './types';

/** «MINI Cooper R56» — how a generation is named everywhere in the UI. */
export function genLabel(g: VehicleGeneration): string {
  return `${g.make} ${[g.model, g.code].filter(Boolean).join(' ')}`.trim();
}

export interface GenerationGroup {
  make: string;
  items: VehicleGeneration[];
}

/**
 * The catalog as the pickers show it: filtered by a free-text query and grouped
 * by make. Every word of the query has to match somewhere in make / model /
 * code / years, so «mini f56» narrows instead of widening. Makes and the
 * generations inside them keep the order they arrived in (the server sorts).
 */
export function groupGenerations(list: VehicleGeneration[], q: string): GenerationGroup[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const groups = new Map<string, VehicleGeneration[]>();
  for (const g of list) {
    const haystack = [g.make, g.model, g.code, g.years].filter(Boolean).join(' ').toLowerCase();
    if (!words.every((w) => haystack.includes(w))) continue;
    const items = groups.get(g.make);
    if (items) items.push(g);
    else groups.set(g.make, [g]);
  }
  return [...groups].map(([make, items]) => ({ make, items }));
}
