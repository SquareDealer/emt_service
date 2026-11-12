import { expect, test, type Page } from '@playwright/test';

/**
 * Price-list screen: layout details that only a real browser can measure
 * (select arrows, segmented-control padding) and in-place editing of the parts
 * catalog. All API traffic is stubbed — the repo's e2e convention.
 */

// The project default is a phone; the price list is a desktop/tablet screen.
test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

const owner = { id: 'owner-1', name: 'Владелец', login: 'owner', role: 'owner' };
const receptionist = { id: 'r-1', name: 'Приёмщик', login: 'rec', role: 'master_receptionist' };

const filter = {
  id: 'p1',
  name: 'Фильтр масляный',
  manufacturer: 'MANN',
  catalog_number: 'W712/95',
  unit: 'pcs',
  default_price: 900,
  active: true,
};

const json = (body: unknown) => ({ contentType: 'application/json', body: JSON.stringify(body) });

async function openPartsTab(
  page: Page,
  onPatch?: (body: unknown) => void,
  opts: { user?: typeof owner; part?: typeof filter & { purchase_price?: number | null } } = {},
) {
  const user = opts.user ?? owner;
  const part = opts.part ?? filter;
  await page.context().addInitScript(() => localStorage.setItem('crm-token', 'test-token'));
  await page.route('**/api/**', (route) => route.fulfill(json({})));
  await page.route('**/api/auth/me', (route) => route.fulfill(json(user)));
  for (const list of ['price-list', 'vehicle-generations', 'calendar-blocks', 'task-templates']) {
    await page.route(`**/api/${list}**`, (route) => route.fulfill(json([])));
  }
  await page.route('**/api/part-templates**', (route) => {
    if (route.request().method() === 'PATCH') {
      onPatch?.(route.request().postDataJSON());
      return route.fulfill(json({ ...part, ...route.request().postDataJSON() }));
    }
    return route.fulfill(json([part]));
  });
  await page.goto('/price-list');
  await page.getByRole('button', { name: 'Запчасти' }).click();
  await expect(page.getByText('Фильтр масляный')).toBeVisible();
}

test('select arrows are inset and the segmented control has vertical padding', async ({ page }) => {
  await openPartsTab(page);

  const unit = page.getByLabel('Единица').last();
  expect(await unit.evaluate((e) => getComputedStyle(e).appearance)).toBe('none');
  expect(
    parseFloat(await unit.evaluate((e) => getComputedStyle(e).paddingRight)),
  ).toBeGreaterThanOrEqual(16);

  // The arrow itself must survive the cell rules' `background` shorthand.
  expect(await unit.evaluate((e) => getComputedStyle(e).backgroundImage)).toContain('svg');

  const seg = (await page.locator('.seg').first().boundingBox())!;
  const btn = (await page.locator('.seg-btn').first().boundingBox())!;
  expect(btn.y - seg.y).toBeGreaterThanOrEqual(4);
  expect(seg.y + seg.height - (btn.y + btn.height)).toBeGreaterThanOrEqual(4);

  // Icon and label sit on one line — the global `svg { display: block }` used to stack them.
  const icon = (await page.locator('.seg-btn svg').first().boundingBox())!;
  expect(icon.y).toBeGreaterThanOrEqual(btn.y);
  expect(icon.y + icon.height).toBeLessThanOrEqual(btn.y + btn.height);
});

test('a catalog part can be edited in place; a cleared price is sent as null', async ({ page }) => {
  let patched: unknown = null;
  await openPartsTab(page, (body) => { patched = body; });

  await page.getByRole('button', { name: 'Изменить Фильтр масляный' }).click();
  const row = page.locator('.pl-row[data-editing]');
  await row.getByPlaceholder('цена').fill('');
  await row.getByPlaceholder('MANN').fill('MAHLE');
  await page.keyboard.press('Enter');

  await expect.poll(() => patched).toEqual({
    name: 'Фильтр масляный',
    manufacturer: 'MAHLE',
    catalog_number: 'W712/95',
    unit: 'pcs',
    default_price: null,
  });
  await expect(page.locator('.pl-row[data-editing]')).toHaveCount(0);
});

test('Escape cancels the edit without a request', async ({ page }) => {
  let patched: unknown = null;
  await openPartsTab(page, (body) => { patched = body; });

  await page.getByRole('button', { name: 'Изменить Фильтр масляный' }).click();
  const row = page.locator('.pl-row[data-editing]');
  await row.getByPlaceholder('MANN').fill('MAHLE');
  await page.keyboard.press('Escape');

  await expect(page.locator('.pl-row[data-editing]')).toHaveCount(0);
  await expect(page.getByText('MANN', { exact: true })).toBeVisible();
  expect(patched).toBeNull();
});

const costed = { ...filter, purchase_price: 520 };

test('owner sees the purchase column; renaming alone does not send purchase_price', async ({ page }) => {
  let patched: Record<string, unknown> | null = null;
  await openPartsTab(page, (b) => { patched = b as Record<string, unknown>; }, { part: costed });

  await expect(page.getByText('Закупка', { exact: true })).toBeVisible();
  await expect(page.getByText('520 ₽')).toBeVisible();

  await page.getByRole('button', { name: 'Изменить Фильтр масляный' }).click();
  const row = page.locator('.pl-row[data-editing]');
  await row.getByPlaceholder('Напр. Фильтр масляный').fill('Фильтр масляный MANN');
  await page.keyboard.press('Enter');

  await expect.poll(() => patched).not.toBeNull();
  expect(patched).toMatchObject({ name: 'Фильтр масляный MANN' });
  expect(patched).not.toHaveProperty('purchase_price');
  await expect(page.locator('.pl-row[data-editing]')).toHaveCount(0);
  await expect(page.locator('.pl-row[data-editing]')).toHaveCount(0);
});

test('owner changing the purchase price sends it', async ({ page }) => {
  let patched: Record<string, unknown> | null = null;
  await openPartsTab(page, (b) => { patched = b as Record<string, unknown>; }, { part: costed });

  await page.getByRole('button', { name: 'Изменить Фильтр масляный' }).click();
  const row = page.locator('.pl-row[data-editing]');
  await row.getByLabel('Закупка за единицу').fill('600');
  await page.keyboard.press('Enter');

  await expect.poll(() => patched).not.toBeNull();
  expect(patched).toMatchObject({ purchase_price: 600 });
  await expect(page.locator('.pl-row[data-editing]')).toHaveCount(0);
});

test('a receptionist has no purchase column and never sends purchase_price', async ({ page }) => {
  let patched: Record<string, unknown> | null = null;
  await openPartsTab(page, (b) => { patched = b as Record<string, unknown>; }, {
    user: receptionist,
    part: costed,
  });

  await expect(page.getByText('Закупка', { exact: true })).toHaveCount(0);
  await expect(page.getByText('520 ₽')).toHaveCount(0);

  await page.getByRole('button', { name: 'Изменить Фильтр масляный' }).click();
  const row = page.locator('.pl-row[data-editing]');
  await row.getByPlaceholder('Напр. Фильтр масляный').fill('Фильтр масляный MANN');
  await page.keyboard.press('Enter');

  await expect.poll(() => patched).not.toBeNull();
  expect(patched).not.toHaveProperty('purchase_price');
  await expect(page.locator('.pl-row[data-editing]')).toHaveCount(0);
});
