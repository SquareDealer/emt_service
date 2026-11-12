import { expect, test, type Page } from '@playwright/test';

/**
 * «Запчасти для работы»: the part picker. Focusing the search unfolds the whole
 * catalog; chips, a query and «Скрыть привязанные» narrow it; the keyboard
 * drives it. All API traffic is stubbed — the repo's e2e convention.
 */

const user = { id: 'owner-1', name: 'Владелец', login: 'owner', role: 'owner' };

const part = (id: string, name: string, manufacturer: string | null, catalog_number: string | null, default_price: number | null) => ({
  id, name, manufacturer, catalog_number, unit: 'pcs', default_price, active: true,
});

const catalog = [
  part('p1', 'Фильтр масляный', 'MANN', 'W712/95', 900),
  part('p2', 'Фильтр масляный', 'Mahle', 'OX 171/2D', 850),
  part('p3', 'Масло 5W-30', 'Castrol', '15669A', 1200),
  part('p4', 'Фильтр воздушный', 'MANN', 'C 1361', null),
];

const work = {
  template: { id: 't1', name: 'Замена масла', default_hours: 1, default_price: 2500, active: true },
  base: { hours: 1, price: 2500 },
  override: null,
  effective: { hours: 1, price: 2500, source: 'template' },
  parts_count: 0,
};

const link = (p: (typeof catalog)[number]) => ({
  id: `l-${p.id}`,
  task_template_id: 't1',
  part_template_id: p.id,
  part_template: p,
  generation_id: null,
  qty: 1,
  is_default: true,
  slot: null,
});

const json = (body: unknown) => ({ contentType: 'application/json', body: JSON.stringify(body) });

interface Stubs {
  parts?: unknown[];
  attached?: unknown[];
  onAttach?: (url: string, body: unknown) => void;
}

async function openModal(page: Page, { parts = catalog, attached = [], onAttach }: Stubs = {}) {
  await page.context().addInitScript(() => localStorage.setItem('crm-token', 'test-token'));
  await page.route('**/api/**', (route) => route.fulfill(json({})));
  await page.route('**/api/auth/me', (route) => route.fulfill(json(user)));
  for (const list of ['vehicle-generations', 'calendar-blocks', 'task-templates']) {
    await page.route(`**/api/${list}**`, (route) => route.fulfill(json([])));
  }
  await page.route('**/api/part-templates**', (route) => route.fulfill(json(parts)));
  await page.route('**/api/price-list**', (route) => {
    const url = route.request().url();
    if (route.request().method() === 'PUT') {
      onAttach?.(url, route.request().postDataJSON());
      return route.fulfill(json({}));
    }
    return route.fulfill(json(url.includes('/t1/parts') ? attached : [work]));
  });
  await page.goto('/price-list');
  await page.getByTitle('Запчасти, которые подставятся вместе с работой').click();
  await expect(page.getByRole('heading', { name: 'Запчасти для «Замена масла»' })).toBeVisible();
}

const search = (page: Page) => page.getByPlaceholder('Найти в каталоге');
const options = (page: Page) => page.getByRole('listbox', { name: 'Каталог запчастей' }).getByRole('option');

test.describe('desktop', () => {
  // The project default is a phone; the price list is a desktop/tablet screen.
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

  test('focusing the search expands the whole catalog', async ({ page }) => {
    await openModal(page);
    await expect(options(page)).toHaveCount(0);

    await search(page).click();
    await expect(options(page)).toHaveCount(4);
    await expect(page.getByText('Показано 4 из 4')).toBeVisible();
    await expect(options(page).first()).toContainText('Фильтр масляный');
    await expect(options(page).first()).toContainText('W712/95');

    // In the flow, not an absolute popover: nothing may be cut by the dialog.
    const dialog = (await page.locator('dialog[open]').boundingBox())!;
    const panel = (await page.locator('.pp-panel').boundingBox())!;
    expect(panel.x).toBeGreaterThanOrEqual(dialog.x);
    expect(panel.x + panel.width).toBeLessThanOrEqual(dialog.x + dialog.width);
    expect(panel.y + panel.height).toBeLessThanOrEqual(dialog.y + dialog.height);
    // …and it takes the whole row, not just the first grid cell.
    const row = (await page.locator('.tp-attach').boundingBox())!;
    expect(panel.width).toBeGreaterThan(row.width * 0.9);
  });

  test('a catalog larger than the old 100-row page is listed in full', async ({ page }) => {
    const many = Array.from({ length: 150 }, (_, i) => part(`m${i}`, `Деталь хвост-${i}`, 'ACME', `A-${i}`, 100 + i));
    await openModal(page, { parts: many });
    await search(page).click();
    await expect(page.getByText('Показано 150 из 150')).toBeVisible();
    await search(page).fill('хвост-149');
    await expect(options(page)).toHaveCount(1);
    await expect(options(page).first()).toContainText('A-149');
  });

  test('manufacturer chip narrows the list; typing narrows further', async ({ page }) => {
    await openModal(page);
    await search(page).click();

    const chips = page.getByRole('group', { name: 'Производитель' });
    await expect(chips.getByRole('button')).toHaveText(['Все', 'Castrol', 'Mahle', 'MANN']);

    await chips.getByRole('button', { name: 'MANN', exact: true }).click();
    await expect(options(page)).toHaveCount(2);
    await expect(page.getByText('Показано 2 из 4')).toBeVisible();
    await expect(chips.getByRole('button', { name: 'MANN', exact: true })).toHaveAttribute('aria-pressed', 'true');
    // the chip does not steal the caret — typing continues straight away
    await expect(search(page)).toBeFocused();

    await page.keyboard.type('возд');
    await expect(options(page)).toHaveCount(1);
    await expect(options(page).first()).toContainText('Фильтр воздушный');

    await chips.getByRole('button', { name: 'Все', exact: true }).click();
    await search(page).fill('');
    await expect(options(page)).toHaveCount(4);
  });

  test('«Скрыть привязанные» removes parts already attached in this section', async ({ page }) => {
    await openModal(page, { attached: [link(catalog[0])] });
    await search(page).click();

    const hide = page.getByLabel('Скрыть привязанные');
    await expect(hide).toBeChecked();
    await expect(options(page)).toHaveCount(3);
    await expect(page.getByText('Показано 3 из 4')).toBeVisible();
    await expect(options(page).filter({ hasText: 'W712/95' })).toHaveCount(0);

    await hide.uncheck();
    await expect(options(page)).toHaveCount(4);
    await expect(options(page).filter({ hasText: 'W712/95' })).toContainText('привязана');
  });

  test('keyboard: ↓ ↓ Enter picks the second part, Escape collapses', async ({ page }) => {
    await openModal(page);
    await search(page).click();
    await expect(options(page)).toHaveCount(4);

    // Escape folds the panel but must not close the modal around it.
    await page.keyboard.press('Escape');
    await expect(page.locator('.pp-panel')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Запчасти для «Замена масла»' })).toBeVisible();
    await expect(search(page)).toBeFocused();

    await page.keyboard.press('ArrowDown'); // reopens
    await expect(options(page)).toHaveCount(4);
    await page.keyboard.press('ArrowDown');
    await expect(options(page).nth(0)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowDown');
    await expect(options(page).nth(1)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    await expect(page.locator('.pp-panel')).toHaveCount(0);
    await expect(page.locator('.pp-value')).toContainText('Фильтр масляный');
    await expect(page.locator('.pp-value')).toContainText('Mahle');
    await expect(page.getByLabel('Роль в работе')).toBeFocused();

    // The reset button brings the search back, already unfolded.
    await page.getByRole('button', { name: 'Выбрать другую запчасть' }).click();
    await expect(search(page)).toBeFocused();
    await expect(options(page)).toHaveCount(4);
  });

  test('picked part + role + qty → PUT attach', async ({ page }) => {
    let sent: { url: string; body: unknown } | null = null;
    await openModal(page, { onAttach: (url, body) => { sent = { url, body }; } });

    await expect(page.getByRole('button', { name: 'Привязать запчасть' })).toBeDisabled();
    await search(page).click();
    await options(page).nth(1).click();
    await page.keyboard.type('фильтр масляный'); // focus is already in «Роль»
    await page.getByLabel('Количество').fill('2');
    await page.getByRole('button', { name: 'Привязать запчасть' }).click();

    await expect.poll(() => sent).not.toBeNull();
    expect(new URL(sent!.url).pathname).toBe('/api/price-list/t1/parts/p2');
    expect(sent!.body).toEqual({ generation_id: null, qty: 2, slot: 'фильтр масляный' });
    // the form is ready for the next part
    await expect(search(page)).toHaveValue('');
    await expect(page.getByLabel('Количество')).toHaveValue('1');
  });

  test('empty states: nothing found offers a reset; an empty catalog points to the tab', async ({ page }) => {
    await openModal(page);
    await search(page).fill('карбюратор');
    await expect(page.getByText('Ничего не найдено')).toBeVisible();
    await page.getByRole('button', { name: 'Сбросить фильтры' }).click();
    await expect(options(page)).toHaveCount(4);
    await expect(search(page)).toHaveValue('');
  });

  test('an empty catalog says where parts come from', async ({ page }) => {
    await openModal(page, { parts: [] });
    await search(page).click();
    await expect(page.getByText('Каталог пуст — добавьте детали во вкладке «Запчасти»')).toBeVisible();
    await expect(page.getByRole('group', { name: 'Производитель' })).toHaveCount(0);
  });

  test('clicking outside folds the panel', async ({ page }) => {
    await openModal(page);
    await search(page).click();
    await expect(options(page)).toHaveCount(4);
    await page.getByText('Эти запчасти подставятся в смету').click();
    await expect(page.locator('.pp-panel')).toHaveCount(0);
  });
});

test.describe('phone', () => {
  test('the picker fits a 390px screen with 44px targets', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openModal(page, { attached: [link(catalog[2])] });
    await search(page).click();
    await expect(options(page)).toHaveCount(3);

    // No sideways scrolling to reach the form or the list.
    const dialog = (await page.locator('dialog[open]').boundingBox())!;
    for (const sel of ['.pp-panel', '.tp-attach']) {
      const box = (await page.locator(sel).boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(dialog.x);
      expect(box.x + box.width).toBeLessThanOrEqual(dialog.x + dialog.width);
    }

    const tooSmall = await page
      .locator('.tp-attach')
      .locator('button, input:not([type="checkbox"]), label, [role="option"]')
      .evaluateAll((els) => els
        .map((el) => {
          const r = el.getBoundingClientRect();
          return { label: el.getAttribute('aria-label') || el.textContent?.trim() || el.tagName, w: r.width, h: r.height };
        })
        .filter(({ w, h }) => w > 0 && h > 0 && (w < 43.5 || h < 43.5)));
    expect(tooSmall).toEqual([]);

    await options(page).first().click();
    await expect(page.locator('.pp-value')).toContainText('Фильтр масляный');
    const reset = (await page.getByRole('button', { name: 'Выбрать другую запчасть' }).boundingBox())!;
    expect(Math.min(reset.width, reset.height)).toBeGreaterThanOrEqual(43.5);
  });
});
