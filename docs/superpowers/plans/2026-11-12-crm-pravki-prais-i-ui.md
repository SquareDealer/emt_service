# Правки CRM: история клиента, доска, PDF, прайс-лист — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Девять правок заказчика: живая «История» клиента, лимит колонки «Выдана», калькуляция до закрытия наряда, центрированный логотип, редактирование каталога запчастей и работ, выбор поколения при добавлении работы из прайса, удобный подбор запчастей.

**Architecture:** Модель данных не меняется, миграций нет. Каталог работ остаётся общим, «работа для поколения» = общий шаблон + переопределение цены (`template_generation_prices`). Новая логика — в сервисах (`ClientsService`, `WorkOrdersService`, `PriceListService`, `WorkOrderLinesService`), на клиенте — чистые хелперы в `client/src/lib/` плюс новые компоненты-модалки.

**Tech Stack:** NestJS 10 + TypeORM 0.3, pdfmake; Vite + React 18 + TanStack Query; jest, vitest, Playwright (API застаблен).

**Spec:** раздел «Требования заказчика» ниже (дословно из запроса) + `CLAUDE.md`, `DESIGN.md`.

## Требования заказчика

1. Клиенты, `list-row client-row`: «История» = количество закрытых сделок клиента, а не только импорт из Excel.
2. Доска: в колонке «Выдана» только 10 последних работ.
3. Прайс-лист: поправить отступы у галочек у input-полей.
4. PDF заказ-наряда: логотип EMT-service по центру.
5. «Сгенерировать отчёт» → «Предварительная калькуляция (PDF)»; обе PDF-кнопки доступны до закрытия наряда.
6. `panel summary-panel`: кнопка «Слот» по высоте как input.
7. Прайс-лист → Запчасти: редактирование добавленных запчастей; верх-низ паддинги у `.seg`.
8. Прайс-лист → Работы: добавлять и редактировать работы для поколения; удобный менеджмент поколений и добавления в них работ; при добавлении работы из прайса в заказ-наряде выбирается поколение — в модалке с поиском и менеджментом поколений. **Субагент A.**
9. Модалка запчастей работы: padding у заголовков `text-sm fw-500`.
   9.1. По клику в `cell-input` разворачиваются все запчасти прайса; удобный поиск с простыми фильтрами. **Субагент B.**

**Принятые трактовки** (заказчик может поправить до начала работ):
- п.1: «История» = импорт + закрытые в CRM (`imported_deals_* + closed_orders_*`), иначе у старых клиентов история обнулится.
- п.3: «галочки» = стрелки `<select>` (нативная стрелка прижата к краю у `select.input` и `.unit-select`).
- п.8: каталог работ остаётся общим для всех поколений (инвариант из `CLAUDE.md`); «добавить работу в поколение» создаёт работу и сразу задаёт её цену для выбранного поколения. Отдельной видимости «работа только у R56» нет — вместо неё фильтр «Со своей ценой».
- п.4: центрируется логотип только в заказ-наряде; шапка калькуляции (образец `Васильев.pdf`) не трогается.

## Global Constraints

- Не запускать prettier. Иконки только lucide. Модалки — `Modal` из `components/ui.tsx` (`<dialog>`).
- Бизнес-логика в сервисах, контроллеры тонкие. Запись в каталоги — `@Roles('owner','master_receptionist')`.
- Тесты backend — чистые юниты с рукописными фейками (`as never`), без `@nestjs/testing`.
- Многострочные вставки — в `manager.transaction`. Очистка nullable-поля — `null`, не `undefined`.
- Деньги/артикулы — `mono tnum`. Токены только из `client/src/index.css`, без новых цветов.
- Мобильная вёрстка: интерактивные элементы ≥ 44px (`--touch-target`) — `client/e2e/mobile.spec.ts` это проверяет.
- Исполнители: задачи 1–7 и 11 — основная сессия; **задачи 8–9 — субагент A**, **задача 10 — субагент B**. A и B не трогают одни файлы (у каждого свой CSS-файл), могут идти параллельно после задачи 7.
- Проверка перед каждым коммитом:
  `npx tsc --noEmit && npm test && npm run lint -- --max-warnings=0` (backend),
  `cd client && npm run typecheck && npm run lint && npm test` (client).

## Review Focus

1. **Калькуляция по открытому наряду с пустой сметой** — PDF строится, номер документа не расходуется, дата = сегодня (тест в задаче 3).
2. **Клиент с импортной историей и закрытыми нарядами в CRM** — суммируются оба источника; `count`/`sum` из Postgres приходят строками и не должны склеиваться (`"2" + 3`) (тест в задаче 1).
3. **Одиннадцатый наряд перетащили в «Выдана»** — самый старый уходит из колонки и на клиенте (оптимистично), и на сервере; остальные колонки не обрезаются (тесты в задаче 2).
4. **Машина без поколения или с поколением, убранным из справочника** — модалка прайса в наряде открывается на «Базовые цены» / на поколении машины, явный выбор «базовые» не подменяется поколением машины (тесты в задаче 8).
5. **Каталог больше 100 запчастей** — подбор запчасти находит позицию из «хвоста»; очистка цены при правке шлёт `null`, а не `0` (тесты в задачах 6 и 10).

---

### Task 1: «История» клиента считает закрытые наряды

**Files:**
- Modify: `src/clients/clients.service.ts`, `src/clients/clients.service.spec.ts`
- Modify: `client/src/lib/types.ts` (`Client`), `client/src/lib/format.ts`, `client/src/lib/format.spec.ts`
- Modify: `client/src/features/clients/ClientsPage.tsx:41-51,97,147-155`, `client/src/features/clients/ClientCardPage.tsx:127-139`
- Modify: `client/src/features/work-orders/WorkOrderPage.tsx` (`mClose`, `mUpdate`), `client/src/features/board/BoardPage.tsx` (`mStatus`)

**Interfaces:**
- Produces (backend): `type ClientWithDeals = Client & { closed_orders_count: number; closed_orders_sum: number }`; `findAll(): Promise<ClientWithDeals[]>`, `findOne(id): Promise<ClientWithDeals>`.
- Produces (client): `clientDeals(c: Pick<Client,'imported_deals_count'|'imported_deals_sum'|'closed_orders_count'|'closed_orders_sum'>): { count: number; sum: number }` в `lib/format.ts`.

- [ ] **Step 1: Падающий тест сервиса** — в `clients.service.spec.ts`, фейковый `repo.manager.createQueryBuilder` с цепочкой, `getRawMany` отдаёт строки как pg:

```ts
it('adds closed-order stats to every client, coercing pg strings', async () => {
  // find → [{id:'c1', imported_deals_count: 2, imported_deals_sum: 1000}, {id:'c2', ...0}]
  // getRawMany → [{ client_id: 'c1', count: '3', sum: '4500.50' }]
  const list = await svc.findAll();
  expect(list[0]).toMatchObject({ id: 'c1', closed_orders_count: 3, closed_orders_sum: 4500.5 });
  expect(list[1]).toMatchObject({ id: 'c2', closed_orders_count: 0, closed_orders_sum: 0 });
});
it('findOne carries the same stats', ...);   // closed_orders_count: 3
it('update() does not persist the computed fields', ...); // save получил объект без closed_orders_*
```

- [ ] **Step 2:** `npx jest src/clients/clients.service.spec.ts` → FAIL.
- [ ] **Step 3: Реализация.** Приватный `closedStats(clientId?: string): Promise<Map<string, { count: number; sum: number }>>`:
  `manager.createQueryBuilder(WorkOrder,'wo').innerJoin(Vehicle,'v','v.id = wo.vehicle_id').select('v.client_id','client_id').addSelect('COUNT(*)','count').addSelect('COALESCE(SUM(COALESCE(wo.total_frozen, wo.total_cached)),0)','sum').where("wo.status = 'closed'").groupBy('v.client_id')` (+ `andWhere('v.client_id = :clientId')` при аргументе). `update()` и `remove()` читают сущность через приватный `load(id)` без статистики. Счёт не скоупится по роли — это агрегат по клиенту, не доступ к наряду.
- [ ] **Step 4:** jest → PASS.
- [ ] **Step 5: Падающий vitest** в `format.spec.ts`:

```ts
expect(clientDeals({ imported_deals_count: 2, imported_deals_sum: 1000, closed_orders_count: 3, closed_orders_sum: 4500.5 }))
  .toEqual({ count: 5, sum: 5500.5 });
expect(clientDeals({ imported_deals_count: 0, imported_deals_sum: 0 } as never)).toEqual({ count: 0, sum: 0 }); // старый кэш без полей
```

- [ ] **Step 6:** Реализовать `clientDeals`; в `Client` добавить `closed_orders_count: number; closed_orders_sum: number`.
- [ ] **Step 7: UI.** `ClientsPage`: колонка и сортировка `deals_desc` считают через `clientDeals`; `title="Закрытых сделок / сумма (CRM + старая база)"`; опция сортировки — «Больше сделок». `ClientCardPage`: те же суммарные цифры, блок показывается при `count > 0`.
- [ ] **Step 8: Инвалидация.** Там, где наряд меняет статус (`mClose`, `mUpdate` при смене `status`, `mStatus` на доске) — `qc.invalidateQueries({ queryKey: ['clients'] })` (сверить ключ grep'ом по `ClientsPage`/`ClientCardPage`; у карточки ключ может быть `['client', id]` — инвалидировать оба).
- [ ] **Step 9:** полная проверка backend + client; commit `feat(clients): история считает закрытые наряды`.

---

### Task 2: Доска — в «Выдана» 10 последних

**Files:**
- Modify: `src/work-orders/work-orders.service.ts:228-244`, `src/work-orders/work-orders.service.spec.ts` (харнесс `makeQb` + новый `describe`)
- Modify: `client/src/lib/types.ts`, `client/src/lib/format.ts`, `client/src/lib/format.spec.ts`
- Modify: `client/src/features/board/BoardPage.tsx:115-119,157-174`, `client/src/features/board/board.css`

**Interfaces:**
- Produces: `export const BOARD_CLOSED_LIMIT = 10` (в `work-orders.service.ts` и зеркально в `client/src/lib/types.ts`); `capClosed<T>(items: T[], limit = BOARD_CLOSED_LIMIT): T[]` в `lib/format.ts`.

- [ ] **Step 1: Харнесс.** `makeQb` в спеке должен исполнять то, что просит запрос: `andWhere` с `wo.status = 'closed'` / `wo.status <> 'closed'` фильтрует `rows`, `orderBy('wo.closed_at','DESC',…)` сортирует, `take(n)` режет. Существующие тесты не должны измениться.
- [ ] **Step 2: Падающий тест:**

```ts
describe('WorkOrdersService.board', () => {
  it('returns only the 10 most recently closed orders, newest first', async () => {
    // 12 closed: id c1..c12, closed_at = 2026-01-01..2026-01-12; + 3 scheduled
    const b = await h.service.board(owner);
    expect(b.closed.map((w) => w.id)).toEqual(['c12','c11','c10','c9','c8','c7','c6','c5','c4','c3']);
    expect(b.scheduled).toHaveLength(3);
  });
  it('does not cap the open columns', ...); // 15 scheduled → 15
});
```

- [ ] **Step 3:** jest → FAIL.
- [ ] **Step 4: Реализация `board()`** двумя запросами через `core.scope(core.baseListQb(), viewer)`: открытые (`wo.status <> 'closed'`, прежняя сортировка) и закрытые (`wo.status = 'closed'`, `orderBy('wo.closed_at','DESC','NULLS LAST')`, `take(BOARD_CLOSED_LIMIT)`). Грузить весь архив ради десяти карточек нельзя — он растёт годами.
- [ ] **Step 5:** jest → PASS.
- [ ] **Step 6: vitest** `capClosed([1..12])` → длина 10, первые десять; `capClosed([1,2])` → `[1,2]`. Реализовать.
- [ ] **Step 7: UI.** В `onDragEnd` для `over === 'closed'`: `capClosed([moved, ...c.closed])`. Под заголовком колонки `closed` — строка `board-col-note`: «последние 10 · все — в <Link to="/archive">Архиве</Link>» (`text-xs`, `--faint`). Подзаголовок страницы не менять.
- [ ] **Step 8:** проверка; commit `feat(board): в «Выдана» только 10 последних нарядов`.

---

### Task 3: «Предварительная калькуляция (PDF)» до закрытия наряда

**Files:**
- Modify: `src/work-orders/work-orders.service.ts:54-72`, `src/work-orders/work-orders.service.spec.ts`
- Modify: `src/work-orders/pdf/work-order-pdf.service.ts:178-179,196`, `src/work-orders/pdf/work-order-pdf.service.spec.ts`
- Modify: `client/src/features/work-orders/WorkOrderPage.tsx:157-164,620-644`
- Modify: `CLAUDE.md` (строка API «`/:id/pdf` — смета, только для closed»)

**Interfaces:**
- Produces: `WorkOrderPdfService.calcTitleLine(wo: Pick<WorkOrder,'doc_number'|'closed_at'>, now?: Date): string`.

- [ ] **Step 1: Падающие тесты.**

```ts
// pdf spec
expect(svc.calcTitleLine({ doc_number: 17, closed_at: new Date('2026-03-05T10:00:00Z') })).toBe('№ 17 от 05.03.2026');
expect(svc.calcTitleLine({ doc_number: null, closed_at: null }, new Date('2026-11-12T09:00:00Z'))).toBe('от 12.11.2026');

// service spec (харнесс: pdf = { build: jest.fn(async () => Buffer.from('x')) }, settings.getDocSettings)
it('builds the calculation for an OPEN order without spending a doc number', async () => {
  const h = harness([wo({ status: 'in_progress' })]);        // смета пустая
  const r = await h.service.renderPdf('wo1', owner);
  expect(r.filename).toBe('kalkulyaciya-' + 'wo1'.slice(0, 8) + '.pdf');
  expect(h.nextvalCalls).toBe(0);
  expect(h.rows[0].doc_number ?? null).toBeNull();
});
it('still numbers a closed order lazily on first print', ...); // nextvalCalls === 1
it("404s for another master's order", ...);
```

  Формат даты — тот, что уже отдаёт приватный `dmy` (сверить и поправить ожидание под него, часовой пояс не вводить).
- [ ] **Step 2:** jest → FAIL.
- [ ] **Step 3: Реализация.** `renderPdf`: убрать `BadRequestException`; ленивое присвоение номера — только при `status === 'closed'`. В `definition()`: вторая строка заголовка = `calcTitleLine(wo)`. Инвариант «`doc_number` присваивается при заморозке» сохраняется.
- [ ] **Step 4:** jest → PASS.
- [ ] **Step 5: UI.** Кнопка калькуляции выходит из ветки `closed`: порядок в колонке — [Сохранить, Закрыть и зафиксировать] или [чип «Зафиксировано»]; затем всегда: «Копировать наряд», «Предварительная калькуляция (PDF)» (`btn-default`, `mPdf`), «Заказ-наряд (PDF)». Текст «Сгенерировать отчёт» из кода исчезает (`grep -rn "Сгенерировать отчёт" client/src` → пусто).
- [ ] **Step 6:** обновить строку в `CLAUDE.md`; проверка; commit `feat(pdf): предварительная калькуляция до закрытия наряда`.

---

### Task 4: Логотип заказ-наряда по центру

**Files:**
- Modify: `src/work-orders/pdf/work-order-pdf.service.ts:144-156,345-352`
- Test: `src/work-orders/pdf/work-order-pdf.service.spec.ts`

**Interfaces:**
- Produces: `orderHeaderColumns(logo: string | null, s: DocSettings, companyName: string): Column[]`.

- [ ] **Step 1: Падающий тест:**

```ts
const cols = svc.orderHeaderColumns('data:image/png;base64,AAAA', settings, 'EMT');
expect(cols.map((c) => (c as { width: unknown }).width)).toEqual(['*', 130, '*']);
expect(cols[1]).toMatchObject({ image: 'data:image/png;base64,AAAA', alignment: 'center' });
expect(svc.orderHeaderColumns(null, settings, 'EMT').map((c) => (c as { width: unknown }).width)).toEqual(['*', 130, '*']);
```

- [ ] **Step 2:** FAIL → **Step 3:** реализовать: `[пустая '*', логотип 130 (или пустой текст той же ширины), реквизиты '*' с выравниванием вправо]`. Две равные `'*'`-колонки по бокам — единственный способ получить геометрический центр при блоке реквизитов справа. `companyBlock` для калькуляции не менять.
- [ ] **Step 4:** PASS. Глазами: собрать PDF скриптом на `dist` (фейковый наряд → `build(wo, settings, 'order')` → файл в scratchpad), открыть, убедиться, что реквизиты не налезают на логотип при длинном адресе.
- [ ] **Step 5:** commit `fix(pdf): логотип заказ-наряда по центру`.

---

### Task 5: Мелкая вёрстка — стрелки select, «Слот», `.seg`, заголовки модалки

**Files:**
- Modify: `client/src/index.css:310-316,450-460`, `client/src/features/work-orders/wo.css:98,104`
- Modify: `client/src/features/work-orders/WorkOrderPage.tsx:1191-1201`
- Modify: `client/src/features/price-list/TemplatePartsModal.tsx:98,122`, `client/src/features/price-list/price-list.css`
- Create: `client/e2e/price-list.spec.ts`

- [ ] **Step 1: Падающий e2e** `price-list.spec.ts` (каркас стабов — как в `e2e/mobile.spec.ts`; `**/api/price-list**`, `**/api/part-templates**`, `**/api/vehicle-generations**` → массивы; десктопный viewport 1280×800):

```ts
test('select arrows are inset, seg has vertical padding', async ({ page }) => {
  await page.goto('/price-list');
  await page.getByRole('button', { name: 'Запчасти' }).click();
  const unit = page.getByLabel('Единица');
  expect(await unit.evaluate((e) => getComputedStyle(e).appearance)).toBe('none');
  expect(parseFloat(await unit.evaluate((e) => getComputedStyle(e).paddingRight))).toBeGreaterThanOrEqual(16);
  const seg = await page.locator('.seg').first().boundingBox();
  const btn = await page.locator('.seg-btn').first().boundingBox();
  expect(btn!.y - seg!.y).toBeGreaterThanOrEqual(4);
  expect(seg!.y + seg!.height - (btn!.y + btn!.height)).toBeGreaterThanOrEqual(4);
});
```

- [ ] **Step 2:** `cd client && npx playwright test e2e/price-list.spec.ts --trace off` → FAIL.
- [ ] **Step 3: CSS.**
  - `select.input` получает то же, что `.select` (appearance none, шеврон, `padding-right: var(--sp-6)`) — добавить селектор в существующее правило.
  - `.unit-select`: `appearance: none`, тот же шеврон `background-size: 12px`, `background-position: right 4px center`, `padding: 0 18px 0 6px`; `flex-basis` 40px/46px → 52px в обоих правилах `wo.css`.
  - `.seg { padding: var(--sp-1); align-items: center; }`, `.seg-btn { display: inline-flex; align-items: center; gap: var(--sp-1); }` (глобальный `svg { display: block }` сейчас ставит иконку над текстом и съедает высоту).
  - Кнопка «Слот»: убрать `btn-sm` (высота = `--control-h`, как у соседнего input).
  - Заголовки секций в `TemplatePartsModal` (`h3.text-sm.fw-500`): класс `tp-title` → `padding: var(--sp-2) var(--sp-1) var(--sp-1)`.
- [ ] **Step 4:** e2e → PASS; `npx playwright test --trace off` целиком (mobile-спека про 44px не должна упасть). Скриншоты `/price-list` (обе вкладки, светлая и тёмная тема) и панели записи в наряде — посмотреть глазами.
- [ ] **Step 5:** commit `style: стрелки select, высота «Слот», отступы seg и заголовков`.

---

### Task 6: Редактирование запчастей в каталоге

**Files:**
- Modify: `client/src/features/price-list/PartsCatalog.tsx`
- Test: `client/e2e/price-list.spec.ts`

**Interfaces:**
- Consumes: `api.updatePartTemplate(id, body)` (уже есть, `PATCH /part-templates/:id`).
- Produces: `PartTemplateForm({ initial?: PartTemplate; busy; onSubmit(body: Partial<PartTemplate>); onCancel?: () => void })` — одна форма на добавление и правку.

- [ ] **Step 1: Падающий e2e:**

```ts
test('a catalog part can be edited in place; a cleared price is sent as null', async ({ page }) => {
  // GET part-templates → [{ id:'p1', name:'Фильтр масляный', manufacturer:'MANN', catalog_number:'W712/95', unit:'pcs', default_price:900, active:true }]
  // PATCH part-templates/p1 → перехватить тело
  await page.getByRole('button', { name: 'Изменить Фильтр масляный' }).click();
  await page.getByPlaceholder('цена').first().fill('');
  await page.getByPlaceholder('MANN').first().fill('MAHLE');
  await page.keyboard.press('Enter');
  expect(patchBody).toEqual({ name:'Фильтр масляный', manufacturer:'MAHLE', catalog_number:'W712/95', unit:'pcs', default_price:null });
});
test('Escape cancels the edit without a request', ...);
```

- [ ] **Step 2:** FAIL → **Step 3:** реализация. Состояние `editingId`; строка в режиме правки рендерит `PartTemplateForm` с `initial`, кнопки «Сохранить» (lucide `Check`) и «Отмена» (`X`), Enter сохраняет, Escape отменяет. В обычной строке рядом с корзиной — `Pencil`, `aria-label={"Изменить " + p.name}`. Колонка действий `.parts-grid`: 44px → 76px. `mUpdate` → инвалидация `['part-templates']`, тост «Запчасть обновлена». Правка каталога не трогает уже добавленные строки смет (у них свои копии полей) — дописать это в подпись под таблицей.
- [ ] **Step 4:** e2e → PASS; commit `feat(price-list): редактирование запчастей каталога`.

---

### Task 7: Контрольная точка перед субагентами

- [ ] Полный прогон: backend `npx tsc --noEmit && npm test && npm run lint -- --max-warnings=0 && npm run build`; client `npm run typecheck && npm run lint && npm test && npm run build && npx playwright test --trace off`. Всё зелёное.
- [ ] `git push -u origin claude/trusting-darwin-ygnzp3`. После этого запускаются субагенты A (задачи 8–9) и B (задача 10) — параллельно, в отдельных worktree.

---

### Task 8 (субагент A): Backend — работа с ценой поколения и выбор поколения при применении

**Files:**
- Modify: `src/task-templates/price-list.service.ts`, `src/task-templates/price-list.controller.ts`
- Create: `src/task-templates/price-list.service.spec.ts`
- Modify: `src/work-orders/work-order-lines.service.ts:277-320`, `src/work-orders/work-orders.controller.ts:28-40,201-219`, `src/work-orders/work-order-lines.service.spec.ts`

**Interfaces:**
- Produces:
  - `PriceListService.createWork(input: { name: string; default_hours?: number | null; default_price?: number | null; generation_id?: string | null; hours?: number | null; price?: number | null }): Promise<TaskTemplate>` → `POST /price-list/works` (owner, master_receptionist).
  - `WorkOrderLinesService.previewTemplate(id, templateId, viewer, generationId?: string | null)`; `ApplyTemplateDto.generation_id?: string | null`.
  - Семантика `generationId` везде одна: `undefined` → поколение машины, `null` → базовые цены, uuid → это поколение.
  - HTTP: `GET /work-orders/:id/template-preview?template_id=…&generation_id=<uuid|base>` (параметр отсутствует → поколение машины; иное значение → 400); в теле `apply-template` — `generation_id: uuid | null`, отсутствует → поколение машины.

- [ ] **Step 1: Падающие тесты.**

```ts
// price-list.service.spec.ts — фейки репозиториев, manager.transaction вызывает колбэк
it('creates a work with a base price and no override', ...);          // saved template {name:'Замена свечей', default_hours:1, default_price:null}; prices.save не звался
it('creates the work and its generation price in one transaction', ...); // generation_id:'g1', hours:1.5, price:4000 → override {template_id:<new>, generation_id:'g1', hours:1.5, price:4000}; transactions === 1
it('skips the override when a generation is named but no figures given', ...);
it('rejects a blank name', ...);            // BadRequestException 'Укажите название работы'
it('rejects an unknown generation', ...);   // 'Поколение не найдено в справочнике', шаблон не создан

// work-order-lines.service.spec.ts (машина наряда: generation_id 'g-car')
it('prices by the car generation when none is passed', ...);     // resolveForLine получил 'g-car'
it('prices by an explicitly chosen generation', ...);            // previewTemplate(..., 'g-other') → 'g-other', parts — для 'g-other'
it('explicit null means base prices even for a car with a generation', ...); // → null, generation_specific у всех false
it('applyTemplate forwards generation_id to the preview', ...);
it('a car without a generation defaults to base', ...);          // vehicle.generation_id null → null
```

- [ ] **Step 2:** jest → FAIL. **Step 3:** реализовать. `createWork` — в `this.templates.manager.transaction`; `name.trim()`; переопределение создаётся только если есть `generation_id` и хотя бы одна из цифр. Разбор query-параметра — в контроллере (`'base'` → `null`, `isUUID` иначе 400).
- [ ] **Step 4:** jest → PASS; tsc, lint. Commit `feat(price-list): работа с ценой поколения, выбор поколения при применении`.

---

### Task 9 (субагент A): UI — прайс работ, менеджмент поколений, выбор работы в наряде

**Files:**
- Create: `client/src/lib/generations.ts`, `client/src/lib/generations.spec.ts`
- Create: `client/src/components/GenerationPicker.tsx`, `client/src/components/generation-picker.css`
- Create: `client/src/features/price-list/GenerationsModal.tsx`, `client/src/features/price-list/WorkFormModal.tsx`, `client/src/features/price-list/works.css`
- Create: `client/src/features/work-orders/PriceListPickerModal.tsx`
- Modify: `client/src/features/price-list/PriceListPage.tsx`, `client/src/features/work-orders/WorkOrderPage.tsx:101,391-402,671-676`, `client/src/features/work-orders/ApplyTemplateModal.tsx`, `client/src/lib/api.ts`
- Test: `client/e2e/price-list-works.spec.ts`
- Не трогать: `PartsCatalog.tsx`, `TemplatePartsModal.tsx`, `price-list.css` (зона субагента B и задач 5–6).

**Interfaces:**
- Consumes: Task 8 (HTTP), существующие `api.vehicleGenerations(all)`, `create/update/deactivateVehicleGeneration`, `api.priceList`, `setPrice`, `clearPrice`, `updateTemplate`, `deleteTemplate`.
- Produces:
  - `lib/generations.ts`: `genLabel(g: VehicleGeneration): string` (переезжает из `PriceListPage`), `groupGenerations(list: VehicleGeneration[], q: string): { make: string; items: VehicleGeneration[] }[]` — поиск без регистра по make/model/code/years, пустые группы не возвращаются, порядок внутри группы — как пришёл.
  - `api.createWork(body)`, `api.templatePreview(id, templateId, generationId?: string | null)`, `api.applyTemplate(id, { …, generation_id?: string | null })`.
  - `GenerationPicker({ value: string | null; onChange(id: string | null): void; allowBase?: boolean; onManage?: () => void })` — кнопка с текущим значением → выпадающая панель: поиск, «Базовые цены (для всех)» при `allowBase`, список по маркам, внизу «Управлять поколениями» при `onManage`.
  - `PriceListPickerModal({ open; workOrder: WorkOrder; onClose; onPick(templateId: string, generationId: string | null): void })`.
  - `ApplyTemplateModal` получает проп `generationId: string | null`.

- [ ] **Step 1: vitest** `generations.spec.ts`: `groupGenerations(list, 'r56')` → одна группа MINI с одним элементом; `''` → все, сгруппированы по `make`; поиск по годам `'2014'`; `genLabel` для `code: null`. FAIL → реализовать → PASS.
- [ ] **Step 2: Падающий e2e** `price-list-works.spec.ts` (стабы как в `mobile.spec.ts`, десктоп):

```ts
test('add a work for the selected generation', ...);
// выбрать R56 в GenerationPicker → «Добавить работу» → имя «Замена свечей», для поколения: часы 1.5, цена 4000 → «Сохранить»
// POST /api/price-list/works тело: { name:'Замена свечей', default_hours:null, default_price:null, generation_id:'g-r56', hours:1.5, price:4000 }
test('edit a work: rename + base price', ...);          // PATCH /api/task-templates/t1 { name, default_hours, default_price }
test('generations can be added and retired from the manager', ...); // POST /api/vehicle-generations {make:'BMW',model:'3',code:'E90',years:'2005–2012'}; DELETE для retire
test('work order: picking a work asks for a generation, defaulting to the car\'s', ...);
// наряд с vehicle.generation_id 'g-r56' → «Из прайса» → в пикере выбран R56 → сменить на F56 → клик по работе
// GET …/template-preview?template_id=t1&generation_id=g-f56; после «Добавить» POST apply-template с generation_id:'g-f56'
test('choosing «Базовые цены» sends generation_id=base / null', ...);
test('a car whose generation is retired still opens on that generation', ...); // пикер грузит справочник с all=1
```

- [ ] **Step 3: Реализация — что решено:**
  - **PriceListPage (вкладка «Работы»):** `<select>` поколения → `GenerationPicker allowBase onManage`; поиск по названию работы; при выбранном поколении `seg` «Все работы / Со своей ценой»; кнопка «Добавить работу» (`btn-primary`); в строке — `Pencil` → `WorkFormModal`. Пустое состояние больше не отсылает в Настройки. Инлайн-правка часов/цены в строке остаётся как есть.
  - **WorkFormModal:** поля «Название», «Базовые норм.ч.», «Базовая цена»; если выбрано поколение — блок «Для {genLabel}»: часы, цена, подпись источника. Создание — один `api.createWork`. Правка — `api.updateTemplate` + `setPrice`/`clearPrice` (clear, когда обе цифры поколения пусты и переопределение было). Пустое поле → `null`. В режиме правки — «Убрать из прайса» (`api.deleteTemplate`, это деактивация) через подтверждение. Инвалидация `['price-list']` и `['templates']`.
  - **GenerationsModal:** `api.vehicleGenerations(true)`; поиск; группы по маркам; строка: модель · код · годы, `Pencil` (инлайн-правка), «Убрать»/«Вернуть» (`deactivate` / `update({active:true})`), убранные — приглушённо в конце группы; форма добавления (марка с подсказками из существующих через `<datalist>`, модель, код, годы). Ошибки сервера («Такое поколение уже есть…») — тостом. Инвалидация `['vehicle-generations']`. Роль `master` кнопку управления не видит (хелпер ролей — в `lib/roles.ts`).
  - **WorkOrderPage:** `<select> + Из прайса…` → кнопка `btn btn-default btn-sm` «Из прайса» (вызывает `keep()` перед открытием, как сейчас). Состояние `applyTpl: { templateId: string; generationId: string | null } | null`. Запрос `['templates']` на странице больше не нужен — удалить, если других потребителей нет.
  - **PriceListPickerModal** (ширина 720): сверху `GenerationPicker allowBase` (стартовое значение `workOrder.vehicle?.generation_id ?? null`, справочник с `all=1`, `onManage` по роли) и поиск с автофокусом; список `api.priceList(generationId)`: название, норм.ч., цена, тег источника («своя / базовая / по ставке»), число запчастей; клик или Enter по строке → `onPick`. Если выбранное поколение ≠ поколению машины — строка-предупреждение «Цены для {X}, а в наряде {vehicleLabel}».
  - **ApplyTemplateModal:** ключ запроса `['template-preview', workOrderId, templateId, generationId]`; `generationId` уходит в preview и apply.
  - Вёрстка: DESIGN.md (тихо, плотно), выпадающая панель пикера не должна обрезаться `overflow` у `.panel` и у `<dialog>`; мобильные цели ≥ 44px.
- [ ] **Step 4:** e2e → PASS; `npm run typecheck && npm run lint && npm test && npx playwright test --trace off`. Скриншоты (deviceScaleFactor 2): прайс с открытым пикером, `GenerationsModal`, `WorkFormModal`, модалка прайса в наряде — приложить к отчёту.
- [ ] **Step 5:** commit `feat(price-list): работы и поколения — добавление, правка, выбор в наряде`.

---

### Task 10 (субагент B): Подбор запчастей для работы — раскрывающийся каталог с фильтрами

**Files:**
- Create: `client/src/lib/parts.ts`, `client/src/lib/parts.spec.ts`
- Create: `client/src/features/price-list/PartPicker.tsx`, `client/src/features/price-list/part-picker.css`
- Modify: `client/src/features/price-list/TemplatePartsModal.tsx` (только `AttachForm`, строки 159-264)
- Modify: `src/part-templates/part-templates.service.ts:16` (`LIMIT`)
- Test: `client/e2e/template-parts.spec.ts`
- Не трогать: `PriceListPage.tsx`, `PartsCatalog.tsx`, `price-list.css`, заголовки секций модалки (задача 5).

**Interfaces:**
- Produces:
  - `filterParts(parts: PartTemplate[], f: { q: string; manufacturer: string | null; excludeIds?: ReadonlySet<string> }): PartTemplate[]` — `q` по name/manufacturer/catalog_number без регистра, все слова запроса должны найтись (в любом поле); порядок входа сохраняется.
  - `manufacturersOf(parts: PartTemplate[]): string[]` — уникальные непустые, сортировка `localeCompare('ru')`.
  - `PartPicker({ value: PartTemplate | null; onChange(p: PartTemplate | null): void; excludeIds?: ReadonlySet<string> })`.

- [ ] **Step 1: vitest** `parts.spec.ts`:

```ts
filterParts(parts, { q: '', manufacturer: null })                    // все, порядок прежний
filterParts(parts, { q: 'фильтр mann', manufacturer: null })         // только «Фильтр масляный · MANN»
filterParts(parts, { q: 'w712', manufacturer: null })                // поиск по артикулу, регистр не важен
filterParts(parts, { q: '', manufacturer: 'Castrol' })               // только Castrol
filterParts(parts, { q: '', manufacturer: null, excludeIds: new Set(['p1']) }) // без p1
filterParts(many150, { q: 'хвост-149', manufacturer: null })         // находит 150-ю позицию
manufacturersOf([... 'MANN', null, 'Castrol', 'MANN'])               // ['Castrol', 'MANN']
```

  FAIL → реализовать → PASS.
- [ ] **Step 2: Падающий e2e** `template-parts.spec.ts`:

```ts
test('focusing the search expands the whole catalog', ...);
// GET part-templates → 3 позиции; открыть модалку запчастей работы → клик в «Найти в каталоге» → видны все 3 без ввода
test('manufacturer chip narrows the list; typing narrows further', ...);
test('«Скрыть привязанные» removes parts already attached in this section', ...);
test('keyboard: ↓ ↓ Enter picks the second part, Escape collapses', ...);
test('picked part + role + qty → PUT attach', ...);
// PUT /api/price-list/t1/parts/p2 тело { generation_id: null, qty: 2, slot: 'фильтр масляный' }
```

- [ ] **Step 3: Реализация — что решено:**
  - Каталог грузится один раз (`api.partTemplates()` без `q`, ключ `['part-templates', '']`), фильтруется локально через `filterParts` — мгновенно и работает без набора текста. Серверный `LIMIT` 100 → 500, иначе «все запчасти» молча обрежутся.
  - Фокус или клик в поле раскрывает панель под ним **в потоке** (не абсолютом — её обрежет `overflow` панели и диалога), `max-height: 280px`, прокрутка внутри. Строка: название, «производитель · артикул» (`mono`), цена справа (`mono tnum`).
  - Фильтры над списком: чипы производителей («Все» + `manufacturersOf`, одиночный выбор, горизонтальная прокрутка при переполнении) и чекбокс «Скрыть привязанные» (включён по умолчанию; `excludeIds` = детали, уже привязанные в этой секции). Счётчик «Показано N из M».
  - Пустые состояния: каталог пуст → «Каталог пуст — добавьте детали во вкладке «Запчасти»»; ничего не нашлось → «Ничего не найдено» + кнопка «Сбросить фильтры».
  - Клавиатура: ↑/↓ двигают подсветку, Enter выбирает, Escape сворачивает панель, **не закрывая модалку** (остановить всплытие). После выбора — панель сворачивается, фокус в «Роль», поле показывает выбранную деталь с кнопкой сброса.
  - `AttachForm` сохраняет текущую сетку `tp-grid` и поведение привязки; меняется только первая ячейка. Раскрытая панель занимает всю ширину строки (`grid-column: 1 / -1`).
  - Вёрстка по DESIGN.md; мобильные цели ≥ 44px.
- [ ] **Step 4:** e2e → PASS; backend `npm test`, client `typecheck/lint/test/playwright`. Скриншоты раскрытого подбора (светлая/тёмная, 1280 и 390 px) — приложить к отчёту.
- [ ] **Step 5:** commit `feat(price-list): подбор запчастей с фильтрами в модалке работы`.

---

### Task 11: Сведение и документация

- [ ] Влить ветки субагентов A и B (общих файлов нет; при конфликте в `client/src/lib/api.ts` — оставить обе правки).
- [ ] Полный прогон всех проверок из задачи 7, включая `npm run build` обоих проектов.
- [ ] Ручной прогон в живом приложении, если доступен Postgres (`docker compose up -d`): закрыть наряд → «История» клиента +1; 11 закрытых → на доске 10; оба PDF на открытом наряде; работа из прайса с другим поколением.
- [ ] `CLAUDE.md`: API (`/price-list/works`, `generation_id` у preview/apply, `/:id/pdf` в любом статусе), структура frontend (новые компоненты, `lib/generations.ts`, `lib/parts.ts`), числа тестов, раздел «Состояние».
- [ ] commit `docs: CLAUDE.md после правок прайса и UI`; `git push -u origin claude/trusting-darwin-ygnzp3`.
