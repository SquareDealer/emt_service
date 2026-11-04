import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PriceListView } from './PriceListView';
import type { PriceListViewProps } from './PriceListView';
import type { PriceListRow, VehicleGeneration } from '../../lib/types';

const noop = () => {};
const row = (id: string, source: 'generation' | 'template' | 'rate', override = false) =>
  ({
    template: { id, name: `Работа ${id}` },
    base: { hours: 1, price: 1000 },
    override: override ? { hours: 2, price: 2000 } : null,
    effective: { hours: 1, price: 1000, source },
    parts_count: 0,
  }) as unknown as PriceListRow;
const gens = [{ id: 'g1', make: 'MINI', model: 'Cooper', code: 'R56', years: '2006-2013' }] as unknown as VehicleGeneration[];
const base = (over: Partial<PriceListViewProps> = {}): PriceListViewProps => ({
  tab: 'works',
  generations: gens,
  generationId: 'g1',
  rows: [row('a', 'generation', true), row('b', 'template'), row('c', 'rate')],
  withOverride: 1,
  onTab: noop,
  onGeneration: noop,
  onSave: noop,
  onClear: noop,
  onEditParts: noop,
  onCopy: noop,
  ...over,
});
const html = (p: Partial<PriceListViewProps> = {}) => renderToStaticMarkup(<PriceListView {...base(p)} />);
const count = (h: string, s: string) => h.split(s).length - 1;

describe('PriceListView', () => {
  it('shows price source labels per row and demo hooks', () => {
    const h = html();
    expect(count(h, 'data-demo="pl-row"')).toBe(3);
    expect(h).toContain('>своя<');
    expect(h).toContain('>базовая<');
    expect(h).toContain('>по ставке<');
    for (const k of ['pl-tab-works', 'pl-tab-parts', 'pl-generation', 'pl-copy', 'pl-parts-btn']) {
      expect(h).toContain(`data-demo="${k}"`);
    }
    expect(h).toContain('data-id="a"');
  });

  it('hides source labels without a generation', () => {
    const h = html({ generationId: null });
    expect(h).not.toContain('>своя<');
    expect(h).not.toContain('data-demo="pl-copy"');
  });

  it('renders partsSlot on the parts tab and marks highlight', () => {
    expect(html({ tab: 'parts', partsSlot: <i id="slot" /> })).toContain('id="slot"');
    expect(count(html({ highlightTemplateId: 'b' }), 'data-highlight')).toBe(1);
  });
});
