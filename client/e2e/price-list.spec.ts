import { expect, test, type Page } from '@playwright/test';

/**
 * Price-list screen: layout details that only a real browser can measure
 * (select arrows, segmented-control padding) and in-place editing of the parts
 * catalog. All API traffic is stubbed — the repo's e2e convention.
 */

// The project default is a phone; the price list is a desktop/tablet screen.
test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

const user = { id: 'owner-1', name: 'Владелец', login: 'owner', role: 'owner' };

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

async function openPartsTab(page: Page, onPatch?: (body: unknown) => void) {
  await page.context().addInitScript(() => localStorage.setItem('crm-token', 'test-token'));
  await page.route('**/api/**', (route) => route.fulfill(json({})));
  await page.route('**/api/auth/me', (route) => route.fulfill(json(user)));
  for (const list of ['price-list', 'vehicle-generations', 'calendar-blocks', 'task-templates']) {
    await page.route(`**/api/${list}**`, (route) => route.fulfill(json([])));
  }
  await page.route('**/api/part-templates**', (route) => {
    if (route.request().method() === 'PATCH') {
      onPatch?.(route.request().postDataJSON());
      return route.fulfill(json({ ...filter, ...route.request().postDataJSON() }));
    }
    return route.fulfill(json([filter]));
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
