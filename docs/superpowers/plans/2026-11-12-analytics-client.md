# Подключение экрана «Аналитика» к API — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Экран `/analytics` показывает реальные цифры с сервера вместо демо-данных, а владелец может вводить закупочную цену в трёх местах: в аналитике, в каталоге запчастей и в наряде.

**Architecture:** Клиент больше ничего не агрегирует: он строит границы периода и корзин (`periodOf`), отправляет их на `GET /analytics/summary` и только раскладывает ответ по уже готовой вёрстке. Чистая логика (параметры запроса, преобразование ответа в вид таблиц, сбор тела запроса каталога, строки закупки наряда) вынесена в маленькие модули с vitest-тестами; компоненты остаются тонкими. `mock.ts` и клиентская агрегация удаляются.

**Tech Stack:** React 18, TypeScript, TanStack Query 5, react-router 6, date-fns 3, vitest, Playwright (все `/api/**` застабены).

**Spec:** письменной спеки нет. Источники: согласованный прототип (`client/src/features/analytics/`), контракт бэкенда — `src/analytics/analytics-calc.ts` (типы `Totals`, `Bucket`, `*Row`, `Breakdown`), `src/analytics/analytics.service.ts` (`AnalyticsSummary`, `MissingCostRow`, `PartCostRow`), `src/analytics/analytics.controller.ts` (маршруты и правила параметров), план бэкенда `docs/superpowers/plans/2026-11-12-analytics-backend.md`.

## Решения

1. **Закупка вводится за единицу** везде (бэкенд хранит `purchase_price` за единицу). В модалке дозаполнения поле «Закупка за ед.», рядом показываются закупка строки (`кол-во × цена`) и наценка к продаже.
2. **Не-владелец никогда не отправляет ключ `purchase_price`** — сервер отвечает 403 даже на `null`, и правка каталога приёмщиком сломалась бы целиком. Владелец отправляет ключ только если значение задано (создание) или изменилось (правка).
3. **В наряде закупка — отдельная панель «Закупка»** под панелью «Запчасти», видна только владельцу, работает и у закрытого наряда. Сетку таблицы запчастей не трогаем: `WorkOrderPage.tsx` — 1261 строка, одна точка вставки безопаснее новой колонки.
4. **Период сравнения** считает клиент (`comparisonFor`, уже есть) и передаёт как `prev_from`/`prev_to`. Итоги текущего периода сервер считает по всему периоду — будущих закрытых нарядов не бывает, результат тот же.
5. **При смене периода прошлые цифры остаются на экране приглушёнными** до прихода новых (`keepPreviousData`); скелетон — только при первой загрузке.
6. **Ссылки из таблиц:** строка вкладки «Клиенты» ведёт в карточку клиента, строка модалки дозаполнения — в наряд. У работ, запчастей и машин идентификаторов сущностей в ответе нет — ссылок нет.
7. Бейдж «демо-данные» убирается.

## Global Constraints

- Бэкенд не меняется. Контракт: `GET /analytics/summary?edges=<iso>,…&prev_from=<iso>&prev_to=<iso>` (2…63 границы, строго по возрастанию, только полный ISO-инстант с зоной — `Date.toISOString()` подходит); `GET /analytics/missing-costs?from=<iso>&to=<iso>`; `GET /analytics/part-costs/:workOrderId`; `PATCH /analytics/part-costs` с телом `{ items: [{ part_line_id, purchase_price }] }`, 1…200 элементов, `purchase_price` — число `0 … 9999999999.99` или `null`, повтор `part_line_id` → 400.
- Поля API — `snake_case`; `margin`, `markup_pct` — доли 0…1; единицы — `'pcs' | 'l'`.
- Дизайн-система проекта: токены `client/src/index.css`, иконки только lucide, модалки — `Modal` из `components/ui.tsx`, деньги/ID — моноширинный + `tabular-nums`. Новых зависимостей не добавлять.
- **Не запускать prettier.**
- Юниты — vitest, чистые функции, файлы `*.spec.ts` рядом с кодом (`vitest.config.ts` берёт `src/**/*.spec.ts`). E2E — Playwright, все `/api/**` застабены; проект по умолчанию — телефон, десктопные спеки ставят `test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false })`.
- Проверка после каждой задачи: `cd client && npm run typecheck && npm run lint && npm test`. E2E запускать с `--trace off`.
- Установка зависимостей клиента в облачном контейнере: `npm ci --replace-registry-host=registry.npmmirror.com`.
- Навигация на наряд/клиента передаёт `state.back = { to: '/analytics', label: 'Аналитика' }`.
- Тексты интерфейса — по-русски, деловой тон, без восклицаний.

## Review Focus

1. **Приёмщик правит запчасть каталога** — тело запроса не содержит ключа `purchase_price` ни при каком состоянии формы. Тест: Task 5.
2. **Период без закрытых нарядов** — пустое состояние, ни одного `NaN`, `Infinity` или «undefined ₽». Тест: Task 4 (e2e в Task 7).
3. **Мусор в поле закупки** («12,5», «abc», «-3», пусто, число больше предела) — запятая принимается как десятичная, невалидное не отправляется и помечается. Тест: Task 2.
4. **Больше 200 строк без закупки** — запись идёт пачками по 200, а не одним запросом с 400. Тест: Task 2.
5. **Число корзин в ответе не совпало с периодом** — явная ошибка на экране, а не сдвинутый на день график. Тест: Task 2.

---

## Структура файлов

| Файл | Ответственность |
|---|---|
| `client/src/lib/types.ts`, `client/src/lib/api.ts` (modify) | Типы ответа аналитики, 4 метода API, `PartTemplate.purchase_price` |
| `client/src/features/analytics/query.ts` (new) | Чистые: параметры запроса из периода, разбор ввода цены, разбиение на пачки |
| `client/src/features/analytics/view.ts` (new) | Чистые: ответ API → корзины графика и таблицы «Что выгодно» |
| `client/src/features/analytics/analytics.ts` (modify) | Остаётся только календарная математика периода и `delta`/`niceScale` |
| `client/src/features/analytics/mock.ts` (delete) | — |
| `client/src/features/analytics/CostFillModal.tsx`, `AnalyticsPage.tsx`, `TrendChart.tsx`, `analytics.css` (modify) | Экран на реальных данных |
| `client/src/lib/parts.ts` (modify) | `partTemplateBody` — сбор тела запроса каталога с учётом роли |
| `client/src/features/price-list/PartsCatalog.tsx`, `price-list.css` (modify) | Колонка и поле «Закупка» для владельца |
| `client/src/features/work-orders/part-costs.ts`, `PartCostsPanel.tsx` (new), `WorkOrderPage.tsx`, `wo.css` (modify) | Панель «Закупка» в наряде |
| `client/e2e/analytics.spec.ts` (new), `client/e2e/price-list.spec.ts` (modify) | Сквозные сценарии |

---

### Task 1: Типы и методы API

**Files:**
- Modify: `client/src/lib/types.ts`, `client/src/lib/api.ts`

**Interfaces:**
- Produces (в `types.ts`, имена полей — точно как в `src/analytics/analytics-calc.ts` и `analytics.service.ts`):

```ts
export interface AnalyticsTotals { orders; hours; revenue; labor; parts_sale; parts_cost; markup;
  unknown_sale; unknown_count; discounts; profit: number; margin: number | null; avg_check: number | null }
export interface AnalyticsBucket { from: string; to: string; orders; labor; markup; cost; unknown; revenue; profit: number }
export interface AnalyticsLaborRow { key: string; name: string; count: number; hours: number; revenue: number; per_hour: number | null }
export interface AnalyticsPartRow { key: string; name: string; manufacturer: string | null; unit: PartUnit; qty: number;
  revenue: number; cost: number | null; markup: number | null; markup_pct: number | null; unknown_count: number }
export interface AnalyticsVehicleRow { key: string; name: string; orders: number; revenue: number; profit: number;
  margin: number | null; avg_check: number | null; unknown_count: number }
export interface AnalyticsClientRow extends Omit<AnalyticsVehicleRow, 'key'> { client_id: string; vehicle: string; last_closed_at: string }
export interface AnalyticsBreakdown { labor: AnalyticsLaborRow[]; parts: AnalyticsPartRow[]; vehicles: AnalyticsVehicleRow[]; clients: AnalyticsClientRow[] }
export interface AnalyticsSummary { totals: AnalyticsTotals; previous: AnalyticsTotals | null; buckets: AnalyticsBucket[]; breakdown: AnalyticsBreakdown }
export interface MissingCostRow { part_line_id: string; work_order_id: string; doc_number: number | null; closed_at: string;
  vehicle: string; client: string; name: string; manufacturer: string | null; qty: number; unit: PartUnit; net: number }
export interface PartCostRow { part_line_id: string; name: string; manufacturer: string | null; qty: number; unit: PartUnit; purchase_price: number | null }
export interface PartCostItem { part_line_id: string; purchase_price: number | null }
```
  (все неуказанные типы полей — `number`). В `PartTemplate` добавить `purchase_price?: number | null` с комментарием «приходит только владельцу».
- Produces (в `api.ts`):

```ts
analyticsSummary: (p: { edges: string[]; prev?: { from: string; to: string } }) => Promise<AnalyticsSummary>
analyticsMissingCosts: (from: string, to: string) => Promise<MissingCostRow[]>
partCosts: (workOrderId: string) => Promise<PartCostRow[]>
setPartCosts: (items: PartCostItem[]) => Promise<{ updated: number }>
```
  Параметры — через `URLSearchParams` (как `api.archive`); `edges` — одной строкой через запятую.

- [ ] **Step 1:** Добавить типы и методы.
- [ ] **Step 2:** Run `cd client && npm run typecheck && npm run lint` — Expected: PASS.
- [ ] **Step 3: Commit** — `feat(client): типы и методы API аналитики`

---

### Task 2: Чистая логика запроса и вида

**Files:**
- Create: `client/src/features/analytics/query.ts`, `client/src/features/analytics/view.ts`
- Test: `client/src/features/analytics/query.spec.ts`, `client/src/features/analytics/view.spec.ts`

**Interfaces:**
- Consumes: `Period`, `Comparison`, `periodOf`, `comparisonFor`, `BreakdownKind`, `BreakdownCol`, `BreakdownRow`, `Breakdown` (вид таблицы) из `./analytics`; типы Task 1.
- Produces:

```ts
// query.ts
export const MAX_PURCHASE_PRICE = 9_999_999_999.99;
export const COSTS_CHUNK = 200;
export function summaryParams(p: Period, cmp: Comparison): { edges: string[]; prev: { from: string; to: string } };
/** '' → { kind: 'empty' }; валидное → { kind: 'ok', value }; иначе { kind: 'invalid' }. Запятая = точка, пробелы игнорируются. */
export function parsePrice(raw: string): { kind: 'empty' } | { kind: 'ok'; value: number } | { kind: 'invalid' };
export function chunk<T>(items: T[], size: number): T[][];

// view.ts
export interface ChartBucket { from: Date; to: Date; label: string; title: string; orders: number;
  labor: number; markup: number; cost: number; unknown: number; revenue: number; profit: number }
export function bucketsView(p: Period, api: AnalyticsBucket[]): ChartBucket[];   // throw Error при несовпадении длины
export function breakdownView(kind: BreakdownKind, bd: AnalyticsBreakdown): Breakdown;
export function unitLabel(u: PartUnit): 'шт' | 'л';
```

Правила:
- `summaryParams.edges` = `p.buckets.map(b => b.from.toISOString())` + `p.to.toISOString()`; `prev` = `cmp.previous` в ISO.
- `breakdownView` сохраняет колонки, их порядок, флаги `minor` и `defaultSort` прототипа (`breakdown()` в `analytics.ts`): работы — Раз, Часы, Выручка, ₽ за час (сортировка 2); запчасти — Кол-во, Продажа, Закупка, Наценка, Наценка % (3); машины — Нарядов, Выручка, Прибыль, Маржа, Средний чек (2); клиенты — те же колонки (1). `BreakdownRow` расширяется необязательным `href?: string`; заполняется только у клиентов: `/clients/<client_id>`. `sub`: у запчастей — производитель; у клиентов — `<vehicle> · закрыт <d MMM>`. `unknown` ← `unknown_count`. `key` строки — `key` из ответа (у клиентов — `client_id`).
- `parsePrice`: валидно — конечное число `0 … MAX_PURCHASE_PRICE`.

- [ ] **Step 1: Написать падающие тесты.**

```ts
// query.spec.ts
it('месяц: границ на одну больше, чем дней, все — полные ISO с Z', () => {
  const p = periodOf('month', new Date(2026, 10, 12));           // ноябрь 2026
  const { edges } = summaryParams(p, comparisonFor(p, new Date(2026, 10, 12, 15)));
  expect(edges).toHaveLength(31);
  expect(edges.every((e) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(e))).toBe(true);
  expect(new Date(edges[0]).getTime()).toBe(new Date(2026, 10, 1).getTime());
  expect(new Date(edges[30]).getTime()).toBe(new Date(2026, 11, 1).getTime());
});
it('границы строго возрастают для недели, квартала и года', () => { /* для каждого вида: edges[i] < edges[i+1] */ });
it('квартал укладывается в лимит 63 границы', () => { expect(edges.length).toBeLessThanOrEqual(63); });
it('идущий период: prev — столько же дней с начала прошлого', () => {
  // 12 ноября → prev.from = 1 окт 00:00, prev.to = 13 окт 00:00 (локальное время)
});
it('завершённый период: prev — весь предыдущий', () => { /* октябрь → сентябрь целиком */ });

it.each([['520', 520], ['12,5', 12.5], ['1 250,40', 1250.4], ['0', 0]])('parsePrice(%s) = %s', (raw, v) => {
  expect(parsePrice(raw)).toEqual({ kind: 'ok', value: v });
});
it.each(['abc', '-3', '1e30', '9999999999.999', '12,5,1'])('parsePrice(%s) невалидно', (raw) => {
  expect(parsePrice(raw)).toEqual({ kind: 'invalid' });
});
it.each(['', '   '])('parsePrice(%p) пусто', (raw) => { expect(parsePrice(raw)).toEqual({ kind: 'empty' }); });

it('chunk: 401 элемент по 200 → 200, 200, 1', () => {
  expect(chunk(Array.from({ length: 401 }, (_, i) => i), 200).map((c) => c.length)).toEqual([200, 200, 1]);
});
it('chunk([]) → []', () => { expect(chunk([], 200)).toEqual([]); });

// view.spec.ts
it('bucketsView склеивает подписи периода с цифрами по индексу', () => {
  // неделя, 7 корзин API; у третьей revenue 5000 → view[2].revenue 5000, view[2].label — «ср»
});
it('bucketsView бросает ошибку при несовпадении числа корзин', () => {
  expect(() => bucketsView(week, apiBuckets.slice(1))).toThrow(/корзин/);
});
it('breakdownView(parts): значения, производитель в sub, без ссылки', () => {
  // { name:'Фильтр', manufacturer:'Mann', unit:'pcs', qty:3, revenue:2850, cost:1560, markup:1290, markup_pct:0.827, unknown_count:1 }
  expect(row).toMatchObject({ name: 'Фильтр', sub: 'Mann', vals: [3, 2850, 1560, 1290, 0.827], unknown: 1 });
  expect(row.href).toBeUndefined();
});
it('breakdownView(parts): cost null остаётся null, а 0 остаётся 0', () => {});
it('breakdownView(clients): ссылка на карточку и дата последнего наряда', () => {
  expect(row.href).toBe('/clients/c1');
  expect(row.sub).toMatch(/MINI Cooper · F56 · закрыт 11 нояб/);
});
it('breakdownView сохраняет сортировку по умолчанию прототипа', () => {
  expect([breakdownView('labor', bd).defaultSort, breakdownView('parts', bd).defaultSort,
    breakdownView('vehicles', bd).defaultSort, breakdownView('clients', bd).defaultSort]).toEqual([2, 3, 2, 1]);
});
it('пустой ответ → пустые rows, колонки на месте', () => {});
```

- [ ] **Step 2:** Run `cd client && npx vitest run src/features/analytics` — Expected: FAIL (модули не найдены).
- [ ] **Step 3:** Реализовать `query.ts` и `view.ts`. `analytics.ts` в этой задаче не трогать, кроме добавления `href?: string` в `BreakdownRow`.
- [ ] **Step 4:** Run `cd client && npm run typecheck && npm run lint && npm test` — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(analytics): параметры запроса и преобразование ответа API в вид экрана`

---

### Task 3: Модалка дозаполнения закупки на API

**Files:**
- Modify: `client/src/features/analytics/CostFillModal.tsx`, `client/src/features/analytics/AnalyticsPage.tsx` (только пропсы модалки), `client/src/features/analytics/analytics.css`

**Interfaces:**
- Consumes: `api.analyticsMissingCosts`, `api.setPartCosts` (Task 1); `parsePrice`, `chunk`, `COSTS_CHUNK` (Task 2); `unitLabel` (Task 2).
- Produces:

```tsx
export function CostFillModal(props: {
  open: boolean;
  range: { from: string; to: string };   // ISO-границы текущего периода
  onClose: () => void;
}): JSX.Element
```
  Модалка сама грузит строки и сама сохраняет; после успеха вызывает `qc.invalidateQueries({ queryKey: ['analytics'] })`. Ключ её запроса — `['analytics', 'missing', from, to]`, `enabled: open`.

Поведение:
- Строка: название · производитель; под ним `№ <doc_number> · <d MMM> · <vehicle> · <qty> <ед>`; «Продажа» (`net`); поле «Закупка за ед.»; справа — закупка строки (`qty × цена`) и наценка `(net − закупка) / закупка` со знаком (при закупке 0 наценка не показывается).
- Невалидный ввод: `aria-invalid="true"` на поле, строка не отправляется, «Сохранить» недоступна, пока есть невалидные.
- Сохранение: только заполненные валидные строки, пачками по `COSTS_CHUNK` последовательно; при ошибке пачки — тост с текстом ошибки, модалка остаётся открытой, уже сохранённые пачки не откатываются (после `invalidate` они исчезнут из списка).
- Состояния: загрузка — `ListSkeleton`; пусто — «Закупка указана у всех запчастей периода»; ошибка загрузки — текст + кнопка «Повторить».
- Кнопка-иконка `ExternalLink` в строке — переход в наряд `/work-orders/<work_order_id>` со `state.back`.
- В `AnalyticsPage` модалке передаётся `range` текущего периода; локальная функция `saveCosts` и проп `orders` удаляются. Страница в этой задаче ещё на демо-данных — это ожидаемо.

- [ ] **Step 1:** Переписать `CostFillModal` и вызов в `AnalyticsPage`.
- [ ] **Step 2:** Run `cd client && npm run typecheck && npm run lint && npm test` — Expected: PASS.
- [ ] **Step 3: Commit** — `feat(analytics): дозаполнение закупки через API, цена за единицу`

---

### Task 4: Экран на реальных данных

**Files:**
- Modify: `client/src/features/analytics/AnalyticsPage.tsx`, `TrendChart.tsx`, `analytics.ts`, `analytics.css`
- Delete: `client/src/features/analytics/mock.ts`
- Test: `client/src/features/analytics/analytics.spec.ts` (new)

**Interfaces:**
- Consumes: `api.analyticsSummary`; `summaryParams`; `bucketsView`, `breakdownView`, `ChartBucket`.
- Produces: `TrendChart` и `TrendTable` принимают `buckets: ChartBucket[]`. Из `analytics.ts` удаляются `inRange`, `totals`, `series`, `breakdown`, интерфейсы `Totals` и `Bucket` и импорт `MockOrder`; остаются `PeriodKind`, `PERIOD_LABEL`, `Range`, `BucketRange`, `Period`, `shift`, `spanLabel`, `periodOf`, `Comparison`, `comparisonFor`, `BreakdownKind`, `BreakdownCol`, `BreakdownRow`, `Breakdown`, `delta`, `niceScale`.

Поведение страницы:
- `useQuery({ queryKey: ['analytics', 'summary', edges.join(','), prev.from, prev.to], queryFn, placeholderData: keepPreviousData })`.
- Первая загрузка (`isLoading`): сводка, график и таблица — скелетоны на месте панелей (`Skeleton` из `components/ui.tsx`), вёрстка не прыгает.
- Смена периода (`isPlaceholderData`): панели получают `data-stale` → `opacity: 0.55`, переход по токенам `--dur`/`--ease`; управление периодом остаётся активным.
- Ошибка запроса или исключение из `bucketsView`: панель с текстом ошибки и кнопкой «Повторить» (`refetch`).
- `totals.orders === 0`: существующее пустое состояние; сводка показывает `0 ₽` / `—`, дельты — «нет данных для сравнения».
- Сводка читает поля ответа напрямую (`parts_sale`, `unknown_count`, `avg_check`); сравнение — с `previous` (при `null` дельты пустые).
- Строка таблицы с `href` — кликабельна (`role="link"`, `tabIndex=0`, Enter), переход со `state.back`; остальные строки — как сейчас.
- Бейдж «демо-данные» и связанный класс `.an-demo` удаляются.

- [ ] **Step 1: Написать падающий тест** на то, что остаётся в `analytics.ts`:

```ts
it('periodOf(week) начинается с понедельника и даёт 7 корзин', () => {});
it('periodOf(year) даёт 12 корзин-месяцев', () => {});
it('comparisonFor для идущего месяца режет прошлый до того же числа дней', () => {
  const p = periodOf('month', new Date(2026, 10, 12));
  const c = comparisonFor(p, new Date(2026, 10, 12, 15));
  expect(c.partial).toBe(true);
  expect(c.previous.to.getTime() - c.previous.from.getTime()).toBe(12 * 86_400_000);
});
it('delta: нет базы → null', () => { expect(delta(5, 0)).toBeNull(); expect(delta(5, null)).toBeNull(); });
it('niceScale(0) не даёт нулевой шаг', () => { expect(niceScale(0).step).toBeGreaterThan(0); });
it('модуль не экспортирует клиентскую агрегацию', async () => {
  const m = await import('./analytics');
  expect(Object.keys(m)).not.toEqual(expect.arrayContaining(['totals', 'series', 'breakdown', 'inRange']));
});
```

- [ ] **Step 2:** Run `cd client && npx vitest run src/features/analytics/analytics.spec.ts` — Expected: последний тест FAIL.
- [ ] **Step 3:** Переключить страницу и график на API, вычистить `analytics.ts`, удалить `mock.ts`.
- [ ] **Step 4:** Run `cd client && npm run typecheck && npm run lint && npm test && npm run build` — Expected: PASS; `grep -rn "mock" src/features/analytics` ничего не находит.
- [ ] **Step 5: Commit** — `feat(analytics): экран на данных сервера, демо-данные удалены`

---

### Task 5: Закупка в каталоге запчастей

**Files:**
- Modify: `client/src/lib/parts.ts`, `client/src/features/price-list/PartsCatalog.tsx`, `client/src/features/price-list/price-list.css`
- Test: `client/src/lib/parts.spec.ts`

**Interfaces:**
- Consumes: `canSeeAnalytics` (`lib/roles.ts`), `parsePrice` (Task 2), `PartTemplate.purchase_price` (Task 1).
- Produces:

```ts
export interface PartTemplateFields { name: string; manufacturer: string; catalog_number: string; unit: PartUnit; price: string; purchase: string }
/** Тело POST/PATCH каталога. Ключ purchase_price присутствует только у владельца и только когда задан (создание) или изменился (правка). */
export function partTemplateBody(f: PartTemplateFields, opts: { owner: boolean; initial?: PartTemplate }): Partial<PartTemplate>;
```

- [ ] **Step 1: Написать падающие тесты** (`parts.spec.ts`):

```ts
const f = { name: 'Фильтр', manufacturer: 'Mann', catalog_number: 'W712', unit: 'pcs' as const, price: '950', purchase: '520' };
it('приёмщик: ключа purchase_price нет, даже если поле заполнено', () => {
  expect(partTemplateBody(f, { owner: false })).not.toHaveProperty('purchase_price');
});
it('приёмщик правит запись с закупкой: ключа нет', () => {
  expect(partTemplateBody({ ...f, purchase: '' }, { owner: false, initial: { ...tpl, purchase_price: 520 } }))
    .not.toHaveProperty('purchase_price');
});
it('владелец создаёт: закупка числом', () => { expect(partTemplateBody(f, { owner: true }).purchase_price).toBe(520); });
it('владелец создаёт с пустой закупкой: ключа нет', () => {
  expect(partTemplateBody({ ...f, purchase: '' }, { owner: true })).not.toHaveProperty('purchase_price');
});
it('владелец не менял закупку при правке: ключа нет', () => {
  expect(partTemplateBody(f, { owner: true, initial: { ...tpl, purchase_price: 520 } })).not.toHaveProperty('purchase_price');
});
it('владелец очистил закупку при правке: null', () => {
  expect(partTemplateBody({ ...f, purchase: '' }, { owner: true, initial: { ...tpl, purchase_price: 520 } }).purchase_price).toBeNull();
});
it('закупка 0 — валидное значение, не «пусто»', () => {
  expect(partTemplateBody({ ...f, purchase: '0' }, { owner: true }).purchase_price).toBe(0);
});
it('остальные поля собираются как раньше', () => {
  expect(partTemplateBody(f, { owner: false })).toEqual({ name: 'Фильтр', manufacturer: 'Mann', catalog_number: 'W712', unit: 'pcs', default_price: 950 });
});
```
  Последний тест фиксирует нынешнее поведение формы: перед написанием сверить с текущим `onSubmit` в `PartTemplateForm` (пустые строки → `null`/пропуск) и записать в ожидание именно его.

- [ ] **Step 2:** Run `cd client && npx vitest run src/lib/parts.spec.ts` — Expected: FAIL.
- [ ] **Step 3:** Реализовать `partTemplateBody`; `PartTemplateForm` собирает тело только через неё. Владельцу — колонка «Закупка» между «Артикул» и «Цена» (`money(p.purchase_price)`, пусто → «—») и поле в форме; сетка — модификатор `.parts-grid[data-cost]` с шестой колонкой 128px и `min-width: 790px` в мобильном правиле. Невалидная закупка — `aria-invalid`, отправка блокируется. Остальным ролям вёрстка не меняется.
- [ ] **Step 4:** Run `cd client && npm run typecheck && npm run lint && npm test` — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(price-list): закупочная цена в каталоге запчастей для владельца`

---

### Task 6: Панель «Закупка» в наряде

**Files:**
- Create: `client/src/features/work-orders/part-costs.ts`, `client/src/features/work-orders/PartCostsPanel.tsx`
- Modify: `client/src/features/work-orders/WorkOrderPage.tsx` (одна вставка после секции «Запчасти»), `client/src/features/work-orders/wo.css`
- Test: `client/src/features/work-orders/part-costs.spec.ts`

**Interfaces:**
- Consumes: `api.partCosts`, `api.setPartCosts`; `parsePrice`, `unitLabel`; `partTotal` из `lib/format.ts`; `canSeeAnalytics`.
- Produces:

```ts
// part-costs.ts
export interface CostRow { id: string; name: string; manufacturer: string | null; qty: number; unit: PartUnit;
  sale: number; purchase_price: number | null; cost: number | null; markup: number | null; markup_pct: number | null }
export function costRows(lines: PartLine[], costs: PartCostRow[]): CostRow[];
export function costTotals(rows: CostRow[]): { sale: number; cost: number; markup: number; missing: number };
/** Меняется, когда меняется состав или количество строк — ключ для повторного запроса закупок. */
export function linesSignature(lines: PartLine[]): string;

// PartCostsPanel.tsx
export function PartCostsPanel(props: { workOrderId: string; lines: PartLine[] }): JSX.Element | null;
```

Правила:
- `sale` = `partTotal(line)` (сумма строки после скидки строки, до скидки наряда); `cost` = `round2(qty × purchase_price)`; `markup` = `sale − cost`; `markup_pct` = `cost > 0 ? markup / cost : null`. Строка без записи в `costs` — `purchase_price: null`.
- `costTotals` суммирует только строки с известной закупкой; `missing` — число строк без неё.
- Панель рендерится в `WorkOrderPage` только при `canSeeAnalytics(user?.role) && lines.length > 0`; запрос — `['work-order', id, 'part-costs', linesSignature(lines)]`.
- Заголовок «Закупка», подпись «видите только вы». Строка: название · производитель, кол-во, поле «за ед.», закупка строки, наценка %. Сохранение строки — по Enter или потере фокуса, только если значение изменилось и валидно; пустое поле → `null`. После успеха — обновить свой запрос и `invalidateQueries({ queryKey: ['analytics'] })`.
- Итог под строками: «Закупка / Наценка» по известным; при `missing > 0` — «без закупки: N».
- Панель активна и у закрытого наряда.
- `keepRef` страницы не затрагивается: у наряда с запчастями авто-удаление не срабатывает.

- [ ] **Step 1: Написать падающие тесты.**

```ts
it('costRows: закупка строки = qty × цена, наценка от суммы строки', () => {
  // линия: qty 2, unit_price 6900, без скидки → sale 13800; закупка за ед. 4700
  expect(row).toMatchObject({ sale: 13800, cost: 9400, markup: 4400 });
  expect(row.markup_pct).toBeCloseTo(4400 / 9400, 10);
});
it('costRows: скидка строки уменьшает sale', () => { /* 10 % → sale 12420 */ });
it('costRows: нет записи о закупке → всё null, sale на месте', () => {});
it('costRows: закупка 0 → cost 0, markup = sale, markup_pct null', () => {});
it('costRows: дробные литры не теряют копейки', () => { /* 4.7 л × 980 → cost 4606 */ });
it('costRows сохраняет порядок строк наряда', () => {});
it('costTotals считает только известные и число пропусков', () => {
  expect(costTotals(rows)).toEqual({ sale: 13800, cost: 9400, markup: 4400, missing: 1 });
});
it('linesSignature меняется при смене количества и при удалении строки, не меняется при смене цены', () => {});
```

- [ ] **Step 2:** Run `cd client && npx vitest run src/features/work-orders` — Expected: FAIL.
- [ ] **Step 3:** Реализовать `part-costs.ts`, `PartCostsPanel.tsx`, вставку в `WorkOrderPage.tsx` и стили.
- [ ] **Step 4:** Run `cd client && npm run typecheck && npm run lint && npm test` — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(work-orders): панель закупки запчастей для владельца`

---

### Task 7: Сквозные сценарии и документация

**Files:**
- Create: `client/e2e/analytics.spec.ts`
- Modify: `client/e2e/price-list.spec.ts`, `CLAUDE.md`
- Delete: `docs/prototypes/analytics/*.png` (скриншоты демо-прототипа устарели)

Образец стабов и входа — `client/e2e/price-list.spec.ts` (`addInitScript` с `crm-token`, общий `**/api/**` → `{}`, затем точные маршруты).

- [ ] **Step 1: Написать `analytics.spec.ts`** (десктопный viewport). Общий стаб `summary`: `totals.revenue 382250`, `profit 166779`, `orders 17`, `unknown_count 6`, `unknown_sale 75000`; `previous` с `revenue 402000`; корзины — по числу границ запроса (стаб считает `edges` из URL и возвращает `edges.length − 1` корзин с нулями, у пятой `revenue 43222`); `breakdown.clients` — один клиент `client_id: 'c1'`, `name: 'Тихонов Д. И.'`.

| Тест | Проверка |
|---|---|
| запрос сводки | URL содержит `edges` — список через запятую, каждая граница оканчивается на `Z`, границы строго возрастают; есть `prev_from` и `prev_to` |
| цифры с сервера | видны «382 250 ₽», «166 779 ₽», «17»; текста «демо-данные» на странице нет |
| смена периода | клик «Год» → новый запрос с 13 границами |
| пустой период | стаб с `orders: 0` → «За этот период нет закрытых нарядов»; на странице нет `NaN`, `Infinity`, `undefined` |
| ошибка | `summary` → 500 → сообщение об ошибке и кнопка «Повторить»; после клика и успешного ответа цифры появляются |
| дозаполнение | клик по бейджу «!» → запрос `missing-costs` с `from`/`to`; ввод «520» в первую строку (стаб: `part_line_id: 'pl1'`, `qty: 2`, `net: 1900`) → видно «1 040 ₽»; «Сохранить» → `PATCH` с телом ровно `{ items: [{ part_line_id: 'pl1', purchase_price: 520 }] }`; после ответа — повторный запрос `summary` |
| невалидный ввод | «abc» → поле `aria-invalid="true"`, «Сохранить» недоступна, `PATCH` не отправлен |
| переход к клиенту | вкладка «Клиенты» → клик по «Тихонов Д. И.» → URL `/clients/c1` |
| не-владелец | пользователь `master_receptionist`: пункта «Аналитика» в меню нет; переход на `/analytics` уводит на `/clients`; запросов к `/api/analytics/**` не было |

- [ ] **Step 2: Дополнить `price-list.spec.ts`:**
  - владелец: колонка «Закупка» видна, значение из стаба `purchase_price: 520` показано; правка только названия → в теле `PATCH` нет ключа `purchase_price`; правка закупки на «600» → `purchase_price: 600`;
  - `master_receptionist`: колонки «Закупка» нет; правка названия → в теле нет ключа `purchase_price`.

- [ ] **Step 3:** Run `cd client && npx playwright test --trace off` — Expected: PASS, включая прежние спеки.

- [ ] **Step 4: Обновить `CLAUDE.md`:** `features/analytics/` в структуре фронтенда (страница, `query.ts`, `view.ts`, `CostFillModal`); `PartCostsPanel` в `work-orders/`; `partTemplateBody` в `lib/parts.ts`; в «Тонкости» — «не-владелец не отправляет ключ `purchase_price` (403 даже на `null`)» и «ключ запроса закупок наряда включает `linesSignature`»; в «Состояние» — экран аналитики подключён к API; актуальные числа тестов клиента и e2e. Удалить `docs/prototypes/analytics/`.

- [ ] **Step 5: Финальная проверка**

Run: `cd client && npm run typecheck && npm run lint && npm test && npm run build && npx playwright test --trace off`
Expected: PASS.

- [ ] **Step 6: Commit** — `test(analytics): e2e экрана и закупки; docs: аналитика подключена к API`

---

## Вне этого плана

- Ссылки из строк «Работы», «Запчасти», «Машины» — в ответе нет идентификаторов сущностей; потребует доработки бэкенда.
- Закупка в форме добавления строки запчасти наряда (сейчас снимок берётся из каталога автоматически, правка — в панели «Закупка»).
- Сквозная проверка на живом бэкенде с реальными данными: dev-база почти пуста, для неё нужен повторный импорт клиентов.
