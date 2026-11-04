import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { ClientCardView } from './ClientCardView';
import type { ClientCardViewProps } from './ClientCardView';
import type { Client, Vehicle, WorkOrder } from '../../lib/types';

const noop = () => {};
const client = {
  id: 'c1',
  full_name: 'Иван Петров',
  phone: '+79001234567',
  source: 'manual',
  created_at: '2026-01-10T10:00:00Z',
  discount_default_pct: 0,
  imported_deals_count: 0,
  imported_deals_sum: 0,
  notes: null,
} as unknown as Client;
const veh = (id: string) =>
  ({ id, make: 'MINI', model: 'Cooper', plate: `A${id}`, year: 2012, mileage: 100000 }) as unknown as Vehicle;
const wo = (id: string) =>
  ({
    id,
    status: 'scheduled',
    title: `Наряд ${id}`,
    total_cached: 1000,
    scheduled_at: null,
    vehicle: veh('v1'),
  }) as unknown as WorkOrder;
const base = (over: Partial<ClientCardViewProps> = {}): ClientCardViewProps => ({
  client,
  vehicles: [veh('v1'), veh('v2')],
  orders: [wo('a'), wo('b'), wo('c')],
  onEdit: noop,
  onDelete: noop,
  onAddVehicle: noop,
  onEditVehicle: noop,
  onNewWorkOrder: noop,
  onOpenOrder: noop,
  ...over,
});
const html = (p: Partial<ClientCardViewProps> = {}) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <ClientCardView {...base(p)} />
    </MemoryRouter>,
  );
const count = (h: string, s: string) => h.split(s).length - 1;

describe('ClientCardView', () => {
  it('renders one order-row per order and demo hooks', () => {
    const h = html();
    expect(count(h, 'data-demo="order-row"')).toBe(3);
    expect(count(h, 'data-demo="vehicle-row"')).toBe(2);
    expect(count(h, 'data-demo="new-work-order"')).toBe(2);
    for (const k of ['client-head', 'client-edit', 'client-orders']) {
      expect(h).toContain(`data-demo="${k}"`);
    }
    expect(h).not.toContain('data-highlight');
  });

  it('marks the highlighted order', () => {
    const h = html({ highlightOrderId: 'b' });
    expect(count(h, 'data-highlight')).toBe(1);
  });
});
