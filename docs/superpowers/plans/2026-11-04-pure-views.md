# Чистые view-компоненты CRM — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** выделить из страниц клиента чистые `*View.tsx` (props in, callbacks out), чтобы их можно было рендерить в Remotion, не меняя поведение продового приложения.

**Architecture:** страница остаётся контейнером (react-query, мутации, навигация, тосты, таймеры, авто-удаление наряда) и рендерит соседний view-файл. View не импортирует сеть/auth/query/toast — это закреплено ESLint-правилом. До рефакторинга ставится страховочная сетка из desktop-e2e с aria-снапшотами и поведенческими проверками; каждая следующая задача обязана оставлять её зелёной **без обновления снапшотов**.

**Tech Stack:** React 18.3, TypeScript 5.6, TanStack Query 5, react-router 6, @dnd-kit, Vitest 2, Playwright 1.62, ESLint 8.

**Spec:** `docs/superpowers/specs/2026-11-04-crm-showcase-design.md` — раздел 3.

## Global Constraints

- Репозиторий `emt_service`; ветка — назначенная сессии (`claude/friendly-heisenberg-njaz8t`). Границы PR 0–7 = группы коммитов ниже; PR открывается только по просьбе пользователя.
- Поведение приложения не меняется. Aria-снапшоты из Task 1 обновлять (`--update-snapshots`) **запрещено** после Task 1; изменение снапшота = регрессия, чинить код.
- View-файл: `<Name>View.tsx` рядом со страницей; CSS-импорт фичи переезжает во view (контейнер получает стили транзитивно).
- View не импортирует `lib/api`, `lib/auth`, `lib/query`, `lib/toast`, `@tanstack/react-query` (ни прямо, ни транзитивно).
- Не трогать: pan/pointer-capture в `ScheduleTimeline` (`:220-308`), `data-di`, обёртки между сеткой и колонкой; `keepRef`/`woRef`/unmount-cleanup, `refetchOnMount: 'always'`, `onMutate` в `mUpdate` — остаются в `WorkOrderPage`; место объявления эффектов не переносить (StrictMode).
- Неконтролируемые инпуты наряда (title без `key`, textarea с `key=wo.id+value`, duration с `key`) переносятся буквально.
- prettier не запускать. Иконки только lucide. Деньги — `money()`.
- Проверка каждой задачи: `cd client && npm run typecheck && npm run lint && npm test && npm run build && npx playwright test`. Если Playwright не находит браузер: `executablePath: '/opt/pw-browsers/chromium'` через env `PW_CHROMIUM_PATH` в конфиге (только если версия не совпала).
- Демо-пропсы по умолчанию без эффекта: `highlightId`, `hoverId`, `rowStyle`, `forcePreview`, `inline`, `overStatus`, `ghostId`, `brand`.
- Фиксированное время в e2e: `2026-11-18T10:40:00+03:00` (среда), `timezoneId: 'Europe/Moscow'`, viewport 1440×900.

## Review Focus

1. **Уход со страницы наряда сразу после действия** — пустой наряд удаляется ровно одним `DELETE`, а после добавления строки (ответ задержан), «Из прайса…», «Копировать», «Сохранить» — `DELETE` не уходит. Тесты — Task 2, повторный прогон в Task 8.
2. **Клик vs протяжка на доске и в календаре** — клик по карточке открывает наряд, протяжка фона панорамирует, drag карточки шлёт `PATCH /status`. Тесты — Task 2.
3. **View, случайно импортирующий сеть** — ESLint падает на `*View.tsx` с `import { api }`. Тест — Task 5 (lint-фикстура).
4. **Мобильная навигация/фокус после выноса оболочки** — Escape закрывает drawer и возвращает фокус на кнопку меню. Существующий `e2e/mobile.spec.ts` + Task 10.
5. **Модалка в обычном режиме** — `Modal` без `inline` по-прежнему вызывает `showModal()` (Escape и клик по фону закрывают). Тест — Task 4.

---

## File Structure

```text
client/
  playwright.config.ts                 M  + проект desktop-chrome
  vitest.config.ts                     M  include *.spec.{ts,tsx}
  .eslintrc.cjs                        M  override для **/*View.tsx
  e2e/desktop/stub.ts                  C  stubApi(page, overrides), фикстуры, фиксированные часы
  e2e/desktop/screens.spec.ts          C  aria-снапшоты экранов
  e2e/desktop/behavior.spec.ts         C  keepRef, доска, календарь, ApplyTemplate
  src/lib/now.tsx                      C  NowProvider, useNow
  src/lib/brand.tsx                    C  Brand, DEFAULT_BRAND
  src/lib/view-helpers.ts              C  navForRole, workOrderToEvent, calendarRangeLabel, templateTotal, isEmptyWo
  src/lib/view-helpers.spec.ts         C
  src/components/ui.tsx                M  Modal inline
  src/components/ToastView.tsx         C  (ToastProvider рендерит его)
  src/components/AppShellView.tsx      C
  src/components/SearchPaletteView.tsx C
  src/components/ScheduleTimeline.tsx  M  useNow, forcePreview, highlightId, hoverId
  src/features/calendar/CalendarView.tsx         C
  src/features/calendar/SlotMenu.tsx             M  inline
  src/features/board/BoardView.tsx               C  BoardView, BoardCard
  src/features/work-orders/WorkOrderView.tsx     C
  src/features/work-orders/ScheduleFields.tsx    C  ScheduleFields, SlotPickerView
  src/features/work-orders/ApplyTemplateView.tsx C
  src/features/clients/ClientCardView.tsx        C
  src/features/price-list/PriceListView.tsx      C
  src/**/*.view.spec.tsx               C  renderToStaticMarkup-тесты view
  src/index.css, components/app-shell.css, components/schedule.css,
  features/{board,work-orders,price-list}/*.css  M  [data-hover], --shell-h, .crm-root
tsconfig.json, tsconfig.build.json, .dockerignore  M  exclude video
```

---

## PR 0 — страховочная сетка

### Task 1: desktop-проект Playwright и aria-снапшоты экранов

**Files:**
- Modify: `client/playwright.config.ts`
- Create: `client/e2e/desktop/stub.ts`, `client/e2e/desktop/screens.spec.ts`

**Interfaces:**
- Produces: `stubApi(page: Page, overrides?: Partial<StubData>): Promise<void>`; `export const FIXED_NOW = new Date('2026-11-18T10:40:00+03:00')`; фикстуры `OWNER`, `MASTER`, `SETTINGS`, `WO_FULL` (наряд с 2 блоками, скидкой строки 10% и наряда 5%, мастером), `WO_EMPTY`, `BOARD`, `CALENDAR_WEEK`, `TEMPLATES`, `TEMPLATE_PREVIEW`, `CLIENT`, `CLIENT_VEHICLES`, `GENERATIONS`, `PRICE_LIST`, `SEARCH_HITS`. `StubData` — объект этих полей; `stubApi` регистрирует `page.route` по путям из `client/src/lib/api.ts` и кладёт токен в localStorage (как `e2e/calendar-blocks.spec.ts`).

- [ ] **Step 1:** В `playwright.config.ts` добавить проект `{ name: 'desktop-chrome', testMatch: /desktop\/.*\.spec\.ts/, use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, timezoneId: 'Europe/Moscow', locale: 'ru-RU' } }`; проекту `mobile-chrome` — `testIgnore: /desktop\//`.
- [ ] **Step 2:** Написать `stub.ts`; в `test.beforeEach` спеков вызывать `await page.clock.setFixedTime(FIXED_NOW)` и `stubApi(page)`.
- [ ] **Step 3: Тесты** `screens.spec.ts`, по одному на экран, каждый — `await expect(page.locator('main')).toMatchAriaSnapshot()` (и для палитры — `page.getByRole('dialog')`):
  - `board shows five columns with cards` (`/board`)
  - `work order shows blocks, discounts and total` (`/work-orders/wo-full`) + `await expect(page.getByText(money(expectedTotal))).toBeVisible()` где `expectedTotal = orderTotal(WO_FULL)` из `src/lib/format.ts`
  - `calendar week renders events and now-line` (`/calendar`)
  - `price list for generation R56` (`/price-list`)
  - `client card shows vehicles and orders` (`/clients/client-hero`)
  - `cmd+k palette lists hits` (нажать `Meta+K`, ввести `WMW`)
- [ ] **Step 4:** Сгенерировать снапшоты на **неизменённом** коде: `cd client && npx playwright test --project=desktop-chrome --update-snapshots`. Прогнать ещё раз без флага — PASS. Mobile-проект — PASS.
- [ ] **Step 5: Commit** — `test(e2e): desktop aria snapshots as refactor safety net`.

### Task 2: поведенческие e2e

**Files:**
- Create: `client/e2e/desktop/behavior.spec.ts`

**Interfaces:**
- Consumes: `stubApi`, фикстуры из Task 1. Счётчик запросов — через `page.on('request')` с фильтром метода и пути.

- [ ] **Step 1: Тесты** (все должны пройти на текущем коде):
  - `empty work order is deleted once on leave`: открыть `/work-orders/wo-empty`, уйти на `/board` → ровно 1 `DELETE /api/work-orders/wo-empty`.
  - `adding a line keeps the order even if response is slow`: ответ `POST …/labor` задержан на 1000 мс; добавить строку и сразу уйти → 0 `DELETE`.
  - `picking from price list keeps the order`, `duplicate keeps the order`, `save keeps the order`: соответствующее действие → уход → 0 `DELETE`.
  - `dragging a board card patches status`: drag карточки из «Запланирована» в «В работе» (`page.mouse` с шагами > 5 px) → `PATCH /api/work-orders/:id/status` с телом `{ status: 'in_progress' }`.
  - `clicking a board card opens the order` → `expect(page).toHaveURL(/\/work-orders\//)`.
  - `dragging board background pans without navigation` → `scrollLeft` контейнера вырос, URL не изменился.
  - `moving a calendar event patches scheduled_at` → `PATCH /api/work-orders/:id` с `scheduled_at`.
  - `unticked template part is not sent`: открыть ApplyTemplate, снять одну деталь, подтвердить → тело `POST …/apply-template` без её `part_template_id`; клик по полю количества не меняет состояние чекбокса.
- [ ] **Step 2:** `npx playwright test` — все PASS (desktop + mobile, существующие 9 тоже).
- [ ] **Step 3: Commit** — `test(e2e): behavior checks for auto-delete, board, calendar, template`.

---

## PR 1 — инфраструктура

### Task 3: чистые хелперы и vitest для .tsx

**Files:**
- Modify: `client/vitest.config.ts` (`include: ['src/**/*.spec.{ts,tsx}']`)
- Create: `client/src/lib/view-helpers.ts`, `client/src/lib/view-helpers.spec.ts`
- Modify: `AppShell.tsx` (NAV-фильтр), `CalendarPage.tsx:79-93`, `WorkOrderPage.tsx:65` (`isEmptyWo` → импорт), `ApplyTemplateModal.tsx:54-63`

**Interfaces:**
- Produces:
  - `navForRole(role: UserRole | undefined): NavItem[]` где `export interface NavItem { to: string; label: string; icon: LucideIcon }` — тот же список и та же фильтрация, что сейчас в `AppShell` (`NAV`, `:29`).
  - `workOrderToEvent(w: WorkOrder, defaultDurMin: number, opts?: { showMaster?: boolean }): TimelineEvent | null` — `null`, если нет `scheduled_at`; поля как в `CalendarPage.tsx:79-93` (title = `eventTitle(w)`).
  - `calendarRangeLabel(view: 'week' | 'day', days: Date[]): string` — текущая строка периода из `CalendarPage`.
  - `templateTotal(preview: TemplatePreview | undefined, picked: ReadonlySet<string>, qty: Record<string, string>): number`.
  - `isEmptyWo(w: WorkOrder | null): boolean` — перенос как есть.

- [ ] **Step 1: Тесты** `view-helpers.spec.ts`:
  - `navForRole('master')` не содержит пунктов с `to` `/settings` и `/price-list`; `navForRole('owner')` содержит `/import`; `navForRole('master_receptionist')` не содержит `/import`.
  - `workOrderToEvent` без `scheduled_at` → `null`; с `scheduled_duration_min: null` → `durationMin === defaultDurMin`; `showMaster: false` → `masterName === undefined`.
  - `templateTotal`: labor `price_override: 5000` + детали `{a: 2×1000, b: 1×300}`, picked `{a}` → `7000`; `hours 2 × rate 2500`, без деталей → `5000`; `preview undefined` → `0`.
  - `isEmptyWo(null) === true`; наряд с одной строкой → `false`; с `scheduled_at` → `false`.
- [ ] **Step 2:** `npm test` — FAIL (модуля нет).
- [ ] **Step 3:** Реализовать, заменить inline-логику в контейнерах вызовами хелперов.
- [ ] **Step 4:** `npm test` PASS; `npx playwright test` PASS без обновления снапшотов.
- [ ] **Step 5: Commit** — `refactor(client): extract pure view helpers`.

### Task 4: `useNow`, `Modal inline`, `ToastView`

**Files:**
- Create: `client/src/lib/now.tsx`, `client/src/components/ToastView.tsx`, `client/src/components/ui.view.spec.tsx`
- Modify: `client/src/components/ui.tsx:100-170`, `client/src/lib/toast.tsx`, `client/src/components/ScheduleTimeline.tsx:79-82`

**Interfaces:**
- Produces:
  - `NowProvider({ value, children }: { value: Date; children: ReactNode })`, `useNow(): Date` — без провайдера `new Date()` на каждый вызов.
  - `ScheduleTimeline`: `now` = `nowProp ?? useNow()` (сигнатура пропа не меняется).
  - `Modal` получает `inline?: boolean`: при `inline` рендерит `<div className="modal-inline-backdrop"><dialog open …>` и **не** вызывает `showModal()`; путь по умолчанию байт-в-байт прежний.
  - `ToastView({ toasts }: { toasts: { id: number; kind: 'success' | 'error' | 'info'; text: string }[] })` — разметка `toast-wrap` из `toast.tsx`; `ToastProvider` рендерит `<ToastView toasts={toasts} />`.

- [ ] **Step 1: Тесты** (`renderToStaticMarkup`):
  - `Modal inline renders open dialog without showModal` — разметка содержит `<dialog open` и класс `modal-inline-backdrop`.
  - `ToastView renders kinds` — `data-kind="success"` и текст.
  - `ScheduleTimeline uses NowProvider` — в `NowProvider value=2026-11-18T10:40+03:00` линия «сейчас» (`.stl-now`, проверить селектор в `ScheduleTimeline.tsx`) имеет `top`, соответствующий 10:40 при `cfg.startHour=8, pxPerMin=1` → `160px`.
- [ ] **Step 2:** FAIL → реализовать → PASS. Стиль `.modal-inline-backdrop` (`position:absolute; inset:0; display:grid; place-items:center; background: var(--backdrop, rgba(0,0,0,.35))`) — в `index.css` слой `components`.
- [ ] **Step 3:** `npx playwright test` PASS (Review Focus 5: модалки в приложении по-прежнему закрываются Escape — покрыто существующими e2e календаря; если нет — добавить `escape closes slot menu` в `behavior.spec.ts`).
- [ ] **Step 4: Commit** — `feat(client): NowProvider, inline Modal, ToastView`.

### Task 5: CSS-хуки, бренд, ESLint-правило, exclude `video`

**Files:**
- Modify: `client/src/index.css`, `components/app-shell.css:4,15`, `components/schedule.css:128,174`, `features/board/board.css:67`, `features/work-orders/wo.css:51,53`, `features/price-list/price-list.css:29`, `components/app-shell.css:45`, `index.css:379`
- Create: `client/src/lib/brand.tsx`
- Modify: `client/.eslintrc.cjs`, `tsconfig.json`, `tsconfig.build.json`, `.dockerignore`

**Interfaces:**
- Produces:
  - CSS: каждому перечисленному `X:hover` добавить `X[data-hover]` в тот же селектор; `[data-highlight]` без стилей в CRM (стилизует видео). В `tokens`: `--shell-h: 100dvh`; `app-shell.css` использует `var(--shell-h)`. Селектор `body` в `@layer base` расширить до `body, .crm-root`.
  - `export interface Brand { name: string; logoLight: string; logoDark: string }`, `export const DEFAULT_BRAND: Brand = { name: 'EMT Service', logoLight: '/emt-logo-light-theme.png', logoDark: '/emt-logo-dark-theme.png' }`.
  - ESLint override: `files: ['src/**/*View.tsx']`, `rules: { 'no-restricted-imports': ['error', { patterns: ['**/lib/api', '**/lib/auth', '**/lib/query', '**/lib/toast', '@tanstack/react-query'] }] }`.
- [ ] **Step 1:** Внести CSS-изменения. Проверка: `npx playwright test` PASS (снапшоты не меняются — атрибутов ещё нет).
- [ ] **Step 2:** `brand.tsx`; `AppShell` пока использует `DEFAULT_BRAND` (вывод тот же).
- [ ] **Step 3: Тест правила.** Временный файл `client/src/features/board/LintProbeView.tsx` с `import { api } from '../../lib/api'` → `npm run lint` FAIL с `no-restricted-imports`; удалить файл → PASS. (Проверка руками, файл не коммитится.)
- [ ] **Step 4:** Добавить `"video"` в `exclude` обоих корневых tsconfig, `"demo"` — только в `tsconfig.build.json` (корневой `tsconfig.json` должен типизировать `demo/`), строки `video`, `demo` в `.dockerignore` (папки появятся только в шоукейсе; правка здесь заранее убирает конфликт той же строки при `merge upstream/main`). Проверка: `cd .. && npx tsc --noEmit && npm run build` PASS.
- [ ] **Step 5: Commit** — `chore(client): demo hooks in CSS, brand config, view import rule`.

---

## PR 2 — календарь

### Task 6: `CalendarView`, демо-пропсы таймлайна, `SlotMenu inline`

**Files:**
- Create: `client/src/features/calendar/CalendarView.tsx`, `CalendarView.view.spec.tsx`
- Modify: `CalendarPage.tsx`, `SlotMenu.tsx`, `components/ScheduleTimeline.tsx` (только `renderEvent` и атрибуты)

**Interfaces:**
- Consumes: `workOrderToEvent`, `calendarRangeLabel` (Task 3), `useNow` (Task 4).
- Produces:
  - `ScheduleTimelineProps` + `forcePreview?: { id: string; startMin: number; durMin: number } | null` (эффективное превью = `preview ?? forcePreview`), `highlightId?: string` (→ `data-highlight` на `.stl-ev`), `hoverId?: string` (→ `data-hover`).
  - `CalendarViewProps { days: Date[]; view: 'week' | 'day'; orientation: TimelineOrientation; rangeLabel: string; events: TimelineEvent[]; cfg: TimelineCfg; now?: Date; loading?: boolean; selection?: TimelineEvent | null; highlightId?: string; hoverId?: string; forcePreview?: ScheduleTimelineProps['forcePreview']; onView(v: 'week' | 'day'): void; onOrientation(o: TimelineOrientation): void; onPrev(): void; onToday(): void; onNext(): void; onEventClick(id: string): void; onEventMove(id: string, startISO: string): void; onEventResize(id: string, durationMin: number): void; onEmptyClick(startISO: string, durationMin: number): void }`.
  - `SlotMenu` + `inline?: boolean` (пробрасывается в `Modal`).
  - `data-demo`: `cal-view-week`, `cal-view-day`, `cal-orient`, `cal-prev`, `cal-today`, `cal-next`, `timeline`, `timeline-event` (+`data-id`), `slot-booking`, `slot-reserve`.
- [ ] **Step 1: Тест** `CalendarView.view.spec.tsx`: рендер с 2 событиями и `highlightId` → ровно один элемент с `data-highlight`; `forcePreview` для события → его `top` соответствует `startMin`; есть все `data-demo` из списка.
- [ ] **Step 2:** FAIL → вынести JSX `CalendarPage` в `CalendarView`; контейнер оставляет `useQuery` ×3, мутации, `anchor` (инициализатор `useState(() => new Date())` можно заменить на `useNow()`), localStorage ориентации, ключи кэша `['calendar','blocks',from,to]`.
- [ ] **Step 3:** PASS; `npx playwright test` PASS (снапшот `calendar week…` не меняется — `data-*` атрибуты aria-снапшот не затрагивают), 9 старых e2e PASS.
- [ ] **Step 4: Commit** — `refactor(calendar): CalendarView + demo props on ScheduleTimeline`.

---

## PR 3 — доска

### Task 7: `BoardView` и `BoardCard`

**Files:**
- Create: `client/src/features/board/BoardView.tsx`, `BoardView.view.spec.tsx`
- Modify: `client/src/features/board/BoardPage.tsx`

**Interfaces:**
- Produces:
  - `export type Columns = Record<WorkOrderStatus, WorkOrder[]>`.
  - `BoardViewProps { columns: Columns; showMaster: boolean; activeId: string | null; loading?: boolean; onOpen(id: string): void; onDragStart(e: DragStartEvent): void; onDragEnd(e: DragEndEvent): void; overStatus?: WorkOrderStatus; ghostId?: string; highlightId?: string; rowStyle?: (index: number, id: string) => CSSProperties }`.
  - `BoardCard({ wo, showMaster, dragging }: { wo: WorkOrder; showMaster?: boolean; dragging?: boolean })` — бывший `Card` (`BoardPage.tsx:194`).
  - Внутри view: `DndContext`, `Column`, `DraggableCard`, pan-обработчики, класс `.board-card-drag`, `activationConstraint: { distance: 5 }` — перенос без изменений. В контейнере: `useQuery(['board'])`, синхронизация `cols` при `!activeId` (`:40-42`), оптимистичный `onDragEnd`, мутация, тосты, навигация.
  - `data-demo`: `board-col` (+`data-status`), `board-card` (+`data-id`).
- [ ] **Step 1: Тест**: `overStatus='in_progress'` → колонка `data-status="in_progress"` имеет класс/атрибут `over`, как при реальном drag; `ghostId` → карточка с `opacity` `.35`; `rowStyle` применяется к карточке по индексу.
- [ ] **Step 2:** FAIL → реализовать → PASS; `npx playwright test` PASS (снапшот доски и 3 поведенческих теста доски не меняются).
- [ ] **Step 3: Commit** — `refactor(board): BoardView and BoardCard`.

---

## PR 4 — наряд (самый рискованный, отдельный PR)

### Task 8: `ScheduleFields`/`SlotPickerView` и `WorkOrderView`

**Files:**
- Create: `client/src/features/work-orders/ScheduleFields.tsx`, `WorkOrderView.tsx`, `WorkOrderView.view.spec.tsx`
- Modify: `client/src/features/work-orders/WorkOrderPage.tsx`

**Interfaces:**
- Consumes: `isEmptyWo` (Task 3).
- Produces:
  - `ScheduleFields(props: { wo: WorkOrder; defaultDurMin: number; disabled: boolean; onChange(b: Partial<WorkOrder>): void; onOpenPicker(): void; onFit?(): void })`.
  - `SlotPickerView(props: { day: Date; events: TimelineEvent[]; cfg: TimelineCfg; selection: TimelineEvent | null; now?: Date; onPrevDay(): void; onNextDay(): void; onSelect(startISO: string, durationMin: number): void })`. Контейнер `ScheduleSection` (`:1062`) оставляет 2 `useQuery`, тосты, `pickOpen`, `pickerDay`.
  - `WorkOrderViewProps` — дословно из спеки/аудита: `wo, back, templates?, staff?, canAssign, laborRate, editLaborId, editPartId, pending, scheduleSlot: ReactNode, onUpdate, onStatus, onCloseOrder, onPdf, onOrderPdf, onPaid, onAddLabor, onEditLabor, onDelLabor, onAddPart, onEditPart, onDelPart, onRenameGroup, onMoveGroup, onUngroup, onPickTemplate, onDuplicate, onAskDelete, onSave, onStartEditLabor, onStartEditPart`, демо: `highlightLineId?, hoverLineId?, laborDraft?, partDraft?, rowStyle?`. `pending: Partial<Record<'status'|'close'|'pdf'|'orderPdf'|'addLabor'|'editLabor'|'addPart'|'editPart'|'delete', boolean>>`.
  - Во view переезжают `GroupHeader`, `LineDiscountCell`, `lineDiscountCell`, `LaborLineForm`, `PartLineForm`, `MasterControl`, `DiscountControl`, `PaidControl`, `fmtQty`, `unitLabel`, `toLocalInput`. Формы: `value = draftProp ?? state`.
  - В контейнере: все `useQuery`/`useMutation`, `keepRef`, `woRef`, unmount-cleanup (`:250-268`), `handleSave`, модалки (удаление, `DuplicateModal`, `ApplyTemplateModal`), `window.prompt` для переименования блока. `onPickTemplate` и `onDuplicate` **первой строкой** вызывают `keep()` (сейчас `:396`, `:638`).
  - `data-demo`: `wo-title`, `wo-status`, `wo-delete`, `add-from-price`, `labor-panel`, `labor-row`, `labor-add`, `parts-panel`, `part-row`, `part-add`, `estimate-group` (+`data-id`), `wo-summary`, `wo-master`, `wo-schedule`, `slot-picker`, `wo-discount`, `wo-total`, `wo-paid`, `wo-save`, `wo-close`, `wo-report-pdf`, `wo-order-pdf`, `wo-duplicate`.
- [ ] **Step 1: Тесты** (`WorkOrderView.view.spec.tsx`, фикстура = копия `WO_FULL` из e2e): `wo-total` содержит `money(orderTotal(wo))`; два `estimate-group` в порядке `group_sort`; `laborDraft={{ name: 'Замена цепи' }}` + `editLaborId` → инпут с этим значением; `highlightLineId` → один `data-highlight`; при `wo.status='closed'` кнопки правки строк `disabled`.
- [ ] **Step 2:** FAIL. Вынести сначала `ScheduleFields`/`SlotPickerView` → `npx playwright test` PASS → коммит `refactor(work-order): ScheduleFields and SlotPickerView`.
- [ ] **Step 3:** Вынести `WorkOrderView`. После выноса прогнать **весь** `behavior.spec.ts` трижды подряд (`--repeat-each=3`) — 5 тестов `keepRef` стабильно PASS.
- [ ] **Step 4:** `npm test` PASS; aria-снапшот наряда не изменился.
- [ ] **Step 5: Commit** — `refactor(work-order): WorkOrderView, container keeps lifecycle`.

---

## PR 5 — разворачивание шаблона

### Task 9: `ApplyTemplateView`

**Files:**
- Create: `client/src/features/work-orders/ApplyTemplateView.tsx` (+ `.view.spec.tsx`)
- Modify: `ApplyTemplateModal.tsx`

**Interfaces:**
- Consumes: `templateTotal` (Task 3), `Modal inline` (Task 4).
- Produces: `ApplyTemplateViewProps { open: boolean; preview?: TemplatePreview; loading?: boolean; picked: ReadonlySet<string>; qty: Record<string, string>; total: number; pending?: boolean; inline?: boolean; onToggle(partTemplateId: string): void; onQty(partTemplateId: string, v: string): void; onConfirm(): void; onClose(): void }`. Контейнер: `useQuery(['template-preview'])`, инициализация `picked` в `useEffect` (`:40`), мутация, тост. `preventDefault` на поле количества (`:165`) — во view без изменений. `data-demo`: `apply-labor`, `apply-part` (+`data-id`), `apply-confirm`.
- [ ] **Step 1: Тест**: кнопка `apply-confirm` содержит `money(total)`; невыбранная деталь — чекбокс без `checked`; `inline` → `<dialog open`.
- [ ] **Step 2:** FAIL → реализовать → PASS; `npx playwright test` PASS (тест `unticked template part is not sent`).
- [ ] **Step 3: Commit** — `refactor(work-order): ApplyTemplateView`.

---

## PR 6 — оболочка и поиск

### Task 10: `AppShellView` и `SearchPaletteView`

**Files:**
- Create: `client/src/components/AppShellView.tsx`, `SearchPaletteView.tsx` (+ `.view.spec.tsx`)
- Modify: `AppShell.tsx`, `GlobalSearch.tsx`

**Interfaces:**
- Consumes: `navForRole` (Task 3), `Brand`/`DEFAULT_BRAND` (Task 5).
- Produces:
  - `AppShellViewProps { userName: string; nav: NavItem[]; theme: Theme; drawerOpen: boolean; brand?: Brand; drawerRef?: Ref<HTMLElement>; menuButtonRef?: Ref<HTMLButtonElement>; closeButtonRef?: Ref<HTMLButtonElement>; onOpenSearch(): void; onNewIntake(): void; onToggleTheme(): void; onLogout(): void; onOpenDrawer(): void; onCloseDrawer(restoreFocus?: boolean): void; overlays?: ReactNode; children: ReactNode }`. Контейнер: `useAuth`, `useTheme`, ⌘K, focus-trap, `IntakeContext`, `requestAnimationFrame`.
  - `SearchPaletteViewProps { q: string; hits: SearchHit[]; active: number; fetching?: boolean; inputRef?: Ref<HTMLInputElement>; onQ(v: string): void; onKeyDown(e: KeyboardEvent<HTMLInputElement>): void; onHover(i: number): void; onPick(hit: SearchHit): void; onClose(): void }` (тип `SearchHit` — тот, что сейчас в `GlobalSearch`, экспортировать из `lib/types.ts`). Контейнер: debounce 160 мс, фокус-`setTimeout`, `useQuery(['search'])`, навигация.
  - `data-demo`: `nav-clients|board|calendar|price-list|archive`, `search-trigger`, `new-intake`, `theme-toggle`, `user-chip`, `search-input`, `search-hit`.
- [ ] **Step 1: Тесты**: `brand={{ name: 'Гараж CRM', … }}` → `alt="Гараж CRM"` у логотипов; `nav` из `navForRole('master')` → нет ссылки на `/settings`; палитра с `active=1` → второй `search-hit` имеет `aria-selected="true"`.
- [ ] **Step 2:** FAIL → реализовать → PASS; `npx playwright test` PASS, включая `e2e/mobile.spec.ts` (Escape закрывает drawer, фокус возвращается на кнопку меню) и снапшот палитры.
- [ ] **Step 3: Commit** — `refactor(shell): AppShellView and SearchPaletteView`.

---

## PR 7 — карточка клиента и прайс

### Task 11: `ClientCardView` и `PriceListView`

**Files:**
- Create: `client/src/features/clients/ClientCardView.tsx`, `client/src/features/price-list/PriceListView.tsx` (+ `.view.spec.tsx`)
- Modify: `ClientCardPage.tsx`, `PriceListPage.tsx`

**Interfaces:**
- Produces:
  - `ClientCardViewProps { client: Client; vehicles?: Vehicle[]; orders: WorkOrder[]; creatingWoVehicleId?: string | null; highlightOrderId?: string; onEdit(): void; onDelete(): void; onAddVehicle(): void; onEditVehicle(v: Vehicle): void; onNewWorkOrder(vehicleId: string): void; onOpenOrder(id: string): void }`. Модалки и прямой `api.createWorkOrder` (`:75`) — в контейнере.
  - `PriceListViewProps { tab: 'works' | 'parts'; generations: VehicleGeneration[]; generationId: string | null; rows?: PriceListRow[]; loading?: boolean; withOverride: number; busy?: boolean; partsSlot?: ReactNode; highlightTemplateId?: string; onTab(t: 'works' | 'parts'): void; onGeneration(id: string | null): void; onSave(templateId: string, hours: number | null, price: number | null): void; onClear(templateId: string): void; onEditParts(row: PriceListRow): void; onCopy(): void }`. `PriceRow` переезжает во view; `PartsCatalog`, `TemplatePartsModal`, `CopyPricesModal`, localStorage поколения — в контейнере.
  - `data-demo`: `client-head`, `client-edit`, `vehicle-row`, `new-work-order`, `client-orders`, `order-row`; `pl-tab-works`, `pl-tab-parts`, `pl-generation`, `pl-copy`, `pl-row` (+`data-id`), `pl-parts-btn`.
- [ ] **Step 1: Тесты**: карточка показывает `order-row` по числу `orders`; прайс — у строки с override метка источника «своя», без — «базовая»/«по ставке» (как сейчас `pl-src`).
- [ ] **Step 2:** FAIL → реализовать → PASS; `npx playwright test` PASS.
- [ ] **Step 3: Commit** — `refactor(clients, price-list): ClientCardView and PriceListView`.

### Task 12: финальная проверка ветки

- [ ] **Step 1:** Backend: `npx tsc --noEmit && npm test && npm run lint -- --max-warnings=0 && npm run build` — PASS (160 тестов).
- [ ] **Step 2:** Client: `cd client && npm run typecheck && npm run lint && npm test && npm run build && npx playwright test` — PASS; число vitest-тестов выросло, aria-снапшоты не менялись с Task 1 (`git log --oneline -- client/e2e/desktop/*-snapshots` показывает только коммит Task 1).
- [ ] **Step 3:** `grep -rLE "lib/(api|auth|query|toast)|react-query" client/src --include='*View.tsx'` выводит все view-файлы (ни один не импортирует запрещённое).
- [ ] **Step 4:** Ручная проверка `npm run dev` + backend на dev-базе: открыть доску, наряд (добавить/удалить строку, уйти с пустого наряда), календарь (клик и протяжка), прайс, ⌘K — поведение прежнее.
- [ ] **Step 5:** Обновить раздел «Структура frontend» в `CLAUDE.md` (view-файлы, `lib/now.tsx`, `lib/brand.tsx`, `lib/view-helpers.ts`, ESLint-правило, desktop-e2e). Commit — `docs: document pure views in CLAUDE.md`.
