import { expect, test, type Page } from '@playwright/test';

const user = { id: 'owner-1', name: 'Мастер', login: 'owner', role: 'owner' };
const json = (body: unknown) => ({ contentType: 'application/json', body: JSON.stringify(body) });

const client = {
  id: 'c1', full_name: 'Константинопольский Владимир Александрович', phone: '+79991234567',
  source: 'manual', discount_default_pct: null, imported_deals_count: 0, imported_deals_sum: 0,
  notes: null, created_at: '2024-03-01T10:00:00.000Z', updated_at: '2024-03-01T10:00:00.000Z',
};
const vehicle = {
  id: 'v1', client_id: 'c1', vin: null, make: 'MINI', model: 'Cabrio', generation_code: 'R57',
  generation_id: null, plate: 'А105ВС116', year: 2014, mileage: 90000, notes: null,
  created_at: '2024-03-01T10:00:00.000Z', client,
};
const line = { work_order_id: 'wo1', group_key: null, group_name: null, group_sort: 0 };
const workOrder = {
  id: 'wo1', vehicle_id: 'v1', assigned_master_id: null, status: 'in_progress',
  title: 'ТО-2 + замена тормозных колодок и диагностика подвески', notes: null,
  complaint: null, recommendation: null, scheduled_at: null, scheduled_duration_min: null,
  discount_type: null, discount_value: null, total_cached: 9_725, total_frozen: null,
  paid_amount: 0, closed_at: null, doc_number: 7, order_doc_number: null,
  created_at: '2026-11-01T10:00:00.000Z', vehicle, assigned_master: null,
  labor_lines: [{
    ...line, id: 'l1', template_id: null, name: 'Диагностика ходовой части с выездом на тест-драйв',
    hours: 1.5, rate_snapshot: 2000, price_override: null, discount_type: 'percent', discount_value: 10, sort: 0,
  }],
  part_lines: [{
    ...line, id: 'p1', name: 'Масло моторное 5W-30 LongLife-04', catalog_number: '15669E',
    manufacturer: 'Castrol EDGE Professional', qty: 4.5, unit: 'l', unit_price: 1450,
    part_template_id: null, discount_type: null, discount_value: null, sort: 0,
  }],
};

async function stub(page: Page) {
  await page.route('**/api/**', (route) => route.fulfill(json({})));
  await page.route('**/api/auth/me', (route) => route.fulfill(json(user)));
  await page.route('**/api/clients', (route) => route.fulfill(json([])));
  await page.route('**/api/users', (route) => route.fulfill(json([])));
  await page.route('**/api/task-templates', (route) => route.fulfill(json([])));
  await page.route('**/api/settings', (route) => route.fulfill(json({ labor_rate: 2000 })));
  await page.route('**/api/calendar-blocks**', (route) => route.fulfill(json([])));
  await page.route('**/api/work-orders/calendar**', (route) => route.fulfill(json([])));
  await page.route('**/api/work-orders/wo1', (route) => route.fulfill(json(workOrder)));
  await page.route('**/api/work-orders/archive**', (route) =>
    route.fulfill(json({ items: [{ ...workOrder, status: 'closed', total_frozen: 9_725, closed_at: '2026-11-12T10:54:00.000Z' }], total: 1, page: 1, pageSize: 25 })),
  );
  await page.route('**/api/work-orders/board', (route) =>
    route.fulfill(json({ scheduled: [workOrder], in_progress: [], waiting: [], done: [], closed: [] })),
  );
}

test.beforeEach(async ({ context, page }) => {
  await context.addInitScript(() => localStorage.setItem('crm-token', 'test-token'));
  await stub(page);
});

test('estimate lines are cards on a phone: nothing clipped, nothing scrolls sideways', async ({ page }) => {
  await page.goto('/work-orders/wo1');
  const labor = page.locator('.smeta-row').filter({ hasText: 'Диагностика ходовой' });
  await expect(labor).toBeVisible();

  // the column header strip is a desktop affordance
  await expect(page.locator('.smeta-head').first()).toBeHidden();
  for (const smeta of await page.locator('.smeta').all()) {
    expect(await smeta.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  }

  // the whole name wraps instead of ending in «…»
  const name = labor.locator('.c-name');
  expect(await name.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  // the sum shares the first line with the name; the figures behind it sit below
  const nameBox = (await name.boundingBox())!;
  const sumBox = (await labor.locator('.c-sum').boundingBox())!;
  expect(sumBox.y).toBeCloseTo(nameBox.y, -1);
  const rate = labor.locator('.c-meta[data-label="Ставка"]');
  await expect(rate).toBeVisible();
  expect((await rate.boundingBox())!.y).toBeGreaterThan(nameBox.y + nameBox.height - 1);
  // no override → no empty «Цена —» on the card
  await expect(labor.locator('.c-meta[data-label="Цена"]')).toBeHidden();

  // the add form names its fields and keeps finger-sized targets
  const addForm = page.locator('.smeta-add.labor-grid');
  // the caption is the wrapping label's ::before — it names the input
  await expect(addForm.getByRole('textbox', { name: 'Ставка' })).toHaveValue('2000');
  const caption = await addForm.locator('.f-rate').evaluate((el) => getComputedStyle(el, '::before').content);
  expect(caption).toBe('"Ставка"');
  const small = await addForm.locator('input, select, button').evaluateAll((els) =>
    els.map((el) => el.getBoundingClientRect()).filter((r) => r.width > 0 && r.height < 44).length,
  );
  expect(small).toBe(0);

  // the title gets the whole row; status and delete wrap underneath
  const title = (await page.locator('.wo-title-input').boundingBox())!;
  const status = (await page.getByRole('combobox', { name: 'Статус' }).boundingBox())!;
  expect(status.y).toBeGreaterThan(title.y + title.height - 1);
});

test('archive row on a phone: title and sum lead, the number moves underneath', async ({ page }) => {
  await page.goto('/archive');
  const row = page.locator('.list-row.archive-row').first();
  await expect(row).toBeVisible();
  await expect(page.locator('.list-head.archive-row')).toBeHidden();

  const title = (await row.getByText(workOrder.title).boundingBox())!;
  const total = (await row.locator('.archive-total').boundingBox())!;
  const num = (await row.locator('.archive-num').boundingBox())!;
  expect(total.y).toBeCloseTo(title.y, -1);
  expect(num.y).toBeGreaterThan(title.y);
});

test('board cards leave swipes to the browser and a column fills the phone', async ({ page }) => {
  await page.goto('/board');
  const card = page.locator('.board-card-drag').first();
  await expect(card).toBeVisible();
  // `none` made every swipe over a card start a drag instead of scrolling
  await expect(card).toHaveCSS('touch-action', 'manipulation');

  const board = (await page.locator('.board').boundingBox())!;
  const col = (await page.locator('.board-col').first().boundingBox())!;
  expect(col.width).toBeGreaterThan(board.width * 0.8);
  expect(col.width).toBeLessThan(board.width);
});

test('analytics on a phone: the four cuts fit, a cost row keeps its sale in view', async ({ page }) => {
  await page.goto('/analytics');
  const cuts = page.getByRole('group', { name: 'Разрез' });
  await expect(cuts).toBeVisible();
  const group = (await cuts.boundingBox())!;
  for (const tab of await cuts.getByRole('button').all()) {
    const box = (await tab.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(group.x - 1);
    expect(box.x + box.width).toBeLessThanOrEqual(group.x + group.width + 1);
  }

  await page.getByRole('button', { name: 'Указать закупку' }).first().click();
  const row = page.locator('dialog[open] .an-fill-row').first();
  await expect(row.locator('.an-fill-sale')).toBeVisible();
  // the part's name wraps instead of being cut at «Колодки тормозные пер…»
  const name = row.locator('.fw-500').first();
  expect(await name.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
});
