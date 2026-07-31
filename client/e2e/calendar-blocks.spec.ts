import { expect, test } from '@playwright/test';

/**
 * Covers the Phase 2 calendar interactions, which are pointer-capture dependent
 * and therefore not reachable by unit tests:
 *  - clicking empty space offers «Новая запись» / «Резерв»
 *  - dragging empty space still pans, without opening that menu
 *  - reserved time renders as a block, visually distinct from a booking
 *
 * All API traffic is stubbed (the repo's existing e2e convention), so this needs
 * no backend and no credentials.
 */

const user = { id: 'owner-1', name: 'Владелец', login: 'owner', role: 'owner' };

const settings = {
  labor_rate: 2000,
  company_name: '',
  company_inn: '',
  company_address: '',
  company_phone: '',
  vat_rate: 0,
  working_hours_start: 8,
  working_hours_end: 20,
  slot_minutes: 30,
  default_appointment_min: 60,
};

/** A shop-wide reserve with no title — the «занято без имени» case. */
function namelessBlock(day: Date) {
  const start = new Date(day);
  start.setHours(12, 0, 0, 0);
  return {
    id: 'block-1',
    title: null,
    starts_at: start.toISOString(),
    duration_min: 120,
    user_id: null,
    user: null,
    notes: null,
    created_by: user.id,
    created_at: start.toISOString(),
  };
}

test.beforeEach(async ({ context, page }) => {
  await context.addInitScript(() => {
    localStorage.setItem('crm-token', 'test-token');
    localStorage.setItem('crm-cal-orientation', 'vertical');
  });

  await page.route('**/api/**', (route) =>
    route.fulfill({ contentType: 'application/json', body: '{}' }),
  );
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(user) }),
  );
  await page.route('**/api/settings', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(settings) }),
  );
  await page.route('**/api/users', (route) =>
    route.fulfill({ contentType: 'application/json', body: '[]' }),
  );
  await page.route('**/api/work-orders/calendar**', (route) =>
    route.fulfill({ contentType: 'application/json', body: '[]' }),
  );
  await page.route('**/api/calendar-blocks**', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([namelessBlock(new Date())]),
    }),
  );

  await page.goto('/calendar');
  await expect(page.getByRole('heading', { name: 'Календарь' })).toBeVisible();
  // Day view keeps a single wide column, so coordinates are unambiguous.
  await page.getByRole('button', { name: 'День', exact: true }).click();
});

test('reserved time renders as a block, not as a booking', async ({ page }) => {
  const block = page.locator('.stl-ev[data-kind="block"]');
  await expect(block).toHaveCount(1);
  // Untitled blocks fall back to «Занято» rather than showing an empty row.
  await expect(block).toContainText('Занято');
  // A booking would carry data-status; a block must not be mistaken for one.
  await expect(block).not.toHaveAttribute('data-status', /.+/);
});

test('clicking empty space offers a booking or a reserve', async ({ page }) => {
  const col = page.locator('.stl-col[data-di="0"]');
  const box = await col.boundingBox();
  expect(box).not.toBeNull();

  // Press and release without moving → a click, not a pan.
  const x = box!.x + box!.width / 2;
  const y = box!.y + 60;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.up();

  // Scoped to the dialog: the block on the grid also carries the word «Резерв».
  const menu = page.getByRole('dialog');
  await expect(menu.getByRole('button', { name: /Новая запись/ })).toBeVisible();
  await expect(menu.getByRole('button', { name: /Просто занять время/ })).toBeVisible();
});

test('dragging empty space pans instead of opening the menu', async ({ page }) => {
  const col = page.locator('.stl-col[data-di="0"]');
  const box = await col.boundingBox();
  const x = box!.x + box!.width / 2;
  const y = box!.y + 60;

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 80, { steps: 8 }); // well past the 3px threshold
  await page.mouse.up();

  // Grab-pan must stay the behaviour of a drag: no creation dialog.
  await expect(page.getByRole('button', { name: /Новая запись/ })).toHaveCount(0);
});

test('choosing «Резерв» opens the reserve form on the clicked slot', async ({ page }) => {
  const col = page.locator('.stl-col[data-di="0"]');
  const box = await col.boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + 60);
  await page.mouse.down();
  await page.mouse.up();

  await page.getByRole('dialog').getByRole('button', { name: /Просто занять время/ }).click();

  await expect(page.getByRole('heading', { name: 'Резерв времени' })).toBeVisible();
  // The name is optional on purpose — that is the whole point of a reserve.
  const title = page.getByPlaceholder(/по умолчанию/);
  await expect(title).toBeVisible();
  await expect(title).toHaveValue('');
  // The slot that was clicked is carried into the form.
  await expect(page.locator('input[type="datetime-local"]')).not.toHaveValue('');
});
