# Шоукейс-видео CRM: демо-репозиторий, demo-seed, чистые компоненты, Remotion

Дата: 2026-11-04 · Статус: дизайн согласован по секциям, ждёт ревью спеки

## 0. Цель и рамки

**Цель:** видео-шоукейс production-качества для **портфолио разработчика** (кейс-страница,
Behance, LinkedIn), собранный на Remotion с помощью Claude Code и skill `remotion-dev/skills`.

**Успех:**
- hero-видео 16:9 ≤ 40 с, версия 4:5, 6 бесшовных лупов, обложка/OG/скриншоты;
- в кадре только демо-данные из детерминированного сида; рендер воспроизводим;
- прод (`emt_service`, main деплоится ручным `git pull`) получает только безопасный
  рефакторинг без изменения поведения, покрытый тестами.

**Решения, принятые с заказчиком:**

| Вопрос | Решение |
|---|---|
| Аудитория | Портфолио разработчика → нейтральный бренд, акцент на инженерии и UX |
| Дашборда в CRM нет | Дашборд **только в демо-репо**, не подключён к роутингу приложения |
| Автопарк демо-базы | ~80% MINI (с поколением) + прочие марки |
| Где живёт работа | Гибрид: рефакторинг компонентов — PR в `emt_service` main; всё остальное — отдельный приватный `emt_showcase` |
| Регион | Россия, RUB, faker `ru` |
| Статус «отменён» | В схеме нет (`scheduled→in_progress→waiting→done→closed`), схему не меняем → отмен нет |
| Интерактивное публичное демо | Вне рамок (база к нему готова, деплой — отдельная задача) |
| Имя нейтрального бренда | Плейсхолдер **«Гараж CRM»** в zod-схеме, меняется в Studio |

**Не делаем (YAGNI):** рефакторинг `IntakeModal`, архива, настроек, импорта; нативные `<select>` не трогаем
(в видео — `FakeSelect`); дашборд не появляется в продовом приложении.

---

## 1. Репозитории

- **`SquareDealer/emt_service` (прод).** Только PR 0–7 из раздела 3 — рефакторинг в чистые view без
  изменения поведения. Каждый PR проходит полный набор проверок клиента и e2e.
- **`emt_showcase` (новый приватный).** Зеркало main + remote `upstream` → `emt_service`.
  Изменения только аддитивные (новые папки/файлы), поэтому `git merge upstream/main` остаётся без конфликтов:
  - `demo/seed/` — demo-seed и verify;
  - `client/src/features/dashboard/DashboardView.tsx` — дашборд для видео;
  - `video/` — проект Remotion, фикстуры, kit, сцены;
  - `docker-compose.demo.yml` — pg на отдельном порту (`tatarin_demo`) + api, изолировано от dev `:5544`;
  - нейтральный логотип PDF (подмена `assets/emt-logo-light-theme.png`) — единственная правка существующего файла.
- Репозиторий создаёт заказчик (из сессии создать нельзя), затем он подключается к сессии и в него
  пушится зеркало.

---

## 2. demo-seed (`emt_showcase/demo/seed/`)

### 2.1 Запуск и защита
- `npm run seed:demo` → `ts-node demo/seed/demo-seed.ts [--force] [--now=YYYY-MM-DD]`.
- `@faker-js/faker` — devDependency точной версии (в runtime-образ не попадает: `--omit=dev`).
- Отказ с ошибкой, если:
  - `NODE_ENV=production`;
  - `DATABASE_URL` не задан **явно в окружении** (dotenv иначе молча подхватит dev-базу из `.env`);
  - имя БД в `DATABASE_URL` не содержит `demo`;
  - база непустая (есть клиенты/наряды) и нет `--force`.
- Свой Nest-контекст `DemoSeedModule` через `NestFactory.createApplicationContext`: `TypeOrmModule`
  с тем же конфигом (`migrationsRun: true`) + Users, Clients, Vehicles, VehicleGenerations, WorkOrders,
  CalendarBlocks, TaskTemplates, PartTemplates, Settings. **Без** `SeedModule` (авто-сид на bootstrap) и
  `AuthModule` (требует `JWT_SECRET`).

### 2.2 Идемпотентность и детерминизм
- Повторный запуск: `TRUNCATE … RESTART IDENTITY CASCADE` по всем таблицам данных, кроме
  `vehicle_generations` (засеяны миграцией) и таблицы миграций; `ALTER SEQUENCE work_order_doc_number_seq`
  и `work_order_order_number_seq RESTART`.
- `faker.seed(42)`, `faker.setDefaultRefDate(DEMO_NOW)`.
- **`DEMO_NOW`** по умолчанию = сегодня (Europe/Moscow), фиксируется `--now`. Все даты считаются от него:
  одинаковый `--now` → идентичные данные.
- **Все UUID задаёт генератор** (faker), поэтому ID hero-сущностей стабильны между прогонами.
  `group_key` блоков — тоже детерминированные.

### 2.3 Архитектура
- `generators/*.ts` — чистые функции «rng + DEMO_NOW → план данных» без БД, юнит-тесты по конвенции
  репозитория (jest, без `@nestjs/testing`).
- `writer.ts` — тонкий слой записи.
- **Логика приложения переиспользуется, а не копируется:**
  - каталог работ/деталей, цены по поколениям, связки «работа + детали» с ролями — через сервисы
    (`TaskTemplatesService`, `PartTemplatesService`, `PriceListService.setPrice/attachPart`);
  - клиенты (`ClientsService.create` принимает `created_at`), машины — через сервисы;
  - ~800 нарядов и их строки — батч-вставка в одной транзакции (`manager`), суммы — настоящий
    `PricingService.computeTotal` (`new PricingService()`), цены строк — `PriceResolutionService`;
  - `doc_number` — `nextval('work_order_doc_number_seq')` в порядке `closed_at` (номера идут по датам);
    `total_frozen = total_cached`, `closed_at` бэкдейтится.
  - Почему не `applyTemplate` 800 раз: нельзя бэкдейтить, случайный `group_key`, ~15k запросов.
    Риск расхождения закрывает verify (2.6).
- Ловушки, учтённые в writer: `numericTransformer` пишет `undefined → NULL` — все `numeric NOT NULL`
  (`total_cached`, `paid_amount`, `rate_snapshot`, `unit_price`, `qty`, `imported_deals_sum`) задаются
  явно; `updated_at` ставится явно (иначе `CURRENT_TIMESTAMP`); у деталей шаблона обязательна цена.

### 2.4 Данные (константы вверху файла)
| Что | Объём / правило |
|---|---|
| Сотрудники | владелец, 2 мастера-приёмщика (`master_receptionist`), 3 мастера (`master`); пароли из `DEMO_PASSWORD` (обязателен) |
| Клиенты | ~150, из них ~10% юрлица/автопарки (2–6 машин); часть физлиц с 2–3 машинами; часть `csv_import` с `imported_deals_*` |
| Машины | ~200; ~80% MINI с `generation_id` по 19 поколениям миграции (годы внутри диапазона поколения), остальное — Toyota/Kia/Hyundai/VW/Skoda/Lada с реальными парами марка–модель, 2008–2024 |
| Каталог | ~60 работ (ТО, масло, колодки, диагностика, шиномонтаж, подвеска, ГРМ, сцепление, охлаждение…), ~150 деталей с производителями (Febi, INA, Elring, Mahle, Bosch, Liqui Moly, Lemförder, Sachs, NGK…), переопределения цен для ходовых поколений (R56, F56, F60…), связки работа→детали с ролями `slot` |
| Наряды | ~800 за 6 мес. до `DEMO_NOW` + ~2 недели вперёд (запланированные) |
| Резервы | несколько `calendar_blocks` (общий подъёмник, обучение) |
| Настройки | `company_*` — нейтральный бренд; `vat_rate`, расписание по умолчанию |

**Реализм:**
- Сезонность: пик шиномонтажа в октябре–ноябре (+~30%), апрель вне окна; меньше заказов в выходные;
  рост выручки 3–8% м/м; постоянные клиенты: 20% клиентов → ~50% нарядов; чеки — логнормальное
  распределение (много мелких, немного крупных).
- Ставка нормо-часа: 2000 → 2200 три месяца назад (видно snapshot ставки в старых нарядах).
- Статусы по датам: старше ~3 дней — `closed` (оплачены: `paid_amount = total`, `closed_at`, `doc_number`),
  небольшая доля `done` без оплаты; последняя неделя — `in_progress`/`waiting` («ждёт запчасть»)/`done`;
  будущее — `scheduled`; пара просроченных. `created_at ≤ scheduled_at ≤ closed_at ≤ updated_at`.
- Госномера `А123ВС 77` (только буквы АВЕКМНОРСТУХ), VIN 17 символов без I/O/Q (`WMW…` у MINI),
  пробег по возрасту машины, телефоны `+7 (555) …` (нераспределённый код). Email-колонки у клиентов нет.
- Никаких реальных персональных данных.

**Hero-сущности** (ID в конце лога):
1. Клиент с богатой историей — MINI Cooper S R56 (сюжет видео: растяжение цепи ГРМ) и вторая машина,
   ~12 визитов, `csv_import` с историей сделок.
2. Крупный наряд в работе — Countryman F60, ~15 строк в блоках, скидка строки + скидка наряда.
3. Автопарк-юрлицо — 6 MINI.
4. Плотный день `DEMO_NOW` в календаре и гарантированно свободное окно для сцены записи.
5. Аккуратный закрытый наряд для PDF.

### 2.5 Лог
Прогресс по этапам (каталог → клиенты → машины → наряды батчами → закрытие → резервы), итоговые
количества и ID hero-сущностей.

### 2.6 Проверка (`npm run seed:demo:verify` + SQL)
- Два прогона подряд проходят.
- Количества по таблицам; нет сирот.
- **Для каждого наряда `total_cached` совпадает с `WorkOrdersCoreService.recompute`** (настоящий путь
  приложения); у закрытых `total_frozen = total_cached`; `doc_number` растёт вместе с `closed_at`.
- Для каждой пары (шаблон, поколение) набор деталей совпадает с `previewTemplate` приложения.
- Распределение по статусам и месяцам (сезонность и рост видны).
- Приложение поднято на демо-базе, Playwright-скриншоты: доска, календарь, архив, карточка клиента,
  прайс-лист, hero-наряд — открываются без ошибок, данные осмысленные.
- Отчёт: что создано, количества, ID hero, как запускать, допущения.

Известная особенность продукта (не чиним): колонка «Выдана» на доске показывает все закрытые наряды
без фильтра по дате (~750 карточек). Видео использует свои фикстуры.

---

## 3. Чистые компоненты в `emt_service` main

**Цель:** чистые `*View.tsx` (props in, callbacks out) рядом со страницами; страницы остаются
контейнерами (запросы, мутации, навигация, тосты, авто-удаление) — поведение приложения не меняется.
Клиент на относительных импортах — алиас не нужен.

**Что выяснил аудит:**
- Относительного времени («3 дня назад») в UI нет; от «сейчас» зависят только `ScheduleTimeline`
  (`now` уже проп), начальный `anchor` календаря и `pickerDay` в пикерах слота.
- `lib/api.ts` читает `import.meta.env` → падает в webpack Remotion; view не должны его импортировать
  (даже транзитивно).
- `Modal` (`components/ui.tsx`) вызывает `showModal()` → top layer, игнорирует камеру; нужен `inline`.
- `.shell`/`.sidebar` — `100dvh` (высота композиции, а не окна 900).
- Корневой `tsconfig.json` подхватит `video/` при сборке бэкенда.

**PR (каждый: `cd client && npm run typecheck && npm run lint && npm test && npm run build && npx playwright test`):**

| PR | Содержание | Риск |
|---|---|---|
| 0. Страховочная сетка | Playwright-проект desktop 1440×900, `/api/**` застаблен, `timezoneId: Europe/Moscow`, фиксированные часы; aria-снапшоты доски, наряда, календаря, прайса, карточки клиента, ⌘K. Тесты `keepRef`: пустой наряд удаляется при уходе; после добавления строки / «Из прайса…» / копии / «Сохранить» — нет. Поведенческие: drag на доске → `PATCH status`, клик → переход, протяжка → панорама; перенос события → `PATCH scheduled_at`; ApplyTemplate: снятая галочка не уходит в `part_template_ids`. Прод-код не трогаем | нет |
| 1. Инфраструктура | `lib/now.tsx` (`NowProvider`/`useNow`, по умолчанию `new Date()`); `Modal inline`; селекторы `[data-hover]` рядом с `:hover`, `[data-highlight]`; `--shell-h` вместо `100dvh`; `.crm-root` в селектор `body`; проп `brand` для логотипов; чистые хелперы `navForRole`, `workOrderToEvent`, `calendarRangeLabel`, `templateTotal`, `isEmptyWo` в `lib/` + vitest; vitest `include` для `.tsx`; ESLint override: `*View.tsx` не импортирует `lib/api`, `lib/auth`, `lib/query`, `lib/toast`, `@tanstack/react-query`; `video` в `exclude` корневых tsconfig и `.dockerignore`; `ToastView` | низкий |
| 2. Календарь | `CalendarView`; `ScheduleTimeline` + `forcePreview`/`highlightId`/`hoverId`; `SlotMenu inline`. **Pan/pointer-capture и `data-di` не трогаем**, новые обёртки между сеткой и колонкой не добавляем; ключи кэша и localStorage — в контейнере | средний |
| 3. Доска | `BoardView` + экспорт `BoardCard`; пропы `overStatus`, `ghostId`, `highlightId`, `rowStyle`; класс `.board-card-drag`, `activationConstraint`, синхронизация `cols` с `!activeId`, оптимистичный drop — без изменений / в контейнере | средний |
| 4. Наряд | `WorkOrderView` (+`GroupHeader`, формы строк, `DiscountControl`, `PaidControl`, `MasterControl`), `ScheduleFields` + `SlotPickerView`. Unmount-cleanup, `woRef`/`keepRef`, `refetchOnMount: 'always'`, `onMutate` в `mUpdate` — в странице; `keep()` в `onPickTemplate`/`onDuplicate`; неконтролируемые инпуты переносятся буквально; черновики форм `draftProp ?? state`; модалки рендерит контейнер | **высокий** — отдельный PR |
| 5. Разворачивание шаблона | `ApplyTemplateView` (`preview`, `picked`, `qty`, `total`, `inline`) | низкий |
| 6. Оболочка и поиск | `AppShellView` (рефы для focus-trap), `SearchPaletteView`; таймеры, ⌘K, фокус — в контейнерах | средний (покрыт mobile e2e) |
| 7. Карточка клиента + прайс | `ClientCardView`, `PriceListView` | низкий |

**`data-demo`** добавляется в каждом PR вместе с его view (статичные имена, id — в `data-id`), например:
`nav-*`, `search-trigger`, `search-input`, `search-hit`, `timeline`, `timeline-event`, `slot-booking`,
`board-col` (+`data-status`), `board-card`, `add-from-price`, `labor-row`, `part-row`, `estimate-group`,
`wo-summary`, `wo-discount`, `wo-total`, `apply-part`, `apply-confirm`, `pl-generation`, `pl-row`,
`client-head`, `order-row`.

Риски: StrictMode дважды вызывает эффекты — не переносить место объявления эффектов; prettier не запускать.

---

## 4. Видео (`emt_showcase/video/`)

### 4.1 Бренд и тексты
Нейтральный бренд «Гараж CRM» (плейсхолдер). Тексты, бренд, тема, акцент — `defaultProps` + zod
(`@remotion/zod-types`): `brand`, `theme`, `accent`, `callouts.*`, `outro.{title,subtitle,cta}`,
`musicOffsetFrames`. Подписи — о результате и буквально правдивы.

### 4.2 Hero: ~37–40 с (сумма сцен − переходы), 1920×1080, 30 fps, 120 BPM
Клики, склейки и подписи — на кратных 15 кадрах. Сюжет — одна машина (MINI Cooper S R56, растяжение
цепи ГРМ) от записи до документа.

| # | Сцена | ~с | Что в кадре | Подпись |
|---|---|---|---|---|
| 0 | Intro | 2.5 | Бренд, две строки контекста | «Сервис по MINI: запись, смета, документы — в одном месте» |
| 1 | Booking | 6 | Неделя календаря, линия `DEMO_NOW`, клик по пустому слоту → `SlotMenu` → наряд встаёт в слот | «Свободное окно → запись в 2 клика» |
| 2 | Estimate | 9 | «+ Из прайса» (FakeSelect) → `ApplyTemplateView` (цена R56, снять масло) → блок в смете → скидка строки 10% и наряда 5%, итог CountUp | «Цена — под поколение», «Работа и её запчасти — одним блоком», «10% + 5% = 14,5%, до копейки» |
| 3 | Board | 5 | Карточка перетаскивается в «В работе» (через пропы) | «Статус — одним движением» |
| 4 | Docs | 4 | PNG настоящего PDF заказ-наряда, проезд по блокам | «Заказ-наряд в PDF — из тех же данных» |
| 5 | Search + Client | 5 | ⌘K → набор VIN → карточка клиента с историей | «Любая машина по VIN — за секунду» |
| 6 | Dashboard | 5 | Выручка по месяцам (рост), загрузка мастеров, средний чек | «Владелец видит выручку и загрузку» |
| 7 | Outro | 4 | Логотип, «NestJS · React · PostgreSQL», автор, ссылка | — |

Между сценами — `TransitionSeries` (fade/slide 15f); внутри UI — движение камеры. Длительность
композиции = сумма сцен − переходы (`calculateMetadata` от таблицы `SCENES`). Мастер с телефона — не
в hero, а в лупе.

### 4.3 Дашборд (только демо-репо)
`client/src/features/dashboard/DashboardView.tsx` — чистый view на токенах CRM, графики — простой SVG,
без новых библиотек; **не подключён к роутингу**. Данные — SQL-агрегаты демо-базы в экспорт-скрипте
(`fixtures/dashboard.json`): выручка по месяцам (`total_frozen` по `closed_at`), число нарядов,
средний чек, загрузка мастеров, топ работ.

### 4.4 Производные
- **4:5** (1080×1350, ~30 с): тот же `Showcase`, `useLayout()` выбирает `CAM.social`; zoom ≥ 1.7, одна зона
  за раз; подписи в нижней плашке (читаются без звука); без Intro и Docs.
- **Лупы** (1600×1000, 5–8 с, `LoopCrossfade` + возврат к исходному состоянию): Booking, Estimate,
  Discounts, PriceList (R56 → F56 → F60), Board, MasterMobile (композиция 390×844, пререндер в
  `public/prerender/`, встраивается `<OffthreadVideo>` в `PhoneFrame`). webm vp9 + mp4 фолбэк.
- **Стиллы:** Cover 1920×1080 `--scale=2`, OG 1200×630, README 1600×1000.

### 4.5 Архитектура
```text
video/
  package.json            # remotion и @remotion/* — одна точная версия (последняя стабильная на момент установки), react 18.3.1
  remotion.config.ts      # алиас @crm → ../client/src; дедуп react/react-dom/router/react-query/dnd-kit/lucide/date-fns
                          # на video/node_modules; NormalModuleReplacementPlugin для lib/api (страховка от import.meta.env)
  scripts/export-fixtures.ts
  public/ audio/ brand/ docs/ prerender/
  src/ Root.tsx schema.ts timing.ts (BPM, beat(n), SCENES, CLICKS) video.css fonts.ts
       providers/VideoProviders.tsx   # MemoryRouter, CSS CRM + video.css, data-theme на обёртке окна
       kit/  AppWindow Camera Cursor Highlight Callout TypeText CountUp FakeSelect PaperSheet PhoneFrame
             LoopCrossfade useLayout
       fixtures/ meta.json + *.json
       scenes/ Intro Booking Estimate Board Docs Search Dashboard Outro
       compositions/ Hero Social Loops Stills MobileMaster Debug_*
```
- `video.css` (вне `@layer`, после `index.css`): `transition/animation: none !important`,
  `caret-color: transparent`, `--shell-h: 900px`, стили `[data-highlight]`.
- Шрифты: `loadFont()` Inter (400–700) и JetBrains Mono (400, 500), сабсеты latin + cyrillic; имена
  совпадают с `--font-sans`/`--font-mono`.
- Курсор и звук кликов читают одну константу `CLICKS`.
- Рендер всегда с `TZ=Europe/Moscow` (вписано в npm-скрипты).

### 4.6 Фикстуры
`video/scripts/export-fixtures.ts` на поднятом демо-API после сида:
- логин owner и master; доска мастера — под токеном мастера (скоупинг ролей в кадре настоящий);
- календарь и резервы на неделю `DEMO_NOW` (диапазоны через `dayRangeIso`), прайс по поколениям,
  карточка клиента, поиск по каждому префиксу набираемого VIN, настройки, шаблоны;
- снимки hero-наряда `wo-hero.0…4` — реальными мутациями API **на копии** (`/duplicate`): превью шаблона,
  apply-template без масла, скидка строки, скидка наряда, статус — итоги считает бэкенд;
- PDF → PNG через `pdftoppm`;
- `meta.json`: `demoNow`, seed, `upstreamSha`;
- два экспорта подряд → `git diff --exit-code video/src/fixtures`.

### 4.7 Звук
Лицензионный трек 120 BPM (Artlist / Epidemic / Uppbeat) выбирает заказчик; до этого — плейсхолдер.
`Audio` из `@remotion/media`, громкость — функция от кадра; SFX клика/клавиши в `Sequence` на кадрах `CLICKS`.

---

## 5. Этапы (один промт на этап, проверка стоп-кадрами)

| Этап | Содержание | Проверка |
|---|---|---|
| 0 | `emt_showcase`: зеркало, `upstream`, `npx skills add remotion-dev/skills`, раздел «video» в CLAUDE.md шоукейса | `git remote -v`, skill на месте |
| 1 | PR 0–7 в `emt_service` (раздел 3), слияние в шоукейс | тесты/e2e каждого PR |
| 2 | demo-seed + verify (раздел 2) | раздел 2.6 |
| 3 | Экспорт фикстур + `DashboardView` | детерминизм фикстур, PNG PDF без «квадратиков» |
| 4 | Каркас `video/` + `Debug_*` | `npx remotion compositions`; still наряда: Inter с кириллицей, без спиннеров, сайдбар не обрезан |
| 5 | kit | `Debug_Kit` стиллы на кадрах клика +0/+3/+12 |
| 6 | Сцены 0–7, по одной на промт | стиллы ключевых кадров: ничего не обрезано, подписи не перекрывают цифры, нет пустых кадров |
| 7 | Сборка Hero, музыка, SFX | стиллы на кликах и серединах переходов; черновые `--frames=a-b` |
| 8 | 4:5, лупы, стиллы | превью 4:5 в 50% читается; лупы без скачка; чеклист гайда |

Финальный рендер: `TZ=Europe/Moscow npx remotion render Hero out/hero.mp4 --crf=16 --image-format=png`.

## 6. Риски

1. Две копии React/контекстов в бандле видео → дедуп алиасами (самая вероятная первая ошибка).
2. `showModal()`/top layer → `Modal inline`; `vh` в стилях диалога переопределить на размеры окна.
3. Медиазапросы считаются по ширине композиции → 1920/1600/1080 дают десктоп; мобильный вид — только
   отдельной композицией 390×844.
4. dnd-kit не тащится в рендере → перетаскивание собирается из пропов (`overStatus`, плавающий `BoardCard`).
5. Состояние через эффекты «догоняет» кадр → во view только управляемые пропы.
6. Часовой пояс → `TZ=Europe/Moscow` везде.
7. Расхождение upstream и шоукейса → `upstreamSha` в `meta.json`, после merge фикстуры экспортируются заново.
8. Лицензии: Remotion бесплатен для физлиц и компаний ≤ 3 человек; трек — с лицензией на соцсети/сайт.
