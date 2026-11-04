import { expect, test } from '@playwright/test';
import { money, orderTotal } from '../../src/lib/format';
import { FIXED_NOW, WO_FULL, stubApi } from './stub';

/**
 * Aria-snapshot safety net for the pure-View refactor: each screen's accessible
 * tree must stay identical. Never update these snapshots to make a refactor pass.
 */

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(FIXED_NOW);
  await stubApi(page);
});

test('board shows five columns with cards', async ({ page }) => {
  await page.goto('/board');
  await expect(page.getByText('ТО и тормоза')).toBeVisible();
  await expect(page.locator('main')).toMatchAriaSnapshot();
});

test('work order shows blocks, discounts and total', async ({ page }) => {
  await page.goto('/work-orders/wo-full');
  const expectedTotal = orderTotal(WO_FULL);
  await expect(page.getByText(money(expectedTotal)).first()).toBeVisible();
  await expect(page.locator('main')).toMatchAriaSnapshot();
});

test('calendar week renders events and now-line', async ({ page }) => {
  await page.goto('/calendar');
  await expect(page.getByRole('heading', { name: 'Календарь' })).toBeVisible();
  await expect(page.locator('.stl-now, .stl-now-v')).toHaveCount(1);
  await expect(page.locator('main')).toMatchAriaSnapshot();
});

test('price list for generation R56', async ({ page }) => {
  await page.goto('/price-list');
  await expect(page.getByText('Замена передних колодок')).toBeVisible();
  await expect(page.locator('main')).toMatchAriaSnapshot();
});

test('client card shows vehicles and orders', async ({ page }) => {
  await page.goto('/clients/client-hero');
  await expect(page.getByRole('heading', { name: 'Васильев Андрей Сергеевич' })).toBeVisible();
  await expect(page.getByText('ТО и тормоза')).toBeVisible();
  await expect(page.locator('main')).toMatchAriaSnapshot();
});

test('cmd+k palette lists hits', async ({ page }) => {
  await page.goto('/clients/client-hero');
  await expect(page.getByRole('heading', { name: 'Васильев Андрей Сергеевич' })).toBeVisible();
  await page.keyboard.press('Meta+K');
  await page.getByRole('textbox', { name: 'Поисковый запрос' }).fill('WMW');
  const palette = page.getByRole('dialog');
  await expect(palette.getByText('WMWSU31090T123456')).toBeVisible();
  await expect(palette).toMatchAriaSnapshot();
});
