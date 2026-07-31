import { expect, test } from '@playwright/test';

const user = { id: 'owner-1', name: 'Мастер', login: 'owner', role: 'owner' };

test.beforeEach(async ({ context, page }) => {
  await context.addInitScript(() => localStorage.setItem('crm-token', 'test-token'));
  await page.route('**/api/**', (route) =>
    route.fulfill({ contentType: 'application/json', body: '{}' }),
  );
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(user) }),
  );
  await page.route('**/api/clients', (route) =>
    route.fulfill({ contentType: 'application/json', body: '[]' }),
  );
  // The catch-all above answers '{}', but list endpoints must be arrays — the
  // calendar maps over this one.
  await page.route('**/api/calendar-blocks**', (route) =>
    route.fulfill({ contentType: 'application/json', body: '[]' }),
  );
  await page.goto('/clients');
  await expect(page.getByRole('heading', { name: 'Клиенты' })).toBeVisible();
});

test('drawer is above its backdrop and exposes every navigation item', async ({ page }) => {
  const menu = page.getByRole('button', { name: 'Меню', exact: true });
  await menu.click();

  const drawer = page.getByRole('dialog', { name: 'Навигация' });
  await expect(drawer).toBeVisible();
  await expect(drawer).toHaveCSS('transform', 'none'); // slide-in finished
  const clientsLink = drawer.getByRole('link', { name: 'Клиенты' });
  const pointTarget = await clientsLink.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.closest('a')?.textContent;
  });
  expect(pointTarget).toContain('Клиенты');

  for (const label of ['Клиенты', 'Доска', 'Календарь', 'Архив', 'Импорт базы', 'Настройки']) {
    await expect(drawer.getByRole('link', { name: label })).toBeVisible();
  }
  await clientsLink.click();
  await expect(drawer).toBeHidden();
});

test('mobile controls have a 44px touch target and drawer closes with Escape', async ({ page }) => {
  const menu = page.getByRole('button', { name: 'Меню', exact: true });
  await menu.click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Навигация' })).toBeHidden();
  await expect(menu).toBeFocused();

  const tooSmall = await page.locator(
    'button:not([disabled]), a[href], input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [role="button"]',
  ).evaluateAll((elements) => elements
    .filter((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    })
    .map((element) => {
      const rect = element.getBoundingClientRect();
      return { label: element.getAttribute('aria-label') || element.textContent?.trim() || element.tagName, width: rect.width, height: rect.height };
    })
    .filter(({ width, height }) => width < 44 || height < 44),
  );
  expect(tooSmall).toEqual([]);
});

test('topbar search fills the gap between the hamburger and the primary action', async ({ page }) => {
  const gap = 12; // --sp-3
  const menu = await page.getByRole('button', { name: 'Меню', exact: true }).boundingBox();
  const search = await page.locator('.search-trigger').boundingBox();
  const intake = await page.getByRole('button', { name: 'Новый приём' }).boundingBox();
  if (!menu || !search || !intake) throw new Error('topbar controls are not laid out');

  expect(search.x - (menu.x + menu.width)).toBeCloseTo(gap, 0);
  expect(intake.x - (search.x + search.width)).toBeCloseTo(gap, 0);
  // the placeholder stays, elided rather than hidden
  await expect(page.locator('.search-trigger span')).toBeVisible();
});

test('client head wraps: name is not clipped, phone stays on one line, actions split the row', async ({ page }) => {
  await page.route('**/api/clients/c1', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'c1',
        full_name: 'Константинопольский Владимир Александрович',
        phone: '+79991234567',
        source: 'manual',
        discount_default_pct: null,
        imported_deals_count: 0,
        imported_deals_sum: 0,
        notes: null,
        created_at: '2024-03-01T10:00:00.000Z',
        updated_at: '2024-03-01T10:00:00.000Z',
      }),
    }),
  );
  await page.route('**/api/clients/c1/vehicles', (route) =>
    route.fulfill({ contentType: 'application/json', body: '[]' }),
  );
  await page.route('**/api/work-orders', (route) =>
    route.fulfill({ contentType: 'application/json', body: '[]' }),
  );
  await page.goto('/clients/c1');

  const title = page.locator('.client-head .page-title');
  await expect(title).toBeVisible();
  // the whole name renders (the bug clipped it to a single letter + ellipsis)
  const titleOverflow = await title.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(titleOverflow).toBeLessThanOrEqual(1);

  const phone = page.locator('.client-head-phone');
  const phoneBox = await phone.boundingBox();
  const phoneOverflow = await phone.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(phoneOverflow).toBeLessThanOrEqual(1);
  expect(phoneBox!.height).toBeLessThan(32); // one line, not broken across the digits

  const edit = (await page.getByRole('button', { name: 'Изменить' }).boundingBox())!;
  const del = (await page.getByRole('button', { name: 'Удалить клиента' }).boundingBox())!;
  const head = (await page.locator('.client-head').boundingBox())!;
  expect(edit.y).toBeGreaterThan(phoneBox!.y); // wrapped below all the info
  expect(edit.width).toBeCloseTo(del.width, 0); // half of the row each
  expect(edit.width + del.width).toBeCloseTo(head.width - 8, 0); // minus the --sp-2 gap
});

test('calendar keeps desktop column density and pans by drag', async ({ page }) => {
  await page.route('**/api/work-orders/calendar*', (route) =>
    route.fulfill({ contentType: 'application/json', body: '[]' }),
  );
  await page.goto('/calendar');

  const scroll = page.locator('.stl-scroll');
  await expect(scroll).toBeVisible();
  const metrics = await scroll.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
  expect(metrics.scrollWidth).toBeGreaterThanOrEqual(48 + 7 * 120); // hour gutter + 7 days
  expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth);

  const box = (await scroll.boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width - 20, y);
  await page.mouse.down();
  await page.mouse.move(box.x + 20, y, { steps: 8 });
  await page.mouse.up();
  expect(await scroll.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);

  // the hour gutter stays pinned while panning (box.x + 1 = inside the scroller's border)
  const axis = (await page.locator('.stl-axis').boundingBox())!;
  expect(axis.x).toBeCloseTo(box.x + 1, 0);
});
