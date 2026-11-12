# CLAUDE.md — Татарин CRM

CRM для СТО (профиль — MINI, но принимают любые машины), владелец + мастера/приёмщики (роли),
~300 клиентов. Спека и артефакты: `spec.md`, `data-model.md`, `plan.md`, `checks.md`.
Стратегия/визуал: `PRODUCT.md`, `DESIGN.md`.

## Стек

- **Backend:** NestJS 10 + TypeORM 0.3 + PostgreSQL 16. Модульный монолит, бизнес-логика в
  сервисах (контроллеры тонкие). JWT-auth. Корень репозитория.
- **Frontend:** Vite + React 18 + TypeScript в `client/`. TanStack Query, react-router,
  @dnd-kit (канбан), lucide-react, date-fns. Без UI-фреймворка — свои токены в `client/src/index.css`.

## Как запустить

```bash
# 1. Postgres (docker) — порт 5544, НЕ 5433 (5433 занят чужим pg-master на этой машине)
docker compose up -d            # или: docker start tatarin_pg
# 2. Backend (миграции + сид автоматом на старте)
npm install && npm run build && node dist/main.js     # :3000
# 3. Frontend
cd client && npm install && npm run dev                # :5173
```

- **Вход:** `owner` / `owner` (авто-сид; в production отказывается от пароля `owner`).
- `.env` (gitignored) уже настроен: `DATABASE_URL=postgres://crm:crm@localhost:5544/tatarin_crm`,
  `JWT_SECRET` обязателен (иначе backend не стартует).
- На хосте нет `psql`/`jq` — проверяй API через Node `fetch` или
  `docker exec tatarin_pg psql -U crm -d tatarin_crm`.
- **`npm run migration:run` / `migration:revert` сломаны:** TypeORM CLI требует, чтобы
  `data-source.ts` экспортировал ровно один символ, а он экспортирует `entities`, `migrations` и
  `AppDataSource`. Миграции накатываются на старте приложения (`migrationsRun: true`); для
  отката — скрипт на собранном `dist` (`AppDataSource.undoLastMigration()`).

## Архитектура данных

Две опоры: **Vehicle** (центр учёта, с VIN) и **WorkOrder** (заказ-наряд — календарь+канбан+смета).

```
Client 1──* Vehicle ──? VehicleGeneration          ← справочник поколений, ключ прайса
                 1──* WorkOrder 1──* LaborLine ──? TaskTemplate
                                  └──* PartLine  ──? PartTemplate
                      WorkOrder ──? User (assigned_master)

TaskTemplate ──* TemplateGenerationPrice ──? VehicleGeneration   ← цена по поколению
TaskTemplate ──* TaskTemplatePart ──? PartTemplate, ──? VehicleGeneration  ← «работа + её запчасти»
CalendarBlock ──? User                              ← резерв времени, вне нарядов
Settings(key-value: labor_rate, company_*, vat_rate, расписание)
```

Ключевые инварианты:
- **Snapshot ставки:** `labor_lines.rate_snapshot` копируется при добавлении строки →
  смена `labor_rate` не двигает прошлые наряды.
- **Расчёт сметы** (единственный источник — `PricingService`, зеркало на клиенте в `lib/format.ts`):
  ```
  gross   = price_override ?? часы × rate_snapshot   |   кол-во × цена
  скидка  = percent → round2(gross × %/100)          |   fixed → срезается по gross
  net     = gross − скидка строки
  итого   = round2(Σ net − скидка наряда)
  ```
  Скидки строки и наряда **стекаются последовательно**: 10% + 10% = 19%, не 20%. Округляется
  скидка строки, а не gross — иначе печатная колонка «Скидка» не сходится с «Итого».
- **Заморозка сметы:** переход в `closed` (через `/close`, drag в «Выдана» или PATCH) ставит
  `total_frozen` + `closed_at` и присваивает `doc_number`; возврат из `closed` — очищает.
  Единственная точка — `WorkOrdersCoreService.applyFreezeTransition` (в т.ч. `close()` делегирует
  туда, поэтому повторное закрытие — no-op).
- **`total_cached`** пересчитывается сервисом при любом изменении строк/скидки (для списков).
- **Порядок строк сметы** — только по `group_sort, sort, created_at`. Без явного `ORDER BY`
  Postgres отдаёт строки в heap-порядке, который меняется после каждого `UPDATE`.
- **Блоки сметы денормализованы** на строках (`group_key` uuid, `group_name`, `group_sort`),
  таблицы групп нет: PDF и UI нужны только порядок и заголовок. Удаление работы оставляет
  запчасти блоком под тем же именем; пустой блок невозможен по построению.
- **Роль детали в работе** (`task_template_parts.slot`): строки с одной ролью — альтернативы,
  для своего поколения побеждает та, что задана под него. Без роли деталь ничего не замещает.
  Ключевать замену по `part_template_id` **нельзя** — R56-фильтр это другая позиция каталога.
- **Марка/модель/поколение:** `vehicles.make` и `model` — свободный текст, `generation_id` —
  необязательная ссылка на справочник (по ней джойнится прайс). `generation_code` продублирован
  на машине, чтобы лейбл рисовался даже после ретайра строки каталога. Каталог **не** ограничение —
  иначе не завести не-MINI.
- **Источник клиента** (`client_source`): `manual`, `csv_import`, `telegram_bot` (зарезервирован).
- **Роли и видимость нарядов:** `owner`/`master_receptionist` видят ВСЕ наряды; `master` —
  только с `assigned_master_id == он сам` (чужой по id → 404, не 403). Скоупинг в
  `WorkOrdersCoreService` (`scope` + `assertAccess`), не на фронте. Мастер создаёт/копирует наряд →
  авто-назначается себе. `users.is_active=false` → запрет логина.
- **Видимость резервов — другая:** `user_id IS NULL OR user_id = viewer`. Общий резерв обязан быть
  виден мастеру, иначе он перезапишет занятый подъёмник.

Enums: `work_order_status`(scheduled→in_progress→waiting→done→closed), `discount_type`,
`user_role`, `client_source`. Поиск: `pg_trgm` GIN по ФИО/телефону/VIN/госномеру/марке/каталогу запчастей.

## Структура backend (`src/`)

```
entities/        client, vehicle (+make/generation), vehicle-generation, work-order,
                 labor-line, part-line (оба +скидка/группа/sort), task-template, part-template,
                 template-generation-price, task-template-part, calendar-block, user, setting
migrations/      Init … AddWorkOrderComplaintRecommendation (MVP),
                 1719000000000 AddLineOrderingAndIndexes     — sort/created_at, индексы FK, template_id → SET NULL
                 1719100000000 AddVehicleMakeAndGenerations  — справочник + аддитивный бэкфилл
                 1719200000000 AddCalendarBlocks             — резервы времени
                 1719300000000 AddLineDiscountsAndManufacturer
                 1719400000000 AddPriceListAndPartTemplates
                 1719500000000 AddLineGroupsAndTemplateParts
                 1719600000000 AddTaskTemplatePartSlot       — роль детали в работе
common/          phone.util, numeric.transformer, vehicle-label.util, rubles-in-words, public.decorator
auth/            JWT, глобальный JwtAuthGuard + @Public(); @CurrentUser(), @Roles()+RolesGuard
users/  clients/ (+import)  vehicles/  vehicle-generations/  part-templates/  calendar-blocks/
task-templates/  + price-list.service/controller (прайс по поколениям, связки запчастей),
                   price-resolution.service (чистый: переопределение → база → ставка, с source)
work-orders/     work-orders-core.service (загрузка/скоупинг/recompute/заморозка — общее ядро),
                 work-orders.service (наряд целиком, календарь, архив, duplicate),
                 work-order-lines.service (строки, блоки, разворачивание шаблона),
                 pricing.service, pdf/work-order-pdf.service
settings/  search/  seed/  assets/fonts/ (DejaVu — кириллица в PDF, читаются из process.cwd())
```

Сущности и миграции регистрируются **явными импортами** в `src/data-source.ts` (два массива) —
не glob. Любая новая сущность/миграция добавляется туда руками.

API (всё под JWT кроме `/health`, `/auth/login`):
- `/clients` (+`/import`, `/:id/vehicles`), `/vehicles`, `/vehicle-generations`, `/part-templates`
- `/work-orders` (+`/board`, `/calendar`, `/archive`, `/:id/labor|parts`, `/:id/status`, `/:id/close`,
  `/:id/paid`, `/:id/duplicate`, `/:id/template-preview`, `/:id/apply-template`, `/:id/groups/:key`,
  `/:id/pdf` — предварительная калькуляция, любой статус (до закрытия — без номера, дата = сегодня), `/:id/order-pdf` — заказ-наряд, любой статус)
- `/price-list` (+`/:tpl/:gen` цена, `/copy` заливка между поколениями, `/:tpl/parts` связки,
  `POST /works` — работа + цена поколения одной транзакцией)
- `template-preview` / `apply-template` принимают `generation_id`: нет параметра → поколение машины,
  `base` (в query) / `null` (в теле) → базовые цены, uuid → это поколение
- `/calendar-blocks`, `/task-templates`, `/users`, `/settings`, `/search?q=`

Запись в каталоги (`task-templates`, `part-templates`, `vehicle-generations`, `price-list`) —
`@Roles('owner','master_receptionist')`; чтение открыто всем. Удаление шаблонов и поколений —
**деактивация** (`active=false`), на них ссылаются исторические наряды.

**PDF** (pdfmake, оба документа в `pdf/work-order-pdf.service.ts`):
- «Смета» (`/:id/pdf`, образец `Васильев.pdf`) — две таблицы с строками-подзаголовками блоков,
  артикул отдельной колонкой, производитель под названием.
- «Заказ-наряд» (`/:id/order-pdf`) — блоки «работа + её запчасти» с итогом по блоку.
  **Артикула нет** (внутренние данные), деталь опознаётся по «название · производитель».
- Построители таблиц возвращают чистые строки (`DocTable`/`DocBlock`), обёртки заворачивают в
  pdfmake — единственный способ тестировать 600 строк документа без e2e.
- Блок итогов: «Стоимость работ + запчастей − Сумма скидок === Итого» — точное равенство,
  «Сумма скидок» выводится из **округлённых** печатных сумм. НДС «в составе» (`total×rate/(100+rate)`).

## Структура frontend (`client/src/`)

```
lib/      api.ts (fetch+JWT), auth.tsx, roles.ts, intake.tsx (IntakeContext — открыть приём со слотом),
          types.ts, schedule.ts (геометрия таймлайна, dayRangeIso, blockToEvent, parseEventId),
          format.ts (зеркало PricingService + vehicleLabel + estimateGroups + clientDeals + capClosed),
          generations.ts (genLabel, groupGenerations), parts.ts (filterParts, manufacturersOf),
          toast.tsx, theme.ts
components/ GenerationPicker (поиск по справочнику поколений, общий для прайса и наряда),
          AppShell (nav скрывает «Настройки»/«Прайс-лист» у master, «Импорт» у не-owner),
          GlobalSearch (⌘K), IntakeModal, VehicleFields (общие поля ТС), ScheduleTimeline, ui.tsx
features/ auth/ clients/ board/ archive/ import/ settings/
          calendar/  CalendarPage + SlotMenu (запись/резерв) + BlockModal
          price-list/ PriceListPage + PartsCatalog + TemplatePartsModal + PartPicker (подбор детали)
                      + WorkFormModal (работа: добавить/править/убрать) + GenerationsModal
          work-orders/ WorkOrderPage + PriceListPickerModal (работа из прайса с выбором поколения)
                       + ApplyTemplateModal + DuplicateModal
index.css дизайн-токены (OKLCH, light/dark via [data-theme]), компонентные классы
```

Дизайн: Linear-like (тихий/плотный/точный), стальной-синий primary + латунный accent.
Полная спека — `DESIGN.md`. Навигация на наряд передаёт `state.back={to,label}`.

Тонкости, которые легко сломать:
- **`ScheduleTimeline`:** `panEnabled = !selectable`; pan делает `setPointerCapture` на
  скролл-контейнере, поэтому `pointerup` ретаргетится на него — клик по пустому месту ловится
  внутри pan-обработчиков (цель запоминается на `pointerdown`), а индекс дня берётся из `data-di`,
  а не через `indexOf` по детям (первый ребёнок сетки — ось часов). **Тянешь — панорамируешь,
  кликаешь — создаёшь.**
- Ключ кэша резервов — `['calendar','blocks',from,to]`: префикс `['calendar']` сохраняется, все
  существующие `invalidateQueries` работают без правок.
- Календарь шлёт **полные ISO-инстанты** (`dayRangeIso`), не `yyyy-MM-dd`: сервер парсит date-only
  как UTC-полночь, и окно съезжало на часовой пояс.
- `WorkOrderPage` авто-удаляет пустой наряд при уходе; `keepRef` ставится в `onMutate` **каждой**
  мутации, иначе наряд с только что добавленной строкой мог быть удалён.

## Проверки / тесты

```bash
npx tsc --noEmit && npm test && npm run lint -- --max-warnings=0 && npm run build   # backend, 188 тестов
cd client && npm run typecheck && npm run lint && npm test && npm run build          # client, 49 тестов
cd client && npx playwright test                                                     # 45 e2e
```
- **Конвенция:** чистые юниты с рукописными фейковыми репозиториями (`as never`), без
  `@nestjs/testing` и supertest. См. `users.service.spec.ts`.
- Backend: `pricing.service` (30 — включая инвариант печатного блока итогов), `work-orders.service`
  (22 — скоупинг, заморозка, копия), `work-order-lines.service` (13 — разворачивание шаблона, роли),
  `pdf/work-order-pdf.service` (18 — колонки и блоки, не байты), `price-resolution` (11),
  `calendar-blocks` (15 — пересечение интервалов, видимость), `users`, `settings`, `clients`,
  `clients-import`, `rubles-in-words`, `vehicle-label`.
- Client (vitest): `lib/format.spec.ts` и jest-спека `PricingService` читают **одну** таблицу
  `client/src/lib/pricing-fixtures.json` — расхождение зеркал роняет один из наборов.
  Таблица лежит на стороне клиента не случайно: контекст сборки клиентского образа — `./client`,
  а его `npm run build` (`tsc --noEmit && vite build`) типизирует spec-файлы, поэтому файл из корня
  репозитория сломал бы `docker build ./client`. Бэкенд читает её через `fs` (в API-образ спеки не
  попадают — `tsconfig.build.json` исключает `**/*spec.ts`). `lib/schedule.spec.ts`.
- Playwright (`client/e2e/`, все `/api/**` застабены): mobile-вёрстка + календарь
  (клик по пустому месту, протяжка панорамирует, вид резерва).
- Acceptance AC-1..10 — в `checks.md`.
- Backend tsconfig исключает `client/`.

## Конвенции

- Бизнес-логика в сервисах, контроллеры тонкие.
- `numeric` колонки отдаются числами (transformer) — API возвращает `total_cached: 2500`, не строку.
- **Ловушка `numericTransformer`:** он пишет `undefined → NULL`, поэтому `NOT NULL DEFAULT` на
  numeric-колонке никогда не срабатывает. Такие колонки либо nullable, либо задаются явно
  (см. `total_cached: 0` / `paid_amount: 0` в `create()` и `duplicate()`).
- Загруженную `ManyToOne`-связь надо `delete` перед `save`, иначе она перезапишет изменённый FK
  (`assigned_master`, `generation`).
- Многострочные вставки — в `manager.transaction` (разворачивание шаблона, копия наряда).
- Очистка nullable-поля: шли `null`, `@IsOptional()` в DTO пропускает.
- Деньги/телефоны/ID — моноширинный + `tabular-nums`. Иконки только lucide. Модалки — `<dialog>`.
- **Не запускать prettier:** конфига в проекте нет, дефолты переписывают кавычки на двойные и
  переформатируют файл целиком.
- `.agents/`, `.claude/`, `.env`, `node_modules`, `dist` — gitignored.

## Состояние (последнее)

Реализованы все 10 требований заказчика — шесть фаз, 7 миграций:

1. **Прайс по поколениям** — общий каталог работ + переопределения на поколение
   (`template_generation_prices`), экран «Прайс-лист» с выбором поколения и копированием цен между
   поколениями. `price-resolution` возвращает **источник** цены, чтобы откат к базовой не был молчаливым.
2. **Группировка работ с запчастями** — блоки в смете, разворачивание позиции прайса одним блоком
   с подтверждением (превью + чекбоксы), заказ-наряд в PDF перестроен в блоки.
3. **Копия заказ-наряда** — `POST /:id/duplicate` в транзакции; цены и блоки переносятся как есть,
   запись/номера/оплата/заморозка — нет.
4. **Запись через календарь** — клик по пустому слоту → «Новая запись» / «Резерв».
5. **Производитель запчастей** — отдельное поле в каталоге и в строке.
6. **Артикул** убран из заказ-наряда, в смете — отдельной колонкой.
7. **Марка/модель/поколение** — справочник (19 поколений MINI засеяно в миграции), свободные
   марка и модель; 10 хардкодов `MINI`/`Mini` вычищены.
8. **Каталог запчастей** с поиском по названию/артикулу/производителю + привязка к работам с ролями.
9. **Резервные записи** — отдельная таблица, без имени, видимость по ролям.
10. **Скидка на строку** — на работах и на запчастях, стекается со скидкой наряда.

Попутно исправлено: `close()` перезамораживал смету при повторном вызове; смета-PDF печатала
`Оплачено 0.00`; порядок строк «прыгал» после правки; календарь съезжал на часовой пояс;
`isEmptyWo` мог удалить наряд с только что добавленной строкой; на `task-templates` не было
guard'а (любой мастер мог снести каталог).

**Осознанный компромисс:** смета на экране показывает блоки заголовками внутри панелей «Работы»
и «Запчасти», а единым списком «работа + её запчасти подряд» они видны в PDF заказ-наряда.
Переписывание редактора сметы в один список — отдельная задача.

**Вторая итерация правок (9 пунктов заказчика), без миграций:**
- **История клиента** = импорт (`imported_deals_*`) + закрытые в CRM (`closed_orders_count/sum`,
  считаются группирующим запросом в `ClientsService`, в сущности их нет). На экране — `clientDeals()`.
- **Доска:** в «Выдана» `BOARD_CLOSED_LIMIT = 10` последних по `closed_at` — отдельный запрос с `take`,
  константа продублирована на клиенте.
- **Оба PDF печатаются в любом статусе.** Калькуляция по открытому наряду — без номера и с датой
  дня печати; `doc_number` по-прежнему присваивается только при заморозке. Шапка общая
  (`headerColumns`): логотип по центру между двумя `'*'`-колонками, реквизиты справа.
- **Шаблоны работ ведутся в «Прайс-листе»**, секции в «Настройках» больше нет. Органы записи видят
  `owner`/`master_receptionist` (`canManageCatalog`), мастер читает.
- **Каталог работ остался общим:** «работа для поколения» = шаблон + переопределение цены.
- **Каталог запчастей** правится на месте; подбор детали для работы грузит каталог целиком
  (`PART_TEMPLATES_LIMIT = 500`) и фильтрует локально — больше 500 позиций хвост обрежется.
- **Ловушка CSS:** `.unit-select` получает стрелку в `wo.css`, а не в слое `index.css` —
  unlayered-шортхенд `background` в правилах ячеек стирает `background-image` из слоя.
- **E2E:** проект Playwright — телефон; десктопные спеки ставят `test.use({ viewport, isMobile: false })`.

**Dev-база сейчас почти пуста:** 1 клиент, 0 нарядов, 3 засеянных шаблона работ, каталог запчастей
пуст. Прежнего импорта ~339 клиентов больше нет — если нужны реальные данные, импортировать заново.
