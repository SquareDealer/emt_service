# CLAUDE.md — Татарин CRM

CRM для СТО (MINI Cooper), один владелец-мастер, ~300 клиентов. Спека и артефакты:
`spec.md`, `data-model.md`, `plan.md`, `checks.md`. Стратегия/визуал: `PRODUCT.md`, `DESIGN.md`.

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

## Архитектура данных

Две опоры: **Vehicle** (центр учёта, с VIN) и **WorkOrder** (заказ-наряд — календарь+канбан+смета).

```
Client 1──* Vehicle 1──* WorkOrder 1──* LaborLine ──? TaskTemplate
                                     └──* PartLine
                         WorkOrder ──? User (assigned_master)
Settings(key-value: labor_rate)
```

Ключевые инварианты:
- **Snapshot ставки:** `labor_lines.rate_snapshot` копируется при добавлении строки →
  смена `labor_rate` не двигает прошлые наряды. Строка = `price_override ?? hours × rate_snapshot`.
- **Заморозка сметы:** при переходе статуса в `closed` (через `/close` ИЛИ drag в «Выдана»)
  ставится `total_frozen` + `closed_at`; при возврате из `closed` — очищается. Логика
  централизована в `WorkOrdersService.applyFreezeTransition`.
- **`total_cached`** пересчитывается сервисом при любом изменении строк/скидки (для списков).
- **Источник клиента** (`client_source`): `manual` (HTTP-создание, фиксируется сервером),
  `csv_import` (импорт), `telegram_bot` (зарезервирован). Импорт пишет `imported_deals_count/sum`
  и реальный `created_at` из CSV.
- Скидка только на уровне наряда (`discount_type` percent/fixed + `discount_value`).

Enums: `work_order_status`(scheduled→in_progress→waiting→done→closed), `discount_type`,
`user_role`(owner, расширяемо), `client_source`. Поиск: `pg_trgm` GIN по ФИО/телефону/VIN/госномеру.

## Структура backend (`src/`)

```
entities/        client, vehicle, work-order, labor-line, part-line, task-template, user, setting
migrations/      Init (всё DDL+enum+индексы), AddWorkOrderNotes, AddWorkOrderDocNumber (seq+col)
common/          phone.util, numeric.transformer, public.decorator, rubles-in-words (сумма прописью)
auth/            JWT (owner login), глобальный JwtAuthGuard + @Public() на /health, /auth/login
clients/         CRUD + import/clients-import.service (UTF-8/CP1251, ,/;, дедуп по телефону, отчёт)
vehicles/  work-orders/ (pricing.service, pdf/work-order-pdf.service, calendar, lines, close)
task-templates/  settings/ (labor_rate + company_* + vat_rate)  search/
seed/            авто-сид owner + labor_rate + шаблоны (onApplicationBootstrap, идемпотентно)
assets/fonts/    DejaVuSans[-Bold].ttf — кириллица для PDF (читаются из process.cwd() в рантайме)
```

API (всё под JWT кроме `/health`, `/auth/login`): `/clients` (+`/import`, `/:id/vehicles`),
`/vehicles`, `/work-orders` (+`/board`, `/calendar`, `/:id/labor|parts`, `/:id/status`, `/:id/close`,
`/:id/pdf` — калькуляция, только для closed), `/task-templates`, `/settings`, `/search?q=`.

- **PDF-калькуляция:** `GET /work-orders/:id/pdf` (pdfmake) рендерит «Предварительную калькуляцию»
  (образец `Васильев.pdf`) из зафиксированной сметы. `doc_number` — последовательный номер,
  присваивается при первой заморозке (`assignDocNumber`, стабилен при reopen/reclose; для
  закрытых до миграции — лениво при первой печати). НДС (`vat_rate` 0/10/20) и реквизиты
  (`company_*`) — в Settings; ставка НДС считается «в составе суммы» (`total×rate/(100+rate)`).
  Построчных скидок нет → скидка наряда идёт в «Сумма скидок».

## Структура frontend (`client/src/`)

```
lib/      api.ts (fetch+JWT), auth.tsx, types.ts, format.ts, toast.tsx, theme.ts, query.ts
components/ AppShell (sidebar+topbar), GlobalSearch (⌘K палитра), IntakeModal (клиент→авто→работа), ui.tsx (Modal/StatusPill/...)
features/  auth/ clients/(список+карточка) work-orders/(редактор сметы) board/(dnd-kit) calendar/ import/ settings/
index.css  дизайн-токены (OKLCH, light/dark via [data-theme]), компонентные классы
```

Дизайн: Linear-like (тихий/плотный/точный), стальной-синий primary + латунный accent,
светлая по умолчанию + тёмная по тумблеру. Полная спека — `DESIGN.md`. Навигация на наряд
передаёт `state.back={to,label}` → контекстный «назад» (клиент/доска/календарь).

## Проверки / тесты

```bash
npx tsc --noEmit && npm test && npm run lint -- --max-warnings=0 && npm run build   # backend
cd client && npm run typecheck && npm run lint && npm run build                       # client
```
- Unit: `pricing.service` (override/скидка/округление), `clients-import.service` (телефон/дата/дедуп/кодировка),
  `rubles-in-words` (род/склонение, копейки) — 38 тестов.
- Acceptance AC-1..10 — в `checks.md` (требует psql+jq; на этом хосте проверялось Node-скриптом).
- Backend tsconfig исключает `client/` (иначе root-tsc подхватывает .tsx).

## Конвенции

- Бизнес-логика в сервисах, контроллеры тонкие (бот/импорт переиспользуют сервисы).
- `numeric` колонки отдаются числами (transformer) — API возвращает `total_cached: 2500`, не строку.
- Очистка nullable-поля: шли `null`, `@IsOptional()` в DTO пропускает (title/notes так чистятся).
- Деньги/телефоны/ID — моноширинный + `tabular-nums`. Иконки только lucide. Модалки — нативный `<dialog>`.
- `.agents/`, `.claude/`, `.env`, `node_modules`, `dist` — gitignored.

## Вне MVP (модель готова, фич нет)

Telegram-бот (вызовет сервисы, `source=telegram_bot`), отчёты выручки (`total_frozen` + `imported_*`),
каталог деталей (`catalog_number`), доп. роли/мастера (`user_role` + `assigned_master_id` уже есть).
PDF-калькуляция — **реализована** (см. выше). Не охвачено в PDF: учёт оплат (Оплачено всегда 0.00),
рекомендованные работы/запчасти (пустые таблицы), логотип-картинка (текстовая шапка «STO»).

## Состояние сессии (последнее)

- **PDF-калькуляция:** кнопка «Сгенерировать отчёт» в редакторе закрытого наряда → скачивает
  PDF (`GET /:id/pdf`, pdfmake + DejaVu). Номер `doc_number` (миграция+sequence). Реквизиты
  компании + ставка НДС — на экране Настройки. E2E проверено: кириллица, НДС-блок, сумма
  прописью, 400 для незакрытого. Проверка `node dist/main.js` + миграция на старте.
- Построены backend + frontend целиком; пройден adversarial-review (8 находок исправлено:
  fail-fast JWT-секрет, заморозка при drag-close, и др.).
- UX-фиксы наряда: кнопка «Сохранить» (toast+назад) над «Закрыть и зафиксировать»; контекстный
  «назад»; поле «Заметки» (миграция `AddWorkOrderNotes`); авто-удаление пустого наряда при уходе +
  кнопка удаления с подтверждением; карточки доски тянутся за любую часть.
- Экран «Клиенты»: фильтр по источнику + сортировка (дата ↑↓, по сделкам истории).
- **Dev-база содержит реальный импорт ~339 клиентов** + демо-наряды по статусам. Это не fixtures —
  при необходимости чистить руками.
- Скриншоты снимались через CDP (headless chrome из `~/.cache/puppeteer`, Node global WebSocket),
  т.к. puppeteer-модуля нет. Подробности окружения — в memory `dev-environment`.
