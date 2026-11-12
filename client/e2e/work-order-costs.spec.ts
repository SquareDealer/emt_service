import { expect, test, type Page } from '@playwright/test';

/**
 * Purchase-cost panel on the work order page: owner-only, per-unit input, the
 * PATCH contract (`{ items: [{ part_line_id, purchase_price }] }`, null clears).
 * All `/api/**` traffic is stubbed — the repo's e2e convention.
 */

test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

const owner = { id: 'owner-1', name: 'Владелец', login: 'owner', role: 'owner' };
const receptionist = { id: 'r-1', name: 'Приёмщик', login: 'rec', role: 'master_receptionist' };

const json = (body: unknown, status = 200) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

const partLine = (id: string, name: string) => ({
  id,
  work_order_id: 'wo1',
  name,
  catalog_number: null,
  manufacturer: 'MANN',
  qty: 2,
  unit: 'pcs',
  unit_price: 1000,
  part_template_id: null,
  discount_type: null,
  discount_value: null,
  group_key: null,
  group_name: null,
  group_sort: 0,
  sort: 0,
});

const wo = {
  id: 'wo1',
  vehicle_id: 'v1',
  assigned_master_id: null,
  status: 'in_progress',
  title: 'ТО',
  notes: null,
  complaint: null,
  recommendation: null,
  scheduled_at: null,
  scheduled_duration_min: null,
  discount_type: null,
  discount_value: null,
  total_cached: 4000,
  total_frozen: null,
  paid_amount: 0,
  closed_at: null,
  doc_number: null,
  order_doc_number: null,
  created_at: '2026-11-10T09:00:00.000Z',
  vehicle: {
    id: 'v1',
    client_id: 'c1',
    vin: null,
    make: 'MINI',
    model: 'Cooper',
    generation_code: null,
    generation_id: null,
    plate: 'А123ВС77',
    year: 2010,
    mileage: null,
    notes: null,
    created_at: '2026-01-01T00:00:00.000Z',
    client: { id: 'c1', full_name: 'Иванов Иван', phone: '+79990000000' },
  },
  labor_lines: [],
  part_lines: [partLine('pl1', 'Фильтр масляный'), partLine('pl2', 'Фильтр воздушный')],
};

async function setup(page: Page, user: typeof owner) {
  const patches: unknown[] = [];
  const analytics: string[] = [];
  // Stateful stub: a refetch after a save must see what was saved.
  const costs = new Map<string, number | null>([['pl1', null], ['pl2', 250]]);

  await page.context().addInitScript(() => localStorage.setItem('crm-token', 'test-token'));
  await page.route('**/api/**', (route) => route.fulfill(json({})));
  await page.route('**/api/auth/me', (route) => route.fulfill(json(user)));
  await page.route('**/api/users', (route) => route.fulfill(json([])));
  await page.route('**/api/settings', (route) => route.fulfill(json({ labor_rate: 2000 })));
  await page.route('**/api/work-orders/wo1', (route) => route.fulfill(json(wo)));
  await page.route('**/api/analytics/**', (route) => {
    const req = route.request();
    analytics.push(req.url());
    if (req.method() === 'PATCH') {
      const body = req.postDataJSON() as { items: { part_line_id: string; purchase_price: number | null }[] };
      patches.push(body);
      for (const i of body.items) costs.set(i.part_line_id, i.purchase_price);
      return route.fulfill(json({ updated: body.items.length }));
    }
    return route.fulfill(
      json(
        wo.part_lines.map((l) => ({
          part_line_id: l.id,
          name: l.name,
          manufacturer: l.manufacturer,
          qty: l.qty,
          unit: l.unit,
          purchase_price: costs.get(l.id) ?? null,
        })),
      ),
    );
  });
  return { patches, analytics };
}

test('owner: the panel sends exactly the changed price, null on clear, nothing on a no-op blur', async ({ page }) => {
  const seen = await setup(page, owner);
  await page.goto('/work-orders/wo1');

  await expect(page.getByRole('heading', { name: 'Закупка' })).toBeVisible();
  const filter = page.getByLabel('Закупка за ед.: Фильтр масляный');
  const air = page.getByLabel('Закупка за ед.: Фильтр воздушный');
  await expect(air).toHaveValue('250');

  await filter.fill('520');
  await filter.press('Enter');
  await expect.poll(() => seen.patches).toEqual([{ items: [{ part_line_id: 'pl1', purchase_price: 520 }] }]);

  await air.fill('');
  await air.press('Enter');
  await expect
    .poll(() => seen.patches)
    .toEqual([
      { items: [{ part_line_id: 'pl1', purchase_price: 520 }] },
      { items: [{ part_line_id: 'pl2', purchase_price: null }] },
    ]);

  // Re-typing the saved value and leaving the field must not hit the server.
  await expect(filter).toHaveValue('520');
  await filter.fill('520');
  await filter.blur();
  await expect(filter).toHaveValue('520');
  await page.waitForLoadState('networkidle');
  expect(seen.patches).toHaveLength(2);
});

test('master_receptionist: no panel and no analytics requests', async ({ page }) => {
  const seen = await setup(page, receptionist);
  await page.goto('/work-orders/wo1');

  await expect(page.getByRole('heading', { name: 'Запчасти' })).toBeVisible();
  await expect(page.getByText('Фильтр масляный').first()).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: 'Закупка' })).toHaveCount(0);
  expect(seen.analytics).toEqual([]);
});
