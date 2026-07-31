import { PriceResolutionService } from './price-resolution.service';

const p = new PriceResolutionService();
const RATE = 2000;

describe('PriceResolutionService.resolve', () => {
  it('prefers the generation override over the template default', () => {
    const r = p.resolve({ default_hours: 1, default_price: 2000 }, { hours: 1.5, price: 2800 }, RATE);
    expect(r).toMatchObject({ hours: 1.5, price_override: 2800, source: 'generation' });
  });

  it('falls back to the template default when the generation has no row', () => {
    const r = p.resolve({ default_hours: 1.5, default_price: 3000 }, null, RATE);
    expect(r).toMatchObject({ hours: 1.5, price_override: 3000, source: 'template' });
  });

  it('reports «rate» when nothing is priced at all', () => {
    // This is the case that must never pass silently: the shop asked for a
    // per-generation price and there isn't one, nor even a template default.
    const r = p.resolve({ default_hours: null, default_price: null }, null, RATE);
    expect(r).toEqual({ hours: null, price_override: null, rate_snapshot: RATE, source: 'rate' });
  });

  it('resolves hours and price independently', () => {
    // An override may set only the hours, keeping the template's fixed price.
    const r = p.resolve({ default_hours: 1, default_price: 2500 }, { hours: 2, price: null }, RATE);
    expect(r).toMatchObject({ hours: 2, price_override: 2500, source: 'generation' });
  });

  it('keeps an explicit zero instead of treating it as missing', () => {
    const r = p.resolve({ default_hours: 1, default_price: 2500 }, { hours: null, price: 0 }, RATE);
    expect(r.price_override).toBe(0);
    expect(r.source).toBe('generation');
  });

  it('always snapshots the current hourly rate', () => {
    expect(p.resolve({ default_hours: 1 }, null, 3333).rate_snapshot).toBe(3333);
  });

  it('survives a missing template', () => {
    expect(p.resolve(null, null, RATE)).toMatchObject({ source: 'rate', rate_snapshot: RATE });
  });
});

describe('PriceResolutionService.effective', () => {
  it('bills hours × rate when no fixed price is set', () => {
    const e = p.effective({ default_hours: 1.5, default_price: null }, null, RATE);
    expect(e).toEqual({ hours: 1.5, price: 3000, source: 'template' });
  });

  it('uses the fixed price when there is one', () => {
    const e = p.effective({ default_hours: 1, default_price: 2500 }, null, RATE);
    expect(e.price).toBe(2500);
  });

  it('shows the generation price and says where it came from', () => {
    const e = p.effective({ default_hours: 1, default_price: 2000 }, { hours: null, price: 2800 }, RATE);
    expect(e).toMatchObject({ price: 2800, source: 'generation' });
  });

  it('has no price to show when nothing is configured', () => {
    expect(p.effective({}, null, RATE)).toEqual({ hours: null, price: null, source: 'rate' });
  });
});
