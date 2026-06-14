# Plan: CRM для СТО (MINI Cooper) — MVP

**Spec:** [spec.md](./spec.md) · **Data model:** [data-model.md](./data-model.md)
**Total estimate:** ~6–9 рабочих дней (соло)
**Start date:** TBD

Стек: NestJS + Postgres (бэк), React (фронт). Пути — ориентир.

---

## Phase 0 — Setup

| # | Task | Files | Est | Notes |
|---|---|---|---|---|
| 0.1 | Инициализация NestJS, env, подключение Postgres (TypeORM/Prisma) | `src/app.module.ts`, `.env`, схема ORM | S | |
| 0.2 | `pg_trgm` + миграция со всеми таблицами и enum (вкл. `client_source`) | миграции | M | DDL в data-model.md |
| 0.3 | Минимальный AuthModule (одна роль, структура под расширение), guard | `src/auth/*`, `src/users/*` | M | JWT |
| 0.4 | Сидер: 1 user, ставка `labor_rate`, пара TaskTemplate | `src/seed/*` | S | |

---

## Phase 1 — Core

| # | Task | Files | Est | Notes |
|---|---|---|---|---|
| 1.1 | ClientsModule: CRUD клиента (ФИО, телефон, **source**, скидка по умолч.), нормализация телефона | `src/clients/*` | M | AC-1, AC-10 |
| 1.2 | VehiclesModule: CRUD ТС, несколько на клиента | `src/vehicles/*` | M | AC-2 · ⚠️ BLOCKED BY: 1.1 |
| 1.3 | WorkOrdersModule: создание/чтение наряда, статус, `scheduled_at` | `src/work-orders/*` | L | AC-3 · ⚠️ BLOCKED BY: 1.2 |
| 1.4 | Строки labor_lines + part_lines (CRUD внутри наряда) | `src/work-orders/lines/*` | M | AC-4 · ⚠️ BLOCKED BY: 1.3 |
| 1.5 | Расчёт сметы: snapshot ставки, override, шаблон, скидка наряда, `total_cached` | `src/work-orders/pricing.service.ts` | M | AC-4, AC-5, AC-8 |
| 1.6 | TemplatesModule: CRUD шаблонов, подстановка в строку | `src/task-templates/*` | S | AC-5 |
| 1.7 | **CSV-импорт клиентов**: парс UTF-8/CP1251 + `,`/`;`, маппинг, дата, дедуп по телефону, отчёт | `src/clients/import/*` | M | AC-9 · ⚠️ BLOCKED BY: 1.1 · нужен для миграции базы |

---

## Phase 2 — Integration (вьюхи + фронт)

| # | Task | Files | Est | Notes |
|---|---|---|---|---|
| 2.1 | Endpoint календаря (наряды по диапазону `scheduled_at`) | `src/work-orders/calendar.controller.ts` | S | AC-3 |
| 2.2 | Endpoint канбана + `PATCH /:id/status` | `src/work-orders/*` | S | AC-6 |
| 2.3 | Поиск: trgm/ILIKE по ФИО/тел/VIN/госномеру | `src/search/*` | S | AC-7 |
| 2.4 | Фронт: воркфлоу «клиент → авто → работа» | `client/src/features/intake/*` | L | AC-1..4 |
| 2.5 | Фронт: канбан drag-drop (dnd-kit) | `client/src/features/board/*` | M | AC-6 |
| 2.6 | Фронт: календарь (FullCalendar/свой) | `client/src/features/calendar/*` | M | AC-3 |
| 2.7 | Фронт: глобальный поиск + карточка | `client/src/features/search/*` | S | AC-7 |
| 2.8 | Фронт: загрузка CSV + превью отчёта импорта | `client/src/features/import/*` | S | AC-9 |

---

## Phase 3 — Polish

| # | Task | Files | Est | Notes |
|---|---|---|---|---|
| 3.1 | Заморозка `total_frozen` + `closed_at` при закрытии наряда | `src/work-orders/*` | XS | AC-8 |
| 3.2 | Скидка наряда в UI + предзаполнение из клиента | `client/src/features/...` | S | AC-4 |
| 3.3 | Валидация/ошибки/пустые состояния, базовое логирование | разн. | S | NFR |
| 3.4 | Ежедневный бэкап Postgres (cron/скрипт) | `ops/backup.sh` | XS | NFR |

---

## Phase 4 — Verify

| # | Task | Files | Est | Notes |
|---|---|---|---|---|
| 4.1 | Прогнать все проверки | `checks.md` | XS | Все exit 0 |
| 4.2 | Демо владельцу на реальной базе (импорт + 2–3 работы) | — | S | |

---

## Future (вне MVP — архитектура готова, фичи позже)

| Модуль | Зацепка в ядре | Est |
|---|---|---|
| Документы (PDF: заказ-наряд/акт) | рендер из `WorkOrder`+строк, **без миграции** | M |
| Telegram-бот (запись) | вызывает `ClientsService`/`WorkOrderService`, проставляет `source='telegram_bot'` | L |
| Отчёты (выручка, топ клиентов) | `total_frozen` + `imported_*` за период | M |
| Выгрузка выручки в Тинькофф | формат экспорта поверх отчётов | S |
| Каталог/склад деталей | линк по `catalog_number` | XL |
| Доп. роли / второй мастер | `user_role` enum + `assigned_master_id` уже есть | M |

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| «Простой, но масштабируемый» → оверинжиниринг | High | Med | Только фичи MVP; «масштаб» = модель + границы, не инфраструктура. Бот/документы/каталог — строго Future |
| Грязный CSV из старой системы (кодировка/разделитель/даты/дубли) | High | Med | Парсер UTF-8/CP1251 + `,`/`;`, нормализация телефона, дедуп, отчёт по битым строкам |
| Ретрофит ролей/мастеров | Med | High | `users`+`role`+`assigned_master_id` с Phase 0 |
| Итоги «едут» при смене ставки | Med | High | `rate_snapshot` + `total_frozen` (в модели) |
| Скоуп-крип в учёт запчастей | Med | Med | Жёстко: «запчасть = строка стоимости» |

---

## Estimate legend

| Label | Time |
|---|---|
| XS | < 30 мин |
| S | ~1 час |
| M | 2–4 часа |
| L | ~1 день |
| XL | 2+ дня |
