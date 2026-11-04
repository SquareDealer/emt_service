import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import { FIXED_NOW, TEMPLATE_PREVIEW, WO_EMPTY, WO_FULL, stubApi } from './stub';

/**
 * Behavioural safety net for the pure-View refactor: auto-delete of abandoned
 * orders, board drag/pan, calendar move/placement and the template confirmation.
 * All requests are stubbed — assertions are made on the outgoing requests.
 */

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(FIXED_NOW);
  await stubApi(page);
});

const json = (route: Route, body: unknown) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

/** An order that is no longer «empty» — what the server answers after a line is added. */
const NOT_EMPTY = { ...WO_EMPTY, title: 'Ремонт', total_cached: 3000 };

/** Collects requests matching method + path (e.g. `DELETE`, `/api/work-orders/wo-empty`). */
function track(page: Page, method: string, pathRe: RegExp) {
  const hits: string[] = [];
  page.on('request', (r) => {
    if (r.method() === method && pathRe.test(new URL(r.url()).pathname)) hits.push(r.url());
  });
  return hits;
}

const DELETE_EMPTY = /^\/api\/work-orders\/wo-empty$/;

async function openEmptyOrder(page: Page) {
  await page.goto('/work-orders/wo-empty');
  await expect(page.getByPlaceholder('Напр. Замена масла')).toBeVisible();
}

async function leaveToBoard(page: Page) {
  await page.getByRole('link', { name: 'Доска' }).first().click();
  await expect(page).toHaveURL(/\/board$/);
}

test.describe('auto-delete of abandoned orders', () => {
  test('empty work order is deleted once on leave', async ({ page }) => {
    const deletes = track(page, 'DELETE', DELETE_EMPTY);
    await openEmptyOrder(page);
    await leaveToBoard(page);
    await expect.poll(() => deletes.length).toBe(1);
    await page.waitForTimeout(300);
    expect(deletes).toHaveLength(1);
  });

  test('adding a line keeps the order even if response is slow', async ({ page }) => {
    const deletes = track(page, 'DELETE', DELETE_EMPTY);
    await page.route(/\/api\/work-orders\/wo-empty\/labor$/, async (route) => {
      await new Promise((r) => setTimeout(r, 1000));
      await json(route, NOT_EMPTY);
    });
    await openEmptyOrder(page);
    const posted = page.waitForRequest((r) => r.method() === 'POST' && /\/labor$/.test(r.url()));
    await page.getByPlaceholder('Напр. Замена масла').fill('Ремонт');
    await page.getByRole('button', { name: 'Добавить работу' }).click();
    await posted;
    await leaveToBoard(page); // the response is still in flight
    await page.waitForTimeout(1500);
    expect(deletes).toHaveLength(0);
  });

  test('picking from price list keeps the order', async ({ page }) => {
    const deletes = track(page, 'DELETE', DELETE_EMPTY);
    await page.route(/\/api\/work-orders\/wo-empty\/apply-template$/, (route) => json(route, NOT_EMPTY));
    await openEmptyOrder(page);
    await page.getByLabel('Добавить из шаблона').selectOption({ label: 'Замена масла и фильтра' });
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Масло моторное 5W-30')).toBeVisible();
    await dialog.getByRole('button', { name: /^Добавить —/ }).click();
    await expect(dialog).toBeHidden();
    await leaveToBoard(page);
    await page.waitForTimeout(300);
    expect(deletes).toHaveLength(0);
  });

  test('duplicate keeps the order', async ({ page }) => {
    const deletes = track(page, 'DELETE', DELETE_EMPTY);
    const copy = { ...WO_FULL, id: 'wo-copy' };
    await page.route(/\/api\/work-orders\/wo-copy$/, (route) => json(route, copy));
    await page.route(/\/api\/work-orders\/wo-empty\/duplicate$/, (route) => json(route, copy));
    await openEmptyOrder(page);
    await page.getByRole('button', { name: 'Копировать наряд' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Копировать', exact: true }).click();
    await expect(page).toHaveURL(/\/work-orders\/wo-copy$/);
    await page.waitForTimeout(300);
    expect(deletes).toHaveLength(0);
  });

  test('save keeps the order', async ({ page }) => {
    const deletes = track(page, 'DELETE', DELETE_EMPTY);
    await openEmptyOrder(page);
    await page.getByRole('button', { name: 'Сохранить' }).click();
    await expect(page).toHaveURL(/\/board$/);
    await page.waitForTimeout(300);
    expect(deletes).toHaveLength(0);
  });
});

test.describe('board', () => {
  test('dragging a board card patches status', async ({ page }) => {
    await page.goto('/board');
    const card = page.locator('.board-card-drag', { hasText: 'Диагностика подвески' });
    await expect(card).toBeVisible();
    const target = page.locator('.board-col-body').nth(1); // «В работе»
    const from = (await card.boundingBox())!;
    const to = (await target.boundingBox())!;

    const patch = page.waitForRequest(
      (r) => r.method() === 'PATCH' && /\/api\/work-orders\/wo-empty\/status$/.test(r.url()),
    );
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2 + 12, { steps: 4 });
    await page.mouse.move(to.x + to.width / 2, to.y + 60, { steps: 12 });
    await page.mouse.up();

    expect((await patch).postDataJSON()).toEqual({ status: 'in_progress' });
    await expect(page).toHaveURL(/\/board$/);
  });

  test('clicking a board card opens the order', async ({ page }) => {
    await page.goto('/board');
    await page.locator('.board-card-drag', { hasText: 'Диагностика подвески' }).click();
    await expect(page).toHaveURL(/\/work-orders\//);
  });

  test('dragging board background pans without navigation', async ({ page }) => {
    // Narrow viewport so the five columns overflow and there is something to pan.
    await page.setViewportSize({ width: 900, height: 800 });
    await page.goto('/board');
    const board = page.locator('.board');
    await expect(page.locator('.board-card-drag').first()).toBeVisible();
    expect(await board.evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(true);
    expect(await board.evaluate((e) => e.scrollLeft)).toBe(0);

    // Press on a column header: board background, not a card.
    const head = (await page.locator('.board-col-head').nth(1).boundingBox())!;
    const y = head.y + head.height / 2;
    const x = head.x + head.width / 2;
    const url = page.url();
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 250, y, { steps: 10 });
    await page.mouse.up();

    expect(await board.evaluate((e) => e.scrollLeft)).toBeGreaterThan(0);
    expect(page.url()).toBe(url);
  });
});

test.describe('calendar', () => {
  test('moving a calendar event patches scheduled_at', async ({ page }) => {
    await page.goto('/calendar');
    const ev = page.locator('.stl-col[data-di="3"] .stl-ev', { hasText: 'Замена ремня ГРМ' }); // Thu 11:00
    await expect(ev).toBeVisible();
    await expect(ev.locator('.stl-ev-time')).toHaveText('11:00–15:00');
    await ev.hover();
    const box = (await ev.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + 14;

    const patch = page.waitForRequest(
      (r) => r.method() === 'PATCH' && /\/api\/work-orders\/wo-waiting$/.test(r.url()),
    );
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 24, { steps: 6 }); // 0.8 px/min → 24px = 30 min
    await page.mouse.move(x, y + 48, { steps: 6 }); // one hour later
    await page.mouse.up();

    const body = (await patch).postDataJSON() as { scheduled_at: string };
    expect(new Date(body.scheduled_at).toISOString()).toBe('2026-11-19T09:00:00.000Z'); // 12:00 Moscow
  });

  test('calendar places events on the right day and time', async ({ page }) => {
    await page.goto('/calendar');
    await expect(page.locator('.stl-ev').first()).toBeVisible();

    // Mon 16 Nov 10:00–11:30 and Wed 18 Nov 09:00–12:00 (di = column index, Mon = 0).
    const cases = [
      { di: '0', title: 'Замена колодок', time: '10:00–11:30', offsetMin: 120, durMin: 90 },
      { di: '2', title: 'ТО и тормоза', time: '09:00–12:00', offsetMin: 60, durMin: 180 },
    ];
    for (const c of cases) {
      const col = page.locator(`.stl-col[data-di="${c.di}"]`);
      const ev = col.locator('.stl-ev', { hasText: c.title });
      await expect(ev).toHaveCount(1);
      await expect(ev.locator('.stl-ev-time')).toHaveText(c.time);
      // The event sits in its day column at (start − 08:00) × 0.8 px/min, sized by duration.
      const colBox = (await col.boundingBox())!;
      const evBox = (await ev.boundingBox())!;
      expect(Math.abs(evBox.y - colBox.y - c.offsetMin * 0.8 - 2)).toBeLessThanOrEqual(3);
      expect(Math.abs(evBox.height - c.durMin * 0.8)).toBeLessThanOrEqual(2);
    }
    // And the same title is not in the other days' columns.
    await expect(page.locator('.stl-col:not([data-di="2"]) .stl-ev', { hasText: 'ТО и тормоза' })).toHaveCount(0);
    await expect(page.locator('.stl-col:not([data-di="0"]) .stl-ev', { hasText: 'Замена колодок' })).toHaveCount(0);
  });
});

test.describe('apply template', () => {
  test('unticked template part is not sent', async ({ page }) => {
    let body: { template_id: string; part_template_ids: string[]; qty: Record<string, number> } | null = null;
    await page.route(/\/api\/work-orders\/wo-empty\/apply-template$/, (route) => {
      body = route.request().postDataJSON();
      return json(route, NOT_EMPTY);
    });
    await openEmptyOrder(page);
    await page.getByLabel('Добавить из шаблона').selectOption({ label: 'Замена масла и фильтра' });
    const dialog = page.getByRole('dialog');
    const [oil, filter] = TEMPLATE_PREVIEW.parts;
    const oilBox = dialog.getByRole('checkbox').nth(0);
    const filterBox = dialog.getByRole('checkbox').nth(1);
    await expect(oilBox).toBeChecked();
    await expect(filterBox).toBeChecked();

    await filterBox.uncheck();
    await expect(filterBox).not.toBeChecked();

    // Clicking the quantity field must not toggle its row's checkbox.
    const qtyInputs = dialog.locator('input.cell-input');
    await qtyInputs.nth(1).click();
    await expect(filterBox).not.toBeChecked();
    await qtyInputs.nth(0).click();
    await expect(oilBox).toBeChecked();

    await dialog.getByRole('button', { name: /^Добавить —/ }).click();
    await expect(dialog).toBeHidden();

    expect(body).not.toBeNull();
    const sent = body!;
    expect(sent.template_id).toBe('tpl-oil');
    expect(sent.part_template_ids).toEqual([oil.part_template_id]);
    expect(sent.part_template_ids).not.toContain(filter.part_template_id);
    expect(Object.keys(sent.qty)).toEqual([oil.part_template_id]);
  });
});
