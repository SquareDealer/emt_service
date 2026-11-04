import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ApplyTemplateView } from './ApplyTemplateView';
import type { ApplyTemplateViewProps } from './ApplyTemplateView';
import { money } from '../../lib/format';
import type { TemplatePreview } from '../../lib/types';

const noop = () => {};
const preview: TemplatePreview = {
  template_id: 't1',
  group_name: 'Замена масла',
  labor: { name: 'Замена масла', hours: 1, rate_snapshot: 2500, price_override: null },
  price_source: 'generation',
  parts: [
    { part_template_id: 'p1', name: 'Масло 5W30', manufacturer: 'Castrol', catalog_number: 'C1', unit: 'l', qty: 4, unit_price: 1000, is_default: true, generation_specific: true },
    { part_template_id: 'p2', name: 'Фильтр', manufacturer: null, catalog_number: null, unit: 'pcs', qty: 1, unit_price: 500, is_default: false, generation_specific: false },
  ],
};
const base = (over: Partial<ApplyTemplateViewProps> = {}): ApplyTemplateViewProps => ({
  open: true,
  preview,
  picked: new Set(['p1']),
  qty: { p1: '4', p2: '1' },
  total: 6500,
  onToggle: noop,
  onQty: noop,
  onConfirm: noop,
  onClose: noop,
  ...over,
});
const html = (p: Partial<ApplyTemplateViewProps> = {}) => renderToStaticMarkup(<ApplyTemplateView {...base(p)} />);

describe('ApplyTemplateView', () => {
  it('confirm button shows the total and demo hooks are present', () => {
    const h = html();
    expect(h).toMatch(new RegExp(`data-demo="apply-confirm"[^>]*>.*${money(6500).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    expect(h).toContain('data-demo="apply-labor"');
    expect(h.match(/data-demo="apply-part"/g)).toHaveLength(2);
    expect(h).toContain('data-id="p2"');
  });

  it('unpicked part has an unchecked checkbox, picked one is checked', () => {
    const h = html();
    expect(h.match(/type="checkbox"/g)).toHaveLength(2);
    expect(h.match(/checked=""/g)).toHaveLength(1);
  });

  it('inline renders an open dialog', () => {
    expect(html({ inline: true })).toContain('<dialog open');
  });

  it('loading shows no parts and disables confirm', () => {
    const h = html({ preview: undefined, loading: true });
    expect(h).not.toContain('data-demo="apply-part"');
    expect(h).toMatch(/data-demo="apply-confirm"[^>]*disabled/);
  });
});
