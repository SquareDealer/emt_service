# Бэкенд экрана «Аналитика» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дать экрану `/analytics` настоящие данные: закупочную цену запчастей, видимую только владельцу, и серверный расчёт выручки, валовой прибыли и разрезов «Что выгодно» по закрытым нарядам.

**Architecture:** Закупка — nullable-колонка `purchase_price` (за единицу) на `part_lines` и `part_templates`, объявленная `select: false`, чтобы ни один существующий ответ API её не отдал; читают её только явные запросы владельца. Новый модуль `src/analytics/`: чистый расчёт (`analytics-calc.ts`, без БД) + тонкий сервис, который грузит закрытые наряды и отдаёт агрегаты. Границы периодов и корзин графика присылает клиент готовыми ISO-инстантами — сервер не знает о часовых поясах.

**Tech Stack:** NestJS 10, TypeORM 0.3, PostgreSQL 16, Jest (чистые юниты с рукописными фейками).

**Spec:** письменной спеки нет. Источник требований — согласованный в чате дизайн и прототип: `client/src/features/analytics/analytics.ts` (формулы и формы агрегатов), `client/src/features/analytics/AnalyticsPage.tsx` (что экран показывает), `client/src/features/analytics/CostFillModal.tsx` (дозаполнение закупки). Решения, принятые сверх прототипа, перечислены в разделе «Решения» ниже.

## Решения

1. **Выручка признаётся по `closed_at`**, только `status = 'closed'`. Возвращённый из `closed` наряд из аналитики исчезает сам (у него `closed_at = null`).
2. **Сумма строки в аналитике — после всех скидок.** Скидка наряда раскладывается по строкам пропорционально их `net`, остаток копеек уходит в самую крупную строку, так что Σ строк === `total_frozen` точно.
3. **Валовая прибыль = работы + (продажа − закупка) по запчастям с известной закупкой.** Запчасть без закупки входит в выручку, но не в прибыль; считается отдельно (`unknown_sale`, `unknown_count`).
4. **Закупка хранится за единицу** (`purchase_price`), закупка строки = `round2(qty × purchase_price)`. `0` — валидная закупка (бесплатная деталь), `null` — «не указана». В прототипе модалка принимает сумму на строку — при подключении клиента её поле меняется на цену за единицу.
5. **Видит и вводит закупку только `owner`.** Попытка не-владельца передать `purchase_price` → `403`. Сервер сам копирует закупку из каталога в строку при добавлении запчасти любым пользователем (snapshot, как `rate_snapshot`) и при копировании наряда.
6. **Закупку можно менять и у закрытого наряда** — она не входит в смету и не трогает `total_frozen`.
7. **Весь `/analytics/*` — только `owner`.**
8. Объём (~300 клиентов, тысячи нарядов) позволяет грузить наряды периода в память и считать в JS; SQL-агрегации не делаем.

## Global Constraints

- Работа ведётся поверх ветки `claude/trusting-darwin-ygnzp3` (см. Task 1); её бэкенд — исходное состояние для всех задач.
- Тесты — чистые юниты с рукописными фейковыми репозиториями (`as never`), без `@nestjs/testing` и supertest. Образец: `src/work-orders/work-orders.service.spec.ts`.
- Новые сущности/миграции регистрируются **руками** в `src/data-source.ts`. `npm run migration:run` сломан — миграции накатываются на старте приложения.
- `numericTransformer` пишет `undefined → NULL` при INSERT: numeric-колонка либо nullable, либо задаётся явно. `purchase_price` — nullable.
- Имена полей API — `snake_case`; numeric отдаётся числом.
- Бизнес-логика в сервисах, контроллеры тонкие. Многострочные вставки — в `manager.transaction`.
- **Не запускать prettier.**
- Проверка после каждой задачи: `npx tsc --noEmit && npm test && npm run lint -- --max-warnings=0`.
- Ошибки пользователю — по-русски, как в остальном коде.

## Review Focus

1. **Не-владелец не должен получить `purchase_price` ни в одном ответе** — наряд, каталог запчастей, превью шаблона, связки прайса. Тест: Task 2 (сущности `select: false`), Task 3 (каталог), ручная проверка в Task 8.
2. **Правка запчасти каталога приёмщиком не должна обнулить закупку владельца** (`normalize` + `Object.assign` затирают поле). Тест: Task 3.
3. **Наряд с нулевой суммой (скидка 100 %)** — без деления на ноль, `margin = null`, все `net = 0`. Тест: Task 5.
4. **Копейки при раскладке скидки наряда** — Σ `net` строк строго равна `total_frozen`. Тест: Task 5.
5. **Кривые границы периода** — не ISO, не по возрастанию, меньше двух, больше 63 → `400`, а не пустой ответ или 500. Тест: Task 6.

---

## Структура файлов

| Файл | Ответственность |
|---|---|
| `src/migrations/1719700000000-AddPartPurchasePrice.ts` (new) | Колонки `purchase_price`, индекс по `closed_at` |
| `src/entities/part-line.entity.ts`, `part-template.entity.ts` (modify) | Поле `purchase_price`, `select: false` |
| `src/part-templates/part-templates.service.ts`, `.controller.ts` (modify) | Закупка в каталоге: чтение/запись владельцем, `purchasePrices()` |
| `src/work-orders/work-order-lines.service.ts`, `work-orders.service.ts` (modify) | Snapshot закупки в строку; перенос при копии |
| `src/analytics/analytics-calc.ts` (new) | Чистые функции: раскладка скидки, итоги, корзины, разрезы |
| `src/analytics/analytics.service.ts` (new) | Загрузка закрытых нарядов, сборка ответа, чтение/запись закупок строк |
| `src/analytics/analytics.controller.ts`, `analytics.module.ts` (new) | Маршруты `/analytics/*`, валидация, `@Roles('owner')` |

---

### Task 1: Подтянуть ветку с изменениями бэкенда

**Files:** — (слияние)

- [ ] **Step 1: Слить `origin/claude/trusting-darwin-ygnzp3` в рабочую ветку**

```bash
git fetch origin claude/trusting-darwin-ygnzp3
git merge --no-ff origin/claude/trusting-darwin-ygnzp3 -m "merge: правки прайса и UI (trusting-darwin) под бэкенд аналитики"
```
Expected: слияние без конфликтов (проверено `git merge-tree` на `523cf0f` ↔ `2017017`).

- [ ] **Step 2: Убедиться, что база зелёная**

Run: `npm ci && npx tsc --noEmit && npm test`
Expected: PASS, 188 тестов.

Run: `cd client && npm ci --replace-registry-host=registry.npmmirror.com && npm run typecheck && npm test`
Expected: PASS, 49 тестов; `/analytics` и `canSeeAnalytics` на месте.

---

### Task 2: Миграция и поле `purchase_price`

**Files:**
- Create: `src/migrations/1719700000000-AddPartPurchasePrice.ts`
- Modify: `src/entities/part-line.entity.ts`, `src/entities/part-template.entity.ts`, `src/data-source.ts`
- Test: `src/entities/purchase-price.spec.ts`

**Interfaces:**
- Produces: `PartLine.purchase_price?: number | null`, `PartTemplate.purchase_price?: number | null` — оба `select: false`. В обычных выборках свойство **отсутствует** (`undefined`); получить его можно только `qb.addSelect('<alias>.purchase_price')`.

- [ ] **Step 1: Написать падающий тест** — метаданные колонок, чтобы `select: false` нельзя было случайно снять:

```ts
import { getMetadataArgsStorage } from 'typeorm';
import { PartLine } from './part-line.entity';
import { PartTemplate } from './part-template.entity';

describe('purchase_price', () => {
  it.each([PartLine, PartTemplate])('%p: nullable numeric, скрыта из выборок по умолчанию', (target) => {
    const col = getMetadataArgsStorage().columns.find(
      (c) => c.target === target && c.propertyName === 'purchase_price',
    );
    expect(col?.options).toMatchObject({ name: 'purchase_price', type: 'numeric', nullable: true, select: false });
  });
});
```

- [ ] **Step 2:** Run `npx jest src/entities/purchase-price.spec.ts` — Expected: FAIL (`col` undefined).

- [ ] **Step 3: Добавить колонку в обе сущности**

```ts
/** Закупка за единицу. Только для владельца — select:false, см. AnalyticsService. */
@Column({
  name: 'purchase_price', type: 'numeric', precision: 12, scale: 2,
  nullable: true, select: false, transformer: numericTransformer,
})
purchase_price?: number | null;
```

- [ ] **Step 4: Миграция `AddPartPurchasePrice1719700000000`**, зарегистрировать в массиве `migrations` в `src/data-source.ts`.

`up`:
```sql
ALTER TABLE part_lines     ADD COLUMN IF NOT EXISTS purchase_price numeric(12,2);
ALTER TABLE part_templates ADD COLUMN IF NOT EXISTS purchase_price numeric(12,2);
CREATE INDEX IF NOT EXISTS idx_work_orders_closed_at ON work_orders (closed_at) WHERE status = 'closed';
```
`down`: `DROP INDEX IF EXISTS idx_work_orders_closed_at;` и `DROP COLUMN IF EXISTS purchase_price` на обеих таблицах.

- [ ] **Step 5:** Run `npx tsc --noEmit && npm test` — Expected: PASS.

- [ ] **Step 6: Commit** — `feat(db): закупочная цена запчасти (part_lines, part_templates)`

---

### Task 3: Закупка в каталоге запчастей

**Files:**
- Modify: `src/part-templates/part-templates.service.ts`, `src/part-templates/part-templates.controller.ts`
- Test: `src/part-templates/part-templates.service.spec.ts`

**Interfaces:**
- Consumes: `PartTemplate.purchase_price` (Task 2).
- Produces:
  - `findAll(q?: string, includeInactive = false, withCost = false): Promise<PartTemplate[]>` — при `withCost` добавляет `addSelect('p.purchase_price')`.
  - `findOne(id: string, withCost = false): Promise<PartTemplate>`.
  - `purchasePrices(ids: string[]): Promise<Map<string, number | null>>` — закупка по id каталога; пустой вход → пустая Map без запроса. Используется Task 4.
  - `PartTemplateInput.purchase_price?: number | null`.

- [ ] **Step 1: Написать падающие тесты** (в стиле существующей спеки; фейковый `repo` с `createQueryBuilder`, записывающим вызовы `addSelect`):

```ts
it('findAll без withCost не запрашивает закупку', async () => { /* addSelect не вызывался с 'p.purchase_price' */ });
it('findAll(…, …, true) запрашивает закупку', async () => { /* addSelect('p.purchase_price') вызван */ });
it('update без purchase_price в dto не трогает закупку', async () => {
  // строка в фейке: { id:'p1', name:'Фильтр', purchase_price: 520 }; findOne отдаёт её БЕЗ purchase_price
  await service.update('p1', { name: 'Фильтр масляный' });
  expect(saved).not.toHaveProperty('purchase_price');
});
it('update с purchase_price: null очищает закупку', async () => {
  await service.update('p1', { purchase_price: null });
  expect(saved.purchase_price).toBeNull();
});
it('create с purchase_price: 0 сохраняет ноль, а не null', async () => {
  await service.create({ name: 'Хомут', purchase_price: 0 });
  expect(saved.purchase_price).toBe(0);
});
it('purchasePrices([]) не ходит в базу и возвращает пустую Map', async () => {});
```

- [ ] **Step 2:** Run `npx jest src/part-templates` — Expected: FAIL.

- [ ] **Step 3: Реализовать в сервисе.** `normalize()` **не** возвращает `purchase_price` (иначе `Object.assign` в `update` затрёт её `null`-ом при правке приёмщиком). В `create`/`update` поле выставляется отдельно и только при `dto.purchase_price !== undefined`.

- [ ] **Step 4: Контроллер.** В оба DTO добавить `@IsOptional() @IsNumber() @Min(0) purchase_price?: number | null`. В `findAll`/`findOne` принять `@CurrentUser() user` и передать `withCost = user.role === 'owner'`. В `create`/`update`: если `dto.purchase_price !== undefined && user.role !== 'owner'` → `throw new ForbiddenException('Закупочную цену меняет только владелец')`.

- [ ] **Step 5:** Run `npx tsc --noEmit && npm test && npm run lint -- --max-warnings=0` — Expected: PASS.

- [ ] **Step 6: Commit** — `feat(part-templates): закупочная цена в каталоге, только для владельца`

---

### Task 4: Snapshot закупки в строку наряда

**Files:**
- Modify: `src/work-orders/work-order-lines.service.ts`, `src/work-orders/work-orders.service.ts`, `src/work-orders/work-orders.module.ts`
- Test: `src/work-orders/work-order-lines.service.spec.ts`, `src/work-orders/work-orders.service.spec.ts`

**Interfaces:**
- Consumes: `PartTemplatesService.purchasePrices(ids)` (Task 3).
- Produces: строка запчасти, созданная из каталога, несёт `purchase_price` каталога на момент добавления. DTO строк **не** меняются — клиент закупку в строку через `/work-orders` не передаёт.

- [ ] **Step 1: Падающие тесты.** В харнесс обеих спек добавить фейк `partTemplates = { purchasePrices: async (ids) => new Map(ids.map((id) => [id, costs[id] ?? null])) }`.

```ts
// work-order-lines.service.spec.ts
it('addPartLine с part_template_id копирует закупку из каталога', async () => {
  costs = { pt1: 520 };
  await lines.addPartLine('wo1', { name: 'Фильтр', unit_price: 950, part_template_id: 'pt1' }, owner);
  expect(parts[0].purchase_price).toBe(520);
});
it('addPartLine без part_template_id оставляет закупку null', async () => {
  await lines.addPartLine('wo1', { name: 'Хомут', unit_price: 100 }, owner);
  expect(parts[0].purchase_price).toBeNull();
});
it('applyTemplate копирует закупку каждой выбранной запчасти одним запросом', async () => {
  // шаблон с двумя запчастями pt1 (520) и pt2 (нет закупки)
  expect(parts.map((p) => p.purchase_price)).toEqual([520, null]);
  expect(purchasePricesCalls).toBe(1);
});
it('закупка копируется и когда добавляет мастер', async () => { /* viewer.role = 'master' → 520 */ });

// work-orders.service.spec.ts
it('duplicate переносит закупку строк', async () => {
  // у исходной строки в фейке purchase_price: 5200, но loadFull её не отдаёт
  expect(copiedParts[0].purchase_price).toBe(5200);
});
```

- [ ] **Step 2:** Run `npx jest src/work-orders` — Expected: FAIL.

- [ ] **Step 3: Реализовать.**
  - `WorkOrdersModule`: импортировать `PartTemplatesModule`; инжектить `PartTemplatesService` в `WorkOrderLinesService`.
  - `addPartLine`: `purchase_price: dto.part_template_id ? (await purchasePrices([id])).get(id) ?? null : null`.
  - `applyTemplate`: один вызов `purchasePrices(chosen.map((p) => p.part_template_id))` до транзакции.
  - `WorkOrdersService.duplicate`: `loadFull` закупку не отдаёт, поэтому до транзакции отдельным запросом получить её для строк источника —
    `partRepo.createQueryBuilder('p').select(['p.id']).addSelect('p.purchase_price').where('p.work_order_id = :id', { id }).getMany()` — и подставить по `part.id`.

- [ ] **Step 4:** Run `npx tsc --noEmit && npm test && npm run lint -- --max-warnings=0` — Expected: PASS.

- [ ] **Step 5: Commit** — `feat(work-orders): снимок закупки из каталога в строку, перенос при копии`

---

### Task 5: Чистый расчёт аналитики

**Files:**
- Create: `src/analytics/analytics-calc.ts`
- Test: `src/analytics/analytics-calc.spec.ts`

**Interfaces:**
- Consumes: `PricingService` (как есть), `vehicleLabelOr` из `src/common/vehicle-label.util.ts`.
- Produces (всё экспортируется из `analytics-calc.ts`):

```ts
export interface AnalyticsLabor { key: string; name: string; hours: number; net: number }
export interface AnalyticsPart {
  id: string; key: string; name: string; manufacturer: string | null;
  qty: number; unit: 'pcs' | 'l'; net: number; cost: number | null;
}
export interface AnalyticsOrder {
  id: string; doc_number: number | null; closed_at: Date; total: number; discounts: number;
  client: { id: string; name: string }; vehicle: string;
  labor: AnalyticsLabor[]; parts: AnalyticsPart[];
}
export interface Totals {
  orders: number; hours: number; revenue: number; labor: number;
  parts_sale: number; parts_cost: number; markup: number;
  unknown_sale: number; unknown_count: number; discounts: number;
  profit: number; margin: number | null; avg_check: number | null;
}
export interface Bucket {
  from: string; to: string; orders: number;
  labor: number; markup: number; cost: number; unknown: number; revenue: number; profit: number;
}
export interface LaborRow { key: string; name: string; count: number; hours: number; revenue: number; per_hour: number | null }
export interface PartRow {
  key: string; name: string; manufacturer: string | null; unit: 'pcs' | 'l'; qty: number;
  revenue: number; cost: number | null; markup: number | null; markup_pct: number | null; unknown_count: number;
}
export interface VehicleRow {
  key: string; name: string; orders: number; revenue: number; profit: number;
  margin: number | null; avg_check: number | null; unknown_count: number;
}
export interface ClientRow extends Omit<VehicleRow, 'key'> { client_id: string; vehicle: string; last_closed_at: string }
export interface Breakdown { labor: LaborRow[]; parts: PartRow[]; vehicles: VehicleRow[]; clients: ClientRow[] }

export function toAnalyticsOrder(wo: WorkOrder, pricing: PricingService): AnalyticsOrder;
export function totals(orders: AnalyticsOrder[]): Totals;
export function buckets(orders: AnalyticsOrder[], edges: Date[]): Bucket[];
export function breakdown(orders: AnalyticsOrder[]): Breakdown;
```

Правила, которые тесты не определяют сами:
- `toAnalyticsOrder`: `lineNet` = `pricing.laborLineTotal` / `pricing.partLineTotal`; `S` = Σ `lineNet`; `T` = `wo.total_frozen ?? pricing.computeTotal(...)`. При `S <= 0` все `net = 0`. Иначе `net = round2(lineNet × T / S)`, затем `T − Σ net` прибавляется к строке с наибольшим `net`. `discounts = round2(pricing.grossTotal(...) − T)`. `cost = purchase_price == null ? null : round2(qty × purchase_price)`. `hours = line.hours ?? 0`.
- Ключи группировки: работа — `template_id ?? 'name:' + name.trim().toLowerCase()`; запчасть — `part_template_id ?? 'name:' + (name + '|' + (manufacturer ?? '')).trim().toLowerCase()`; машина — `vehicleLabelOr(wo.vehicle)`; клиент — `client.id`. Отображаемое имя группы — из строки самого позднего наряда.
- `ClientRow.vehicle` — машина последнего закрытого наряда клиента.
- Все денежные значения на выходе — `round2`. `margin`, `markup_pct` — доли (0…1) без округления.
- `buckets`: корзина `i` — полуинтервал `[edges[i], edges[i+1])`; `from`/`to` — `toISOString()`.
- Формулы `Totals` — как в прототипе `client/src/features/analytics/analytics.ts::totals` (`revenue = labor + parts_sale + unknown_sale`, `profit = labor + markup`, `margin = revenue > 0 ? profit / revenue : null`, `avg_check = orders > 0 ? revenue / orders : null`).

- [ ] **Step 1: Написать падающие тесты.** Фабрики `wo()`/`labor()`/`part()` — как в `work-orders.service.spec.ts`; `PricingService` настоящий.

```ts
describe('toAnalyticsOrder', () => {
  it('без скидок: net строк = суммам строк, cost = qty × purchase_price', () => {
    // работа 2 ч × 2500; запчасть 2 шт × 6900, purchase_price 4700; total_frozen 18800
    expect(o.labor[0].net).toBe(5000);
    expect(o.parts[0]).toMatchObject({ net: 13800, cost: 9400 });
    expect(o.discounts).toBe(0);
  });
  it('скидка наряда 10 % раскладывается пропорционально', () => {
    // те же строки, discount percent 10, total_frozen 16920
    expect(o.labor[0].net).toBe(4500);
    expect(o.parts[0].net).toBe(12420);
    expect(o.discounts).toBe(1880);
  });
  it('копейки: сумма net строго равна total_frozen', () => {
    // три работы по 333.33, фиксированная скидка наряда 100 → total_frozen 899.99
    const sum = o.labor.reduce((s, l) => s + Math.round(l.net * 100), 0);
    expect(sum).toBe(89999);
  });
  it('скидка 100 %: все net = 0, без NaN', () => {
    expect(o.labor[0].net).toBe(0);
    expect(o.total).toBe(0);
  });
  it('purchase_price 0 — закупка известна и равна нулю', () => { expect(o.parts[0].cost).toBe(0); });
  it('purchase_price отсутствует — cost null', () => { expect(o.parts[0].cost).toBeNull(); });
  it('работа без часов (только price_override) даёт hours 0', () => { expect(o.labor[0].hours).toBe(0); });
});

describe('totals', () => {
  it('запчасть без закупки входит в выручку, но не в прибыль', () => {
    // работа 5000; запчасть A net 13800 cost 9400; запчасть B net 1600 cost null
    expect(t).toMatchObject({
      revenue: 20400, labor: 5000, parts_sale: 13800, parts_cost: 9400, markup: 4400,
      unknown_sale: 1600, unknown_count: 1, profit: 9400, avg_check: 20400,
    });
    expect(t.margin).toBeCloseTo(9400 / 20400, 10);
  });
  it('пустой список: нули, margin и avg_check null', () => {
    expect(totals([])).toMatchObject({ orders: 0, revenue: 0, margin: null, avg_check: null });
  });
});

describe('buckets', () => {
  it('наряд ровно на границе попадает в следующую корзину', () => {
    // edges: 01.11, 02.11, 03.11 (ISO); наряд closed_at = 02.11T00:00:00Z
    expect(b.map((x) => x.orders)).toEqual([0, 1]);
  });
  it('корзина без нарядов отдаётся нулями, а не пропускается', () => { expect(b).toHaveLength(2); });
});

describe('breakdown', () => {
  it('работы группируются по template_id, даже если имя правили', () => { expect(bd.labor).toHaveLength(1); });
  it('ручные работы группируются по имени без учёта регистра и пробелов', () => {});
  it('per_hour = revenue / hours, null при нуле часов', () => {});
  it('запчасти: markup и markup_pct считаются только по строкам с закупкой', () => {
    // 2 строки одной позиции: net 950 cost 520; net 1000 cost null
    expect(row).toMatchObject({ revenue: 1950, cost: 520, markup: 430, unknown_count: 1 });
    expect(row.markup_pct).toBeCloseTo(430 / 520, 10);
  });
  it('клиенты: last_closed_at и vehicle берутся из последнего наряда', () => {});
  it('машины группируются по подписи vehicleLabelOr', () => {});
});
```

- [ ] **Step 2:** Run `npx jest src/analytics/analytics-calc.spec.ts` — Expected: FAIL (модуль не найден).

- [ ] **Step 3: Реализовать `analytics-calc.ts`** по интерфейсам и правилам выше. Чистые функции, без `@Injectable`.

- [ ] **Step 4:** Run `npx jest src/analytics` — Expected: PASS.

- [ ] **Step 5: Commit** — `feat(analytics): чистый расчёт выручки, прибыли и разрезов`

---

### Task 6: Сервис и `GET /analytics/summary`

**Files:**
- Create: `src/analytics/analytics.service.ts`, `src/analytics/analytics.controller.ts`, `src/analytics/analytics.module.ts`
- Modify: `src/app.module.ts` (добавить `AnalyticsModule`)
- Test: `src/analytics/analytics.service.spec.ts`

**Interfaces:**
- Consumes: всё из Task 5; `PricingService` (экспортируется `WorkOrdersModule`).
- Produces:

```ts
export interface AnalyticsSummary {
  totals: Totals;
  previous: Totals | null;
  buckets: Bucket[];
  breakdown: Breakdown;
}
class AnalyticsService {
  summary(edges: Date[], prev: { from: Date; to: Date } | null): Promise<AnalyticsSummary>;
  /** Закрытые наряды с closed_at в [from, to), со строками и закупкой. Используется и Task 7. */
  loadClosed(from: Date, to: Date): Promise<AnalyticsOrder[]>;
}
```

`GET /analytics/summary?edges=<iso>,<iso>,…&prev_from=<iso>&prev_to=<iso>` — `@UseGuards(RolesGuard) @Roles('owner')` на всём контроллере.
- `edges` — обязательный, от 2 до 63 ISO-инстантов через запятую, строго по возрастанию. Период = `[edges[0], edges[last])`.
- `prev_from`/`prev_to` — необязательные, только парой, `prev_from < prev_to`; без них `previous: null`.
- Нарушение любого правила → `400` с сообщением, называющим параметр.

- [ ] **Step 1: Падающие тесты сервиса.** Фейковый `repo.createQueryBuilder` — цепочка, записывающая `where`/`andWhere`/`addSelect` и отдающая заданные наряды из `getMany`.

```ts
it('loadClosed берёт только closed в полуинтервале и явно выбирает закупку', async () => {
  await service.loadClosed(new Date('2026-11-01T00:00:00Z'), new Date('2026-12-01T00:00:00Z'));
  expect(calls.addSelect).toContain('part.purchase_price');
  expect(calls.where.join(' ')).toMatch(/wo\.status = 'closed'|wo\.status = :status/);
  expect(calls.params).toMatchObject({ from: new Date('2026-11-01T00:00:00Z'), to: new Date('2026-12-01T00:00:00Z') });
});
it('summary делит наряды на текущий и прошлый период', async () => {
  // 2 наряда в ноябре, 1 в октябре; edges = [01.11, 01.12]; prev = октябрь
  expect(s.totals.orders).toBe(2);
  expect(s.previous?.orders).toBe(1);
  expect(s.buckets).toHaveLength(1);
});
it('summary без prev отдаёт previous: null и не расширяет выборку', async () => {});
it('breakdown строится только по текущему периоду', async () => {});
```

Тесты разбора параметров (чистая функция `parseEdges(raw: string | undefined): Date[]`, экспорт из контроллера):

```ts
it.each([undefined, '', '2026-11-01T00:00:00Z'])('меньше двух границ → 400: %p', …);
it('не ISO → 400', () => expect(() => parseEdges('вчера,сегодня')).toThrow(BadRequestException));
it('не по возрастанию → 400', …);
it('равные соседние границы → 400', …);
it('64 границы → 400', …);
it('63 границы проходят', …);
```

- [ ] **Step 2:** Run `npx jest src/analytics` — Expected: FAIL.

- [ ] **Step 3: Реализовать.**
  - `loadClosed`: `repo.createQueryBuilder('wo')` + `leftJoinAndSelect` `labor_lines`→`labor`, `part_lines`→`part`, `vehicle`, `vehicle.client`→`client`; `.addSelect('part.purchase_price')`; `where status = 'closed' AND closed_at >= :from AND closed_at < :to`; результат через `toAnalyticsOrder`. Скоупинг по мастеру не нужен — маршрут только для владельца.
  - `summary`: одна выборка на объединённый интервал `[min(edges[0], prev.from), max(edges[last], prev.to))`, деление на текущий/прошлый в памяти.
  - `AnalyticsModule`: `TypeOrmModule.forFeature([WorkOrder, PartLine])`, импорт `WorkOrdersModule` ради `PricingService`.

- [ ] **Step 4:** Run `npx tsc --noEmit && npm test && npm run lint -- --max-warnings=0` — Expected: PASS.

- [ ] **Step 5: Commit** — `feat(analytics): GET /analytics/summary для владельца`

---

### Task 7: Дозаполнение закупки

**Files:**
- Modify: `src/analytics/analytics.service.ts`, `src/analytics/analytics.controller.ts`
- Test: `src/analytics/analytics.service.spec.ts`

**Interfaces:**
- Consumes: `AnalyticsService.loadClosed` (Task 6).
- Produces:

```ts
export interface MissingCostRow {
  part_line_id: string; work_order_id: string; doc_number: number | null; closed_at: string;
  vehicle: string; client: string; name: string; manufacturer: string | null;
  qty: number; unit: 'pcs' | 'l'; net: number;
}
export interface PartCostRow { part_line_id: string; name: string; manufacturer: string | null; qty: number; unit: 'pcs' | 'l'; purchase_price: number | null }

missingCosts(from: Date, to: Date): Promise<MissingCostRow[]>;                 // новые сверху
partCosts(workOrderId: string): Promise<PartCostRow[]>;                        // 404, если наряда нет
setPartCosts(items: { part_line_id: string; purchase_price: number | null }[]): Promise<{ updated: number }>;
```

Маршруты (все `owner`):
- `GET /analytics/missing-costs?from=<iso>&to=<iso>` — запчасти закрытых нарядов периода без закупки.
- `GET /analytics/part-costs/:workOrderId` — закупки всех запчастей одного наряда (любой статус), чтобы владелец мог поправить уже введённое.
- `PATCH /analytics/part-costs` — тело `{ items: [{ part_line_id: uuid, purchase_price: number ≥ 0 | null }] }`, от 1 до 200 элементов, `@ValidateNested({ each: true })`.

- [ ] **Step 1: Падающие тесты.**

```ts
it('missingCosts отдаёт только строки с cost null, новые сверху', async () => {
  // наряд 10.11 (запчасть без закупки) и 05.11 (одна с закупкой, одна без)
  expect(rows.map((r) => r.doc_number)).toEqual([1541, 1539]);
});
it('missingCosts отдаёт net после скидок, а не qty × unit_price', async () => {});
it('setPartCosts пишет все строки в одной транзакции', async () => {
  await service.setPartCosts([{ part_line_id: 'a', purchase_price: 5200 }, { part_line_id: 'b', purchase_price: 0 }]);
  expect(transactions).toBe(1);
  expect(updates).toEqual([['a', { purchase_price: 5200 }], ['b', { purchase_price: 0 }]]);
});
it('setPartCosts: неизвестный part_line_id → 404, ни одна строка не записана', async () => {
  await expect(service.setPartCosts([{ part_line_id: 'a', purchase_price: 1 }, { part_line_id: 'нет', purchase_price: 1 }]))
    .rejects.toBeInstanceOf(NotFoundException);
  expect(updates).toEqual([]);
});
it('setPartCosts работает для строки закрытого наряда и не меняет total_frozen', async () => {});
it('setPartCosts(null) очищает закупку', async () => {});
it('partCosts для несуществующего наряда → 404', async () => {});
```

- [ ] **Step 2:** Run `npx jest src/analytics` — Expected: FAIL.

- [ ] **Step 3: Реализовать.** `setPartCosts`: сначала проверить, что все id существуют (`partRepo.find({ where: { id: In(ids) }, select: { id: true } })`), затем `partRepo.manager.transaction` с `m.update(PartLine, id, { purchase_price })` по каждой строке. Запись идёт мимо `assertOpen` намеренно — закупка не часть сметы.

- [ ] **Step 4:** Run `npx tsc --noEmit && npm test && npm run lint -- --max-warnings=0 && npm run build` — Expected: PASS.

- [ ] **Step 5: Commit** — `feat(analytics): список и запись закупок запчастей`

---

### Task 8: Проверка на живой базе и документация

**Files:**
- Modify: `CLAUDE.md`, `checks.md`

Юниты на фейках не видят двух вещей: что `select: false` действительно прячет колонку в реальных выборках, и что `save()` частично загруженной сущности не обнуляет её. Проверяются руками.

- [ ] **Step 1: Поднять стенд**

```bash
docker compose up -d && npm run build && node dist/main.js
```
Expected: в логе применена миграция `AddPartPurchasePrice1719700000000`.

- [ ] **Step 2: Сценарий через Node `fetch`** (на хосте нет `psql`/`jq`; для SQL — `docker exec tatarin_pg psql -U crm -d tatarin_crm`). Завести приёмщика и мастера в `/users`, затем проверить по порядку:

| # | Действие | Ожидание |
|---|---|---|
| 1 | owner: `POST /part-templates` с `purchase_price: 520` | в ответе `purchase_price: 520` |
| 2 | приёмщик: `GET /part-templates` | ни в одном элементе нет ключа `purchase_price` |
| 3 | приёмщик: `PATCH /part-templates/:id` `{ "name": "Фильтр масляный" }` | 200; в БД `purchase_price` по-прежнему `520.00` |
| 4 | приёмщик: `PATCH /part-templates/:id` `{ "purchase_price": 1 }` | 403 |
| 5 | мастер: добавить в свой наряд запчасть с `part_template_id` | в ответе наряда нет `purchase_price`; в БД у строки `520.00` |
| 6 | мастер: `PATCH /work-orders/:id/parts/:lineId` `{ "qty": 2 }` | в БД `purchase_price` у строки всё ещё `520.00` |
| 7 | owner: `GET /work-orders/:id`, `GET /work-orders/:id/template-preview`, `GET /price-list/:tpl/parts` | ключа `purchase_price` нет нигде |
| 8 | owner: закрыть наряд; `GET /analytics/summary?edges=<начало месяца>,<начало следующего>` | `totals.orders = 1`, `parts_cost = 1040`, `unknown_count = 0` |
| 9 | owner: `POST /work-orders/:id/duplicate` | в БД у строки копии `purchase_price = 520.00` |
| 10 | owner: `PATCH /analytics/part-costs` для строки закрытого наряда | 200 `{ updated: 1 }`; `total_frozen` наряда не изменился |
| 11 | приёмщик и мастер: `GET /analytics/summary?...` | 403 |
| 12 | owner: `GET /analytics/summary?edges=2026-12-01T00:00:00Z,2026-11-01T00:00:00Z` | 400 |
| 13 | owner: вернуть наряд из `closed` в `done`, повторить п. 8 | `totals.orders = 0` |

Если п. 3 или п. 6 показали `NULL` в БД — `save()` затирает скрытую колонку: заменить в затронутых методах `repo.save(entity)` на `repo.update(id, patch)` только изменённых полей и добавить юнит-тест на состав `patch`.

- [ ] **Step 3: Обновить `CLAUDE.md`:** миграция `1719700000000 AddPartPurchasePrice`; модуль `analytics/` в структуре `src/`; маршруты `/analytics/summary`, `/analytics/missing-costs`, `/analytics/part-costs`; инвариант «`purchase_price` — `select: false`, только `addSelect`, только владелец; `normalize()` каталога её не трогает»; актуальное число тестов бэкенда. В `checks.md` — сценарий из Step 2 как AC-11.

- [ ] **Step 4: Финальная проверка**

Run: `npx tsc --noEmit && npm test && npm run lint -- --max-warnings=0 && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit** — `docs: аналитика и закупочная цена в CLAUDE.md и checks.md`

---

## Вне этого плана

Подключение клиента — отдельный план после приёмки бэкенда: заменить `client/src/features/analytics/mock.ts` запросами (`api.analyticsSummary`, `missingCosts`, `setPartCosts`), перевести `CostFillModal` на цену за единицу, добавить поле «Закупка» владельцу в `PartsCatalog` и в строку запчасти `WorkOrderPage` (через `GET /analytics/part-costs/:workOrderId`), ссылки из строк таблиц в наряды и карточки клиентов.
