import { expect, test, type Page, type Request } from '@playwright/test';

/**
 * Analytics screen against stubbed `/api/analytics/**`: the request contract
 * (edges / prev_*), the numbers it shows, empty/error states, the cost
 * fill-in modal and the owner-only guard. The repo's e2e convention: every
 * `/api/**` call is stubbed.
 */

test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

const owner = { id: 'owner-1', name: 'Владелец', login: 'owner', role: 'owner' };
const receptionist = { id: 'r-1', name: 'Приёмщик', login: 'rec', role: 'master_receptionist' };

const json = (body: unknown, status = 200) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

const totals = (over: Record<string, unknown> = {}) => ({
  orders: 17,
  hours: 30,
  revenue: 382250,
  labor: 150000,
  parts_sale: 232250,
  parts_cost: 140000,
  markup: 92250,
  unknown_sale: 75000,
  unknown_count: 6,
  discounts: 5000,
  profit: 166779,
  margin: 0.436,
  avg_check: 22485,
  ...over,
});

const clientRow = {
  client_id: 'c1',
  name: 'Тихонов Д. И.',
  vehicle: 'MINI Cooper',
  last_closed_at: '2026-11-03T10:00:00.000Z',
  orders: 3,
  revenue: 90000,
  profit: 40000,
  margin: 0.44,
  avg_check: 30000,
  unknown_count: 0,
};

function summaryBody(url: string, over: { totals?: Record<string, unknown> } = {}) {
  const edges = new URL(url).searchParams.get('edges')!.split(',');
  const buckets = edges.slice(0, -1).map((from, i) => ({
    from,
    to: edges[i + 1],
    orders: 0,
    labor: 0,
    markup: 0,
    cost: 0,
    unknown: 0,
    revenue: i === 4 ? 43222 : 0,
    profit: 0,
  }));
  return {
    totals: totals(over.totals),
    previous: totals({ revenue: 402000 }),
    buckets,
    breakdown: { labor: [], parts: [], vehicles: [], clients: [clientRow] },
  };
}

const missingRow = {
  part_line_id: 'pl1',
  work_order_id: 'wo1',
  doc_number: 41,
  closed_at: '2026-11-03T10:00:00.000Z',
  vehicle: 'MINI Cooper',
  client: 'Тихонов Д. И.',
  name: 'Фильтр масляный',
  manufacturer: 'MANN',
  qty: 2,
  unit: 'pcs',
  net: 1900,
};

interface Seen {
  summary: Request[];
  missing: Request[];
  patches: unknown[];
  analytics: string[];
}

async function setup(
  page: Page,
  opts: {
    user?: typeof owner;
    summary?: (url: string, n: number) => ReturnType<typeof json>;
  } = {},
): Promise<Seen> {
  const seen: Seen = { summary: [], missing: [], patches: [], analytics: [] };
  await page.context().addInitScript(() => localStorage.setItem('crm-token', 'test-token'));
  await page.route('**/api/**', (route) => route.fulfill(json({})));
  await page.route('**/api/auth/me', (route) => route.fulfill(json(opts.user ?? owner)));
  await page.route('**/api/clients**', (route) => route.fulfill(json([])));
  await page.route('**/api/analytics/**', (route) => {
    const req = route.request();
    seen.analytics.push(req.url());
    const { pathname } = new URL(req.url());
    if (pathname.endsWith('/analytics/summary')) {
      seen.summary.push(req);
      return route.fulfill(
        opts.summary ? opts.summary(req.url(), seen.summary.length) : json(summaryBody(req.url())),
      );
    }
    if (pathname.endsWith('/analytics/missing-costs')) {
      seen.missing.push(req);
      return route.fulfill(json([missingRow]));
    }
    if (pathname.endsWith('/analytics/part-costs') && req.method() === 'PATCH') {
      seen.patches.push(req.postDataJSON());
      return route.fulfill(json({ updated: 1 }));
    }
    return route.fulfill(json({}));
  });
  return seen;
}

const edgesOf = (req: Request) => new URL(req.url()).searchParams.get('edges')!.split(',');

test('summary request carries ascending ISO edges and the comparison period', async ({ page }) => {
  const seen = await setup(page);
  await page.goto('/analytics');
  await expect(page.getByText('382 250 ₽').first()).toBeVisible();

  const params = new URL(seen.summary[0].url()).searchParams;
  const edges = edgesOf(seen.summary[0]);
  expect(edges.length).toBeGreaterThanOrEqual(2);
  for (const e of edges) expect(e.endsWith('Z')).toBe(true);
  for (let i = 1; i < edges.length; i++) {
    expect(Date.parse(edges[i])).toBeGreaterThan(Date.parse(edges[i - 1]));
  }
  expect(params.get('prev_from')).toBeTruthy();
  expect(params.get('prev_to')).toBeTruthy();
});

test('numbers come from the server; no demo-data badge', async ({ page }) => {
  await setup(page);
  await page.goto('/analytics');
  await expect(page.getByText('382 250 ₽').first()).toBeVisible();
  await expect(page.getByText('166 779 ₽').first()).toBeVisible();
  await expect(page.locator('.an-kpi', { hasText: 'Закрыто нарядов' }).getByText('17', { exact: true })).toBeVisible();
  await expect(page.getByText(/демо-данные/i)).toHaveCount(0);
});

test('switching to «Год» requests 13 edges', async ({ page }) => {
  const seen = await setup(page);
  await page.goto('/analytics');
  await expect(page.getByText('382 250 ₽').first()).toBeVisible();
  const before = seen.summary.length;

  await page.getByRole('button', { name: 'Год', exact: true }).click();
  await expect.poll(() => seen.summary.length).toBeGreaterThan(before);
  expect(edgesOf(seen.summary[seen.summary.length - 1])).toHaveLength(13);
});

test('an empty period shows the empty state without NaN or undefined', async ({ page }) => {
  await setup(page, {
    summary: (url) =>
      json(
        summaryBody(url, {
          totals: {
            orders: 0, hours: 0, revenue: 0, labor: 0, parts_sale: 0, parts_cost: 0, markup: 0,
            unknown_sale: 0, unknown_count: 0, discounts: 0, profit: 0, margin: null, avg_check: null,
          },
        }),
      ),
  });
  await page.goto('/analytics');
  await expect(page.getByText('За этот период нет закрытых нарядов')).toBeVisible();
  const text = await page.locator('body').innerText();
  for (const bad of ['NaN', 'Infinity', 'undefined']) expect(text).not.toContain(bad);
});

test('a server error shows a retry button; retry brings the numbers', async ({ page }) => {
  // The query client retries once, so the first two requests fail; the click is the third.
  await setup(page, {
    summary: (url, n) =>
      n <= 2 ? json({ message: 'boom' }, 500) : json(summaryBody(url)),
  });
  await page.goto('/analytics');
  await expect(page.getByText('Не удалось загрузить аналитику')).toBeVisible();
  await page.getByRole('button', { name: 'Повторить' }).click();
  await expect(page.getByText('382 250 ₽').first()).toBeVisible();
  await expect(page.getByText('Не удалось загрузить аналитику')).toHaveCount(0);
});

test('a bucket count mismatch shows the error panel with retry, the page survives', async ({ page }) => {
  await setup(page, {
    summary: (url) => {
      const body = summaryBody(url);
      body.buckets = body.buckets.slice(0, body.buckets.length - 2);
      return json(body);
    },
  });
  await page.goto('/analytics');
  await expect(page.getByRole('alert').getByText('Не удалось загрузить аналитику')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Повторить' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Аналитика' }).first()).toBeVisible();
});

test('missing costs can be filled in from the modal and the summary refetches', async ({ page }) => {
  const seen = await setup(page);
  await page.goto('/analytics');
  await expect(page.getByText('382 250 ₽').first()).toBeVisible();

  await page.getByRole('button', { name: /Не указана закупка у 6 запчастей/ }).click();
  await expect.poll(() => seen.missing.length).toBeGreaterThan(0);
  const mp = new URL(seen.missing[0].url()).searchParams;
  expect(mp.get('from')).toBeTruthy();
  expect(mp.get('to')).toBeTruthy();

  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/Закупка за ед\.: Фильтр масляный/).fill('520');
  await expect(dialog.getByText('1 040 ₽')).toBeVisible();

  const summariesBefore = seen.summary.length;
  await dialog.getByRole('button', { name: 'Сохранить' }).click();

  await expect.poll(() => seen.patches).toEqual([
    { items: [{ part_line_id: 'pl1', purchase_price: 520 }] },
  ]);
  await expect.poll(() => seen.summary.length).toBeGreaterThan(summariesBefore);
});

test('an invalid purchase price blocks saving', async ({ page }) => {
  const seen = await setup(page);
  await page.goto('/analytics');
  await page.getByRole('button', { name: /Не указана закупка у 6 запчастей/ }).click();

  const dialog = page.getByRole('dialog');
  const input = dialog.getByLabel(/Закупка за ед\.: Фильтр масляный/);
  await input.fill('abc');
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await expect(dialog.getByRole('button', { name: 'Сохранить' })).toBeDisabled();
  expect(seen.patches).toHaveLength(0);
});

test('a client row opens the client card', async ({ page }) => {
  await setup(page);
  await page.goto('/analytics');
  await page.getByRole('button', { name: 'Клиенты', exact: true }).click();
  await page.getByText('Тихонов Д. И.').click();
  await expect(page).toHaveURL(/\/clients\/c1$/);
});

test('a non-owner has no menu item, is redirected, and sends no analytics requests', async ({ page }) => {
  const seen = await setup(page, { user: receptionist });
  await page.goto('/analytics');
  await expect(page).toHaveURL(/\/clients$/);
  await expect(page.getByRole('link', { name: 'Аналитика' })).toHaveCount(0);
  expect(seen.analytics).toEqual([]);
});
