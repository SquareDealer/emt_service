import { expect, test, type Page, type Request } from '@playwright/test';

/**
 * Works in the price list: adding / editing / retiring a work, managing the
 * generations catalog, and choosing the generation when a work is applied to a
 * work order. All API traffic is stubbed — the repo's e2e convention.
 */

// The project default is a phone; these are desktop/tablet screens.
test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

const owner = { id: 'owner-1', name: 'Владелец', login: 'owner', role: 'owner' };
const master = { id: 'master-1', name: 'Мастер', login: 'master', role: 'master' };

const gen = (id: string, code: string, years: string, extra: Record<string, unknown> = {}) => ({
  id,
  make: 'MINI',
  model: 'Cooper',
  code,
  years,
  sort: 0,
  active: true,
  ...extra,
});
const R56 = gen('g-r56', 'R56', '2006–2013');
const F56 = gen('g-f56', 'F56', '2014–н.в.');
const R50 = gen('g-r50', 'R50', '2001–2006', { active: false });

const tpl = (id: string, name: string, hours: number | null, price: number | null) => ({
  id,
  name,
  default_hours: hours,
  default_price: price,
  active: true,
});
const oil = tpl('t1', 'Замена масла', 1, 2500);
const pads = tpl('t2', 'Замена колодок', 1.5, null);

/** The price list as the server would resolve it for one generation. */
function priceRows(generationId: string | null) {
  const own = generationId === 'g-r56';
  return [
    {
      template: oil,
      base: { hours: 1, price: 2500 },
      override: own ? { hours: 1.2, price: 3000 } : null,
      effective: own
        ? { hours: 1.2, price: 3000, source: 'generation' }
        : { hours: 1, price: 2500, source: 'template' },
      parts_count: 2,
    },
    {
      template: pads,
      base: { hours: 1.5, price: null },
      override: null,
      effective: { hours: 1.5, price: 3000, source: 'rate' },
      parts_count: 0,
    },
  ];
}

const json = (body: unknown) => ({ contentType: 'application/json', body: JSON.stringify(body) });

interface Call { method: string; path: string; search: string; body: unknown }

/** Stub the whole API and record every write (and the reads the tests assert on). */
async function stubApi(page: Page, user = owner, generations = [R56, F56]) {
  const calls: Call[] = [];
  const record = (request: Request) => {
    const url = new URL(request.url());
    calls.push({
      method: request.method(),
      path: url.pathname,
      search: url.search,
      body: request.postData() ? request.postDataJSON() : null,
    });
  };

  await page.context().addInitScript(() => localStorage.setItem('crm-token', 'test-token'));
  await page.route('**/api/**', (route) => {
    record(route.request());
    return route.fulfill(json({}));
  });
  await page.route('**/api/auth/me', (route) => route.fulfill(json(user)));
  for (const list of ['calendar-blocks', 'part-templates', 'users', 'clients']) {
    await page.route(`**/api/${list}**`, (route) => route.fulfill(json([])));
  }
  await page.route('**/api/task-templates**', (route) => {
    record(route.request());
    return route.fulfill(json(route.request().method() === 'GET' ? [oil, pads] : oil));
  });
  await page.route('**/api/vehicle-generations**', (route) => {
    record(route.request());
    if (route.request().method() !== 'GET') return route.fulfill(json({ ...R56, id: 'g-new' }));
    const all = new URL(route.request().url()).searchParams.has('all');
    return route.fulfill(json(all ? generations : generations.filter((g) => g.active)));
  });
  await page.route('**/api/price-list**', (route) => {
    record(route.request());
    if (route.request().method() !== 'GET') return route.fulfill(json({ ...oil, id: 't-new' }));
    return route.fulfill(json(priceRows(new URL(route.request().url()).searchParams.get('generation_id'))));
  });

  const writes = (method: string, path: string | RegExp) =>
    calls.filter((c) => c.method === method && (typeof path === 'string' ? c.path === path : path.test(c.path)));
  return { calls, writes };
}

const picker = (page: Page) => page.getByRole('button', { name: /^Поколение/ });

async function openWorks(page: Page) {
  await page.goto('/price-list');
  await expect(page.getByText('Замена масла')).toBeVisible();
}

async function chooseGeneration(page: Page, name: RegExp | string) {
  await picker(page).click();
  await page.getByRole('option', { name }).click();
  await expect(page.getByRole('listbox', { name: 'Поколения' })).toHaveCount(0);
}

test('add a work for the selected generation', async ({ page }) => {
  const api = await stubApi(page);
  await openWorks(page);
  await chooseGeneration(page, /R56/);
  await expect(picker(page)).toContainText('R56');

  await page.getByRole('button', { name: 'Добавить работу' }).click();
  const dialog = page.getByRole('dialog', { name: 'Новая работа' });
  await expect(dialog.getByLabel('Название')).toBeFocused();
  await dialog.getByLabel('Название').fill('Замена свечей');
  await dialog.getByLabel('Норм.ч. для MINI Cooper R56').fill('1.5');
  await dialog.getByLabel('Цена для MINI Cooper R56').fill('4000');
  await dialog.getByRole('button', { name: 'Сохранить' }).click();

  await expect.poll(() => api.writes('POST', '/api/price-list/works').map((c) => c.body)).toEqual([
    {
      name: 'Замена свечей',
      default_hours: null,
      default_price: null,
      generation_id: 'g-r56',
      hours: 1.5,
      price: 4000,
    },
  ]);
  await expect(dialog).toHaveCount(0);
});

test('a work added on «Базовые цены» carries no generation', async ({ page }) => {
  const api = await stubApi(page);
  await openWorks(page);

  await page.getByRole('button', { name: 'Добавить работу' }).click();
  const dialog = page.getByRole('dialog', { name: 'Новая работа' });
  await dialog.getByLabel('Название').fill('Диагностика');
  await dialog.getByLabel('Базовая цена').fill('1500');
  await page.keyboard.press('Enter');

  await expect.poll(() => api.writes('POST', '/api/price-list/works').map((c) => c.body)).toEqual([
    { name: 'Диагностика', default_hours: null, default_price: 1500, generation_id: null, hours: null, price: null },
  ]);
});

test('edit a work: rename + base price', async ({ page }) => {
  const api = await stubApi(page);
  await openWorks(page);

  await page.getByRole('button', { name: 'Изменить Замена масла' }).click();
  const dialog = page.getByRole('dialog', { name: 'Изменить работу' });
  await dialog.getByLabel('Название').fill('Замена масла ДВС');
  await dialog.getByLabel('Базовые норм.ч.').fill('');
  await dialog.getByLabel('Базовая цена').fill('2800');
  await dialog.getByRole('button', { name: 'Сохранить' }).click();

  await expect.poll(() => api.writes('PATCH', '/api/task-templates/t1').map((c) => c.body)).toEqual([
    { name: 'Замена масла ДВС', default_hours: null, default_price: 2800 },
  ]);
  // No generation is selected, so its prices are not touched.
  expect(api.writes('PUT', /price-list/)).toEqual([]);
  expect(api.writes('DELETE', /price-list/)).toEqual([]);
  await expect(dialog).toHaveCount(0);
});

test('editing under a generation: clearing both figures drops the override', async ({ page }) => {
  const api = await stubApi(page);
  await openWorks(page);
  await chooseGeneration(page, /R56/);

  await page.getByRole('button', { name: 'Изменить Замена масла' }).click();
  const dialog = page.getByRole('dialog', { name: 'Изменить работу' });
  await expect(dialog.getByLabel('Цена для MINI Cooper R56')).toHaveValue('3000');
  await dialog.getByLabel('Норм.ч. для MINI Cooper R56').fill('');
  await dialog.getByLabel('Цена для MINI Cooper R56').fill('');
  await dialog.getByRole('button', { name: 'Сохранить' }).click();

  await expect.poll(() => api.writes('DELETE', '/api/price-list/t1/g-r56').length).toBe(1);
  expect(api.writes('PUT', /price-list/)).toEqual([]);
});

test('editing under a generation: a new figure is saved as its own price', async ({ page }) => {
  const api = await stubApi(page);
  await openWorks(page);
  await chooseGeneration(page, /F56/);

  await page.getByRole('button', { name: 'Изменить Замена колодок' }).click();
  const dialog = page.getByRole('dialog', { name: 'Изменить работу' });
  await dialog.getByLabel('Цена для MINI Cooper F56').fill('5200');
  await dialog.getByRole('button', { name: 'Сохранить' }).click();

  await expect.poll(() => api.writes('PUT', '/api/price-list/t2/g-f56').map((c) => c.body)).toEqual([
    { hours: null, price: 5200 },
  ]);
});

test('a work can be removed from the price list after confirmation', async ({ page }) => {
  const api = await stubApi(page);
  await openWorks(page);

  await page.getByRole('button', { name: 'Убрать Замена масла из прайса' }).click();
  const confirm = page.getByRole('dialog', { name: 'Убрать работу из прайса' });
  await expect(confirm).toContainText('Замена масла');
  expect(api.writes('DELETE', /task-templates/)).toEqual([]);

  // Backing out sends nothing.
  await confirm.getByRole('button', { name: 'Отмена' }).click();
  await expect(confirm).toHaveCount(0);
  expect(api.writes('DELETE', /task-templates/)).toEqual([]);

  await page.getByRole('button', { name: 'Убрать Замена масла из прайса' }).click();
  await confirm.getByRole('button', { name: 'Убрать', exact: true }).click();
  await expect.poll(() => api.writes('DELETE', '/api/task-templates/t1').length).toBe(1);
  await expect(confirm).toHaveCount(0);
});

test('the edit form offers the same removal, behind the same confirmation', async ({ page }) => {
  const api = await stubApi(page);
  await openWorks(page);

  await page.getByRole('button', { name: 'Изменить Замена колодок' }).click();
  await page.getByRole('dialog', { name: 'Изменить работу' }).getByRole('button', { name: 'Убрать из прайса' }).click();
  const confirm = page.getByRole('dialog', { name: 'Убрать работу из прайса' });
  await expect(confirm).toContainText('Замена колодок');
  expect(api.writes('DELETE', /task-templates/)).toEqual([]);
  await confirm.getByRole('button', { name: 'Убрать', exact: true }).click();
  await expect.poll(() => api.writes('DELETE', '/api/task-templates/t2').length).toBe(1);
});

test('search and «Со своей ценой» narrow the list', async ({ page }) => {
  await stubApi(page);
  await openWorks(page);

  await page.getByPlaceholder('Поиск работы').fill('колод');
  await expect(page.getByText('Замена колодок')).toBeVisible();
  await expect(page.getByText('Замена масла')).toHaveCount(0);
  await page.getByPlaceholder('Поиск работы').fill('');

  // The filter only makes sense for a generation.
  await expect(page.getByRole('button', { name: 'Со своей ценой' })).toHaveCount(0);
  await chooseGeneration(page, /R56/);
  await page.getByRole('button', { name: 'Со своей ценой' }).click();
  await expect(page.getByText('Замена масла')).toBeVisible();
  await expect(page.getByText('Замена колодок')).toHaveCount(0);
});

test('toolbar: filter on its own row at input height; copy is an icon next to «Добавить работу»', async ({ page }) => {
  await stubApi(page);
  await openWorks(page);
  await chooseGeneration(page, /R56/);

  const box = async (l: ReturnType<Page['locator']>) => (await l.boundingBox())!;
  const gen = await box(picker(page));
  const search = await box(page.locator('.pw-search'));
  const seg = await box(page.getByRole('group', { name: 'Какие работы показывать' }));
  const copy = page.getByRole('button', { name: /Скопировать из/ });
  const copyBox = await box(copy);
  const add = await box(page.getByRole('button', { name: 'Добавить работу' }));

  // Row 1: generation, search, copy, add — one line.
  for (const b of [search, copyBox, add]) expect(Math.abs(b.y - gen.y)).toBeLessThanOrEqual(1);
  expect(copyBox.x).toBeGreaterThan(search.x + search.width);
  expect(add.x).toBeGreaterThan(copyBox.x + copyBox.width - 1);

  // «Скопировать из…» is icon-only, but still named for screen readers and hover.
  expect((await copy.innerText()).trim()).toBe('');
  await expect(copy).toHaveAttribute('title', /Скопировать/);
  expect(Math.abs(copyBox.width - copyBox.height)).toBeLessThanOrEqual(1);

  // Row 2: the price filter, under the picker, as tall as the inputs.
  expect(seg.y).toBeGreaterThanOrEqual(gen.y + gen.height);
  expect(Math.abs(seg.x - gen.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(seg.height - search.height)).toBeLessThanOrEqual(1);
});

test('master sees prices but no add / edit / remove / manage controls', async ({ page }) => {
  const api = await stubApi(page, master);
  // The nav hides the price list from a master — this is the direct link.
  await openWorks(page);
  await chooseGeneration(page, /R56/);
  await expect(page.getByText('Замена колодок')).toBeVisible();
  // The generation's own price is readable…
  await expect(page.locator('.pl-row', { hasText: 'Замена масла' })).toContainText('3 000');

  // …but nothing on the screen writes.
  await expect(page.getByRole('button', { name: 'Добавить работу' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Изменить / })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /из прайса$/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Скопировать из/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Вернуть базовую цену' })).toHaveCount(0);
  await expect(page.locator('.pl-row input')).toHaveCount(0);

  await picker(page).click();
  await expect(page.getByRole('option', { name: /F56/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Управлять поколениями' })).toHaveCount(0);

  expect(api.calls.filter((c) => c.method !== 'GET')).toEqual([]);
});

test('master reads the parts catalog too, with nothing that writes', async ({ page }) => {
  const api = await stubApi(page, master);
  await page.route('**/api/part-templates**', (route) =>
    route.fulfill(json([{
      id: 'p1', name: 'Фильтр масляный', manufacturer: 'MANN', catalog_number: 'W712/95',
      unit: 'pcs', default_price: 900, active: true,
    }])),
  );
  await openWorks(page);
  await page.getByRole('button', { name: 'Запчасти' }).click();
  await expect(page.getByText('Фильтр масляный')).toBeVisible();
  await expect(page.getByText('W712/95')).toBeVisible();

  await expect(page.getByRole('button', { name: /^Изменить / })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Убрать из каталога' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Добавить в каталог' })).toHaveCount(0);
  await expect(page.locator('.pl-row input, .pl-row select')).toHaveCount(0);

  expect(api.calls.filter((c) => c.method !== 'GET')).toEqual([]);
});

test('settings no longer has the «Шаблоны работ» section', async ({ page }) => {
  const api = await stubApi(page);
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Настройки' })).toBeVisible();
  await expect(page.getByText('Ставка нормо-часа и реквизиты для документов')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Шаблоны работ' })).toHaveCount(0);
  await expect(page.getByPlaceholder('Замена колодок')).toHaveCount(0);
  expect(api.calls.filter((c) => c.path.includes('task-templates'))).toEqual([]);
});

test('generations can be added and retired from the manager', async ({ page }) => {
  const api = await stubApi(page, owner, [R56, F56, R50]);
  await openWorks(page);

  await picker(page).click();
  await page.getByRole('button', { name: 'Управлять поколениями' }).click();
  const dialog = page.getByRole('dialog', { name: 'Поколения' });
  // The manager shows retired rows too — that is where they come back from.
  await expect(dialog.getByText('R50')).toBeVisible();

  await dialog.getByLabel('Марка').fill('BMW');
  await dialog.getByLabel('Модель').fill('3');
  await dialog.getByLabel('Код').fill('E90');
  await dialog.getByLabel('Годы').fill('2005–2012');
  await dialog.getByRole('button', { name: 'Добавить', exact: true }).click();
  await expect.poll(() => api.writes('POST', '/api/vehicle-generations').map((c) => c.body)).toEqual([
    { make: 'BMW', model: '3', code: 'E90', years: '2005–2012' },
  ]);

  await dialog.getByRole('button', { name: 'Убрать MINI Cooper R56' }).click();
  await expect.poll(() => api.writes('DELETE', '/api/vehicle-generations/g-r56').length).toBe(1);

  await dialog.getByRole('button', { name: 'Вернуть MINI Cooper R50' }).click();
  await expect.poll(() => api.writes('PATCH', '/api/vehicle-generations/g-r50').map((c) => c.body)).toEqual([
    { active: true },
  ]);
});

test('a generation is edited in place', async ({ page }) => {
  const api = await stubApi(page);
  await openWorks(page);
  await picker(page).click();
  await page.getByRole('button', { name: 'Управлять поколениями' }).click();
  const dialog = page.getByRole('dialog', { name: 'Поколения' });

  await dialog.getByRole('button', { name: 'Изменить MINI Cooper F56' }).click();
  const row = dialog.locator('.gm-row[data-editing]');
  await row.getByLabel('Годы').fill('2014–2024');
  await page.keyboard.press('Enter');

  await expect.poll(() => api.writes('PATCH', '/api/vehicle-generations/g-f56').map((c) => c.body)).toEqual([
    { make: 'MINI', model: 'Cooper', code: 'F56', years: '2014–2024' },
  ]);
  await expect(dialog.locator('.gm-row[data-editing]')).toHaveCount(0);
});

test('the generation picker filters as you type and Escape only closes the panel', async ({ page }) => {
  await stubApi(page);
  await openWorks(page);

  await picker(page).click();
  const search = page.getByPlaceholder('Марка, модель, код или годы');
  await expect(search).toBeFocused();
  await search.fill('2014');
  await expect(page.getByRole('option', { name: /F56/ })).toBeVisible();
  await expect(page.getByRole('option', { name: /R56/ })).toHaveCount(0);
  // Enter takes the highlighted match.
  await page.keyboard.press('Enter');
  await expect(picker(page)).toContainText('F56');

  await picker(page).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox', { name: 'Поколения' })).toHaveCount(0);
  await expect(picker(page)).toBeFocused();
});

// ---------------- work order ----------------

function workOrder(vehicleGenerationId: string | null, code: string | null) {
  return {
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
    total_cached: 0,
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
      generation_code: code,
      generation_id: vehicleGenerationId,
      plate: 'А123ВС77',
      year: 2010,
      mileage: null,
      notes: null,
      created_at: '2026-01-01T00:00:00.000Z',
      client: { id: 'c1', full_name: 'Иванов Иван', phone: '+79990000000' },
    },
    labor_lines: [],
    part_lines: [],
  };
}

const preview = {
  template_id: 't1',
  group_name: 'Замена масла',
  labor: { name: 'Замена масла', hours: 1, rate_snapshot: 2000, price_override: 2500 },
  price_source: 'template',
  parts: [],
};

async function openWorkOrder(page: Page, wo: ReturnType<typeof workOrder>) {
  // Registered after the catch-all, so it wins; narrower routes go last.
  await page.route('**/api/work-orders/wo1', (route) => route.fulfill(json(wo)));
  await page.route('**/api/work-orders/wo1/template-preview**', (route) => route.fulfill(json(preview)));
  await page.route('**/api/work-orders/wo1/apply-template', (route) => route.fulfill(json(wo)));
  await page.route('**/api/settings', (route) => route.fulfill(json({ labor_rate: 2000 })));
  await page.goto('/work-orders/wo1');
  await expect(page.getByRole('heading', { name: 'Работы' })).toBeVisible();
}

/** Requests the page made to one work-order endpoint, as recorded by the browser. */
function track(page: Page, suffix: string) {
  const seen: { url: URL; method: string; body: unknown }[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.endsWith(suffix)) {
      seen.push({ url, method: request.method(), body: request.postData() ? request.postDataJSON() : null });
    }
  });
  return seen;
}

test("work order: picking a work asks for a generation, defaulting to the car's", async ({ page }) => {
  await stubApi(page);
  const previews = track(page, '/template-preview');
  const applies = track(page, '/apply-template');
  await openWorkOrder(page, workOrder('g-r56', 'R56'));

  await page.getByRole('button', { name: 'Из прайса' }).click();
  const dialog = page.getByRole('dialog', { name: 'Работа из прайса' });
  await expect(picker(page)).toContainText('R56');
  await expect(dialog.getByPlaceholder('Поиск работы')).toBeFocused();
  // Priced for the car: the R56 override is what the list shows.
  await expect(dialog.getByRole('option', { name: /Замена масла/ })).toContainText('3 000');
  await expect(dialog.getByText(/а в наряде/)).toHaveCount(0);

  await chooseGeneration(page, /F56/);
  await expect(dialog.getByText('Цены для MINI Cooper F56, а в наряде MINI Cooper R56')).toBeVisible();
  await dialog.getByRole('option', { name: /Замена масла/ }).click();

  const apply = page.getByRole('dialog', { name: 'Добавить в смету' });
  await expect(apply.getByText('Замена масла')).toBeVisible();
  await expect.poll(() => previews.map((p) => p.url.search)).toEqual(['?template_id=t1&generation_id=g-f56']);

  await apply.getByRole('button', { name: /^Добавить/ }).click();
  await expect.poll(() => applies.map((a) => a.body)).toEqual([
    { template_id: 't1', part_template_ids: [], qty: {}, generation_id: 'g-f56' },
  ]);
});

test('choosing «Базовые цены» sends generation_id=base / null', async ({ page }) => {
  await stubApi(page);
  const previews = track(page, '/template-preview');
  const applies = track(page, '/apply-template');
  await openWorkOrder(page, workOrder('g-r56', 'R56'));

  await page.getByRole('button', { name: 'Из прайса' }).click();
  const dialog = page.getByRole('dialog', { name: 'Работа из прайса' });
  await chooseGeneration(page, 'Базовые цены (для всех)');
  await expect(dialog.getByText('Базовые цены, а в наряде MINI Cooper R56')).toBeVisible();

  // Keyboard: type to filter, Enter takes the highlighted work.
  await dialog.getByPlaceholder('Поиск работы').fill('масл');
  await page.keyboard.press('Enter');

  const apply = page.getByRole('dialog', { name: 'Добавить в смету' });
  await expect.poll(() => previews.map((p) => p.url.search)).toEqual(['?template_id=t1&generation_id=base']);
  await apply.getByRole('button', { name: /^Добавить/ }).click();
  await expect.poll(() => applies.map((a) => a.body)).toEqual([
    { template_id: 't1', part_template_ids: [], qty: {}, generation_id: null },
  ]);
});

test('a car without a generation opens on «Базовые цены», with no warning', async ({ page }) => {
  await stubApi(page);
  await openWorkOrder(page, workOrder(null, null));

  await page.getByRole('button', { name: 'Из прайса' }).click();
  const dialog = page.getByRole('dialog', { name: 'Работа из прайса' });
  await expect(picker(page)).toContainText('Базовые цены');
  await expect(dialog.getByText(/а в наряде/)).toHaveCount(0);
});

test('a car whose generation is retired still opens on that generation', async ({ page }) => {
  const api = await stubApi(page, owner, [R56, F56, R50]);
  await openWorkOrder(page, workOrder('g-r50', 'R50'));

  await page.getByRole('button', { name: 'Из прайса' }).click();
  const dialog = page.getByRole('dialog', { name: 'Работа из прайса' });
  // The picker reads the catalog with all=1, so the retired row still has a name.
  await expect(picker(page)).toContainText('R50');
  await expect(dialog.getByText(/а в наряде/)).toHaveCount(0);
  expect(api.calls.some((c) => c.path === '/api/vehicle-generations' && c.search.includes('all=1'))).toBe(true);
  expect(api.calls.some((c) => c.path === '/api/price-list' && c.search.includes('g-r50'))).toBe(true);

  // Retired generations are not offered — except the one the car is on.
  await picker(page).click();
  await expect(page.getByRole('option', { name: /R50/ })).toBeVisible();
  await expect(page.getByRole('option', { name: /R56/ })).toBeVisible();
});

test('a master picks works in an order but cannot manage generations from there', async ({ page }) => {
  await stubApi(page, master);
  await openWorkOrder(page, workOrder('g-r56', 'R56'));

  await page.getByRole('button', { name: 'Из прайса' }).click();
  await picker(page).click();
  await expect(page.getByRole('option', { name: /F56/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Управлять поколениями' })).toHaveCount(0);

  // Escape closes the panel, not the dialog it sits in.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox', { name: 'Поколения' })).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Работа из прайса' })).toBeVisible();
});

test('the picker panel is not clipped by the dialog it opens in', async ({ page }) => {
  await stubApi(page);
  await openWorkOrder(page, workOrder('g-r56', 'R56'));
  await page.getByRole('button', { name: 'Из прайса' }).click();
  await picker(page).click();

  // Every corner of the panel must hit the panel itself — an `overflow` on the
  // dialog body would leave part of it painted over or cut off.
  const panel = page.getByRole('dialog', { name: 'Выбор поколения' });
  const box = (await panel.boundingBox())!;
  expect(box.height).toBeGreaterThan(120);
  for (const [x, y] of [
    [box.x + 4, box.y + 4],
    [box.x + box.width - 4, box.y + 4],
    [box.x + 4, box.y + box.height - 4],
    [box.x + box.width - 4, box.y + box.height - 4],
  ]) {
    expect(
      await page.evaluate(([px, py]) => !!document.elementFromPoint(px, py)?.closest('.gp-panel'), [x, y]),
    ).toBe(true);
  }
});

test('phone: the picker panel stays inside the viewport with 44px targets', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await stubApi(page);
  await openWorks(page);

  await picker(page).click();
  const panel = (await page.getByRole('dialog', { name: 'Выбор поколения' }).boundingBox())!;
  expect(panel.x).toBeGreaterThanOrEqual(0);
  expect(panel.x + panel.width).toBeLessThanOrEqual(390);
  expect(panel.y + panel.height).toBeLessThanOrEqual(780);

  const option = (await page.getByRole('option', { name: /R56/ }).boundingBox())!;
  expect(option.height).toBeGreaterThanOrEqual(44);
  for (const name of [/^Поколение/, 'Добавить работу', 'Изменить Замена масла', 'Убрать Замена масла из прайса']) {
    const box = (await page.getByRole('button', { name }).first().boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
  }
  await context.close();
});

test('an empty order is still dropped after «Из прайса» was opened and cancelled', async ({ page }) => {
  await stubApi(page);
  const deleted = track(page, '/work-orders/wo1');
  await openWorkOrder(page, { ...workOrder('g-r56', 'R56'), title: null, status: 'scheduled' } as never);

  await page.getByRole('button', { name: 'Из прайса' }).click();
  await expect(page.getByRole('dialog', { name: 'Работа из прайса' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Работа из прайса' })).toHaveCount(0);

  // Leaving an untouched, empty order removes it — looking at the price list is not a touch.
  await page.getByRole('link', { name: 'Клиенты' }).first().click();
  await expect
    .poll(() => deleted.filter((r) => r.method === 'DELETE').length)
    .toBe(1);
});
