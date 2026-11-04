import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SearchPaletteView } from './SearchPaletteView';
import type { SearchHit } from '../lib/types';

const noop = () => {};
const hits = [
  { id: 'c1', type: 'client', full_name: 'Иванов', phone: '+79001112233' },
  { id: 'v1', type: 'vehicle', vin: 'WMW123', make: 'MINI', client: { id: 'c1', full_name: 'Иванов', phone: '' } },
] as unknown as SearchHit[];
const html = (active: number) =>
  renderToStaticMarkup(
    <SearchPaletteView q="ива" hits={hits} active={active} onQ={noop} onKeyDown={noop} onHover={noop} onPick={noop} onClose={noop} />,
  );

describe('SearchPaletteView', () => {
  it('marks the active hit as selected', () => {
    const h = html(1);
    const items = h.split('data-demo="search-hit"').slice(1);
    expect(items).toHaveLength(2);
    expect(items[0]).toContain('aria-selected="false"');
    expect(items[1]).toContain('aria-selected="true"');
    expect(h).toContain('data-demo="search-input"');
  });
});
