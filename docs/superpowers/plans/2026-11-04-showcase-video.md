# Шоукейс-видео на Remotion — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** в репозитории `emt_showcase` собрать проект `video/` на Remotion, который из настоящих view-компонентов CRM и фикстур демо-базы рендерит hero 16:9, версию 4:5, 6 лупов и стиллы.

**Architecture:** сцены — React-компоненты, которые рендерят чистые `*View` из `client/src` (алиас `@crm`) внутри `AppWindow` 1440×900 под `Camera`; всё движение и смена данных — функции от `useCurrentFrame()`. Данные — JSON-фикстуры, которые скрипт экспорта снимает с демо-API после сида (суммы считает бэкенд). Тайминги, клики и подписи живут в одной таблице `timing.ts`; тексты и бренд — в zod-`defaultProps`.

**Tech Stack:** Remotion 4 (`remotion`, `@remotion/cli`, `@remotion/transitions`, `@remotion/media`, `@remotion/google-fonts`, `@remotion/zod-types` — одна точная версия), React 18.3.1, TypeScript, zod, Vitest (чистая математика kit), tsx (скрипт экспорта), `pdftoppm` (poppler-utils).

**Spec:** `docs/superpowers/specs/2026-11-04-crm-showcase-design.md` — разделы 1, 4, 5, 6.

**Зависит от:** плана `2026-11-04-pure-views.md` (все View, `NowProvider`, `Modal inline`, `Brand`, ESLint-правило, `exclude video`) — смёрджен в `emt_service` main и подтянут в шоукейс; плана `2026-11-04-demo-seed.md` (`npm run seed:demo`, `docker-compose.demo.yml`, модуль `demo/seed/hero.ts` с `HERO`).

## Global Constraints

- Репозиторий `emt_showcase` (зеркало `emt_service` + remote `upstream`); изменения только аддитивные, кроме подмены `assets/emt-logo-light-theme.png`.
- Все `remotion` и `@remotion/*` — **одна точная версия без `^`** (последняя стабильная на момент установки; записать в `video/package.json`); `react`/`react-dom` 18.3.1.
- 30 fps; hero 1920×1080; social 1080×1350; лупы 1600×1000; mobile 390×844; окно CRM 1440×900.
- 120 BPM → `FRAMES_PER_BEAT = 15`; клики, склейки, появление подписей — на кратных 15 кадрах (в абсолютной шкале hero).
- Переходы между сценами — 15 кадров; длительность композиции = Σ сцен − Σ переходов (через `calculateMetadata`).
- Анимации только от `useCurrentFrame()`; запрещены CSS `transition/animation`, `setTimeout`, `Math.random()`, `Date.now()`, `new Date()` без аргумента (используется `DEMO_NOW` из `fixtures/meta.json`, `random('seed')` из remotion).
- Рендер всегда с `TZ=Europe/Moscow` (вписано в npm-скрипты).
- Бренд по умолчанию `«Гараж CRM»`; подписи — о результате, буквально правдивы: `«Свободное окно → запись в 2 клика»`, `«Цена — под поколение»`, `«Работа и её запчасти — одним блоком»`, `«10% + 5% = 14,5%, до копейки»`, `«Статус — одним движением»`, `«Заказ-наряд в PDF — из тех же данных»`, `«Любая машина по VIN — за секунду»`, `«Владелец видит выручку и загрузку»`; intro `«Сервис по MINI: запись, смета, документы — в одном месте»`; outro `«NestJS · React · PostgreSQL»`.
- В кадре только демо-данные сида.
- Сцены не импортируют `lib/api`; если что-то транзитивно его тянет — сборка всё равно не падает благодаря `NormalModuleReplacementPlugin` (страховка), но это баг, который надо чинить.

## Review Focus

1. **Повторный экспорт фикстур на другой день** — при том же `--now` фикстуры идентичны (`git diff --exit-code video/src/fixtures`); без `--now` сид и экспорт берут сегодняшний день и `meta.json.demoNow` меняется — видео остаётся согласованным, потому что всё время берётся из `meta.json`. Тест — Task 3.
2. **Рендер на машине в другом часовом поясе** — время событий в календаре не сдвигается, т.к. npm-скрипты задают `TZ`. Проверка — Task 4 (still под `TZ=UTC` через npm-скрипт совпадает с `Europe/Moscow`).
3. **Кадр, отрендеренный не по порядку / дважды** — один и тот же кадр даёт одинаковый PNG. Тест — Task 5 (`renderStill` кадра 45 дважды → одинаковый хэш; вычисления kit — чистые функции с юнит-тестами).
4. **Длинные русские значения** (ФИО, названия работ, суммы с пробелами) не обрезаются и не перекрываются подписью. Проверка — стиллы каждой сцены (Tasks 7–14).
5. **Клик и звук рассинхронизированы** — звуки берутся из того же массива `CLICKS`, что и курсор. Тест — Task 6 (`clicksAbsolute()` = позиции `<Sequence>` звука).

---

## File Structure

```text
emt_showcase/
  CLAUDE.md                          M  раздел «video»
  assets/emt-logo-light-theme.png    M  нейтральный логотип (PDF)
  client/src/features/dashboard/
    DashboardView.tsx                C  чистый дашборд на токенах CRM, SVG-графики
    dashboard.css                    C
    types.ts                         C  DashboardData
    DashboardView.view.spec.tsx      C
  video/
    package.json  tsconfig.json  remotion.config.ts  vitest.config.ts
    scripts/export-fixtures.ts       экспорт JSON + PNG документов
    scripts/dashboard.sql            агрегаты для дашборда
    public/audio/  public/brand/  public/docs/  public/prerender/
    src/index.ts  Root.tsx  schema.ts  timing.ts  fonts.ts  video.css
    src/providers/VideoProviders.tsx  src/providers/mockApi.ts
    src/fixtures/  meta.json  *.json  index.ts
    src/kit/  math.ts (+spec)  AppWindow  Camera  Cursor  Highlight  Callout  TypeText  CountUp
              FakeSelect  PaperSheet  PhoneFrame  LoopCrossfade  useLayout  Background  BrandMark
    src/scenes/  Intro  Booking  Estimate  Board  Docs  Search  Dashboard  Outro
    src/compositions/  Hero  Social  Loops  Stills  MobileMaster  Debug
```

---

### Task 1: подготовка шоукейс-репозитория

**Files:**
- Modify: `CLAUDE.md`, `assets/emt-logo-light-theme.png`; Create: `.claude/skills/` (skill Remotion)

- [ ] **Step 1:** Пользователь создаёт пустой приватный `emt_showcase`; подключить к сессии (`add_repo`). Залить зеркало: `git clone --mirror` `emt_service` → push в `emt_showcase`; в рабочем клоне `git remote add upstream <emt_service>`; `git fetch upstream && git merge upstream/main` — fast-forward.
- [ ] **Step 2:** `npx skills add remotion-dev/skills`; т.к. `.claude/` в `.gitignore`, добавить исключение `!.claude/skills/` в `.gitignore` шоукейса (только здесь) и закоммитить skill.
- [ ] **Step 3:** Подменить `assets/emt-logo-light-theme.png` нейтральным логотипом «Гараж CRM» (тот же размер и пропорции, PNG). Проверка: `npm run build && node dist/main.js` на демо-базе → `GET /api/work-orders/:id/order-pdf` рендерит новый логотип.
- [ ] **Step 4:** В `CLAUDE.md` раздел «Video»: синк с upstream (`git fetch upstream && git merge upstream/main`, после — перегенерировать фикстуры), команды `seed:demo`, `fixtures`, `studio`, `render:*`, правила детерминизма.
- [ ] **Step 5: Commit** — `chore(showcase): upstream remote, remotion skill, neutral PDF logo`.

### Task 2: `DashboardView`

**Files:**
- Create: `client/src/features/dashboard/{DashboardView.tsx,dashboard.css,types.ts,DashboardView.view.spec.tsx}`

**Interfaces:**
- Produces:
  ```ts
  export interface DashboardData {
    month: string;                               // 'ноябрь 2026'
    kpi: { revenue: number; orders: number; avgTicket: number; revenueDeltaPct: number };
    revenueByMonth: { month: string; revenue: number }[];   // 6 точек, по возрастанию даты
    masterLoad: { name: string; hours: number; capacityHours: number }[];
    topWorks: { name: string; count: number; revenue: number }[];          // 5 строк
  }
  export function DashboardView(props: { data: DashboardData; progress?: number; highlight?: 'revenue' | 'load' | 'top' }): JSX.Element
  ```
  `progress` ∈ [0,1] — доля «вырастания» столбцов/полос (по умолчанию 1); графики — inline SVG, цвета — токены CRM (`--primary`, `--accent`), числа — `money()`/`tabular-nums`. Не подключается к роутингу.
- [ ] **Step 1: Тесты**: `kpi.revenue` выводится через `money()`; 6 столбцов `<rect data-demo="rev-bar">`; при `progress=0.5` высота последнего столбца = половина высоты при `progress=1`; `highlight='load'` → `data-highlight` на блоке загрузки.
- [ ] **Step 2:** FAIL → реализовать → PASS (`cd client && npm test && npm run lint && npm run typecheck`).
- [ ] **Step 3: Commit** — `feat(showcase): DashboardView for the video`.

### Task 3: экспорт фикстур

**Files:**
- Create: `video/scripts/export-fixtures.ts`, `video/scripts/dashboard.sql`, `video/src/fixtures/index.ts`; npm-скрипт `fixtures` в `video/package.json`

**Interfaces:**
- Consumes: `HERO`, `heroSchedule(demoNow)` из `demo/seed/hero.ts` (поля: `HERO.client.id`, `HERO.r56.{vehicleId,vin}`, `HERO.diagnosticsOrderId`, `HERO.pdfOrderId`, `HERO.masterId`, `HERO.templates.timingChain`, `HERO.parts.oil5w30`, `heroSchedule().freeSlot = { startsAt: Date; durationMin: 120 }`); `dayRangeIso` из `client/src/lib/schedule.ts`; `DashboardData` (Task 2).
- Produces (файлы в `video/src/fixtures/`, `index.ts` типизирует их типами из `@crm/lib/types`):
  - `meta.json` `{ demoNow: string; seed: number; upstreamSha: string; exportedAt: string }` — `exportedAt = demoNow` (не реальное время).
  - `settings.json`, `users.json`, `generations.json`, `templates.json`;
  - `calendar.week.json` (`WorkOrder[]`), `blocks.week.json` — неделя `demoNow`;
  - `board.owner.json`, `board.master.json` — `/work-orders/board` под токенами owner и мастера; колонка `closed` усечена до 6 последних по `closed_at` (иначе ~750 карточек);
  - `price-list.{base,R56,F56,F60}.json`;
  - `client-hero.json` `{ client, vehicles, orders }`;
  - `search/<prefix>.json` для каждого префикса `HERO.r56.vin` длиной 1..7;
  - `wo-hero.0.json … wo-hero.4.json`, `template-preview.json`;
  - `dashboard.json` (`DashboardData`);
  - `public/docs/order-pdf.png`, `public/docs/smeta.png` (`pdftoppm -r 200 -png -singlefile`).
- Алгоритм снимков героя: `POST /work-orders/:HERO.diagnosticsOrderId/duplicate` (закрытая «Диагностика двигателя» по R56 с рекомендацией заменить цепь) → копия; `PATCH` копии `{ title: 'Замена цепи ГРМ + ТО', scheduled_at: freeSlot.startsAt, scheduled_duration_min: 120, assigned_master_id: HERO.masterId }`; `GET` → `wo-hero.0`; `GET template-preview` (шаблон `HERO.templates.timingChain`) → `template-preview.json`; `POST apply-template` без `HERO.parts.oil5w30` → `wo-hero.1`; `PATCH` строки комплекта цепи `discount_type:'percent', discount_value:10` → `wo-hero.2`; `PATCH` наряда `discount_type:'percent', discount_value:5` → `wo-hero.3`; `PATCH /status in_progress` → `wo-hero.4`. Смета-PDF — с закрытого `HERO.pdfOrderId`; заказ-наряд PDF — с копии после `wo-hero.4`. Копию удалить в конце.
- Нормализация для детерминизма: id копии и её строк заменяются на стабильные `hero-copy`, `hero-line-<n>` (по порядку `group_sort, sort`); `created_at/updated_at` копии и строк → `demoNow`.
- [ ] **Step 1: Тест детерминизма** (shell, в README и как npm-скрипт `fixtures:check`): `npm run seed:demo -- --force --now=2026-11-18 && npm run fixtures && git add -A video/src/fixtures && npm run seed:demo -- --force --now=2026-11-18 && npm run fixtures && git diff --exit-code video/src/fixtures` → exit 0.
- [ ] **Step 2:** Инварианты (vitest `video/src/fixtures/fixtures.spec.ts`): `wo-hero.3.total_cached === orderTotal(wo-hero.3)` (`@crm/lib/format`); в `board.master.json` все наряды с `assigned_master_id === HERO.masterId`; в `calendar.week.json` нет события, пересекающего `heroSchedule(demoNow).freeSlot`; `dashboard.revenueByMonth.length === 6`; суммы `revenueByMonth` растут ≥ 4 из 5 переходов.
- [ ] **Step 3:** Реализовать скрипт (tsx, `fetch`, `DEMO_API_URL`, логины из `DEMO_PASSWORD`), прогнать, открыть оба PNG через Read — кириллица и новый логотип на месте.
- [ ] **Step 4: Commit** — `feat(video): fixture exporter from demo API`.

### Task 4: каркас `video/`

**Files:**
- Create: `video/{package.json,tsconfig.json,remotion.config.ts,vitest.config.ts}`, `src/{index.ts,Root.tsx,fonts.ts,video.css}`, `src/providers/{VideoProviders.tsx,mockApi.ts}`, `src/kit/AppWindow.tsx`, `src/compositions/Debug.tsx`

**Interfaces:**
- Produces:
  - `remotion.config.ts`: `Config.overrideWebpackConfig` (или `overrideBundlerConfig`, если есть в типах) — `resolve.alias['@crm'] = ../client/src`; алиасы `react`, `react-dom`, `react/jsx-runtime`, `react-router-dom`, `@tanstack/react-query`, `lucide-react`, `date-fns`, `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` → `video/node_modules/<pkg>`; `NormalModuleReplacementPlugin(/client[\\/]src[\\/]lib[\\/]api(\.ts)?$/, mockApi.ts)`; `DefinePlugin({ 'import.meta.env': '{}' })`. Те же пакеты в `video/package.json` тех же версий, что в `client/package.json`.
  - `tsconfig.json`: `paths` `@crm/*` и `react` → `video/node_modules`; `jsx: react-jsx`, `moduleResolution: bundler`, `strict`.
  - `VideoProviders({ theme, children }: { theme: 'light' | 'dark'; children: ReactNode })` — `MemoryRouter`, `NowProvider value={new Date(meta.demoNow)}`, импорт `@crm/index.css` затем `video.css`.
  - `AppWindow({ theme, scale = 1, route = '/board', children }: { theme: 'light'|'dark'; scale?: number; route?: string; children: ReactNode })` — `div.crm-root[data-theme]` 1440×900, `overflow:hidden`, радиус 16, тень; `MemoryRouter initialEntries={[route]}` внутри (активный пункт меню).
  - `video.css` (вне `@layer`): `*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}`, `.crm-root{--shell-h:900px}`, `.crm-root [data-highlight]{outline:2px solid var(--accent);outline-offset:2px}`.
  - `fonts.ts`: `loadFont()` Inter `['400','500','600','700']`, JetBrains Mono `['400','500']`, `subsets: ['latin','cyrillic']`; `waitUntilDone` через `delayRender`.
  - Композиции `Debug_Board`, `Debug_WorkOrder`, `Debug_Calendar`, `Debug_Dashboard` (1920×1080, 1 кадр): соответствующий View с фикстурой в `AppShellView` (бренд «Гараж CRM») в `AppWindow`.
  - npm-скрипты: `studio`, `still`, `render`, все с префиксом `TZ=Europe/Moscow` (через `cross-env`).
- [ ] **Step 1:** `npx create-video@latest video` (Blank) → привести к структуре; `npx remotion add @remotion/transitions @remotion/media @remotion/google-fonts @remotion/zod-types`; убрать `^` у всех `remotion`/`@remotion/*`; `npx remotion versions` — одна версия.
- [ ] **Step 2:** Реализовать конфиг, провайдеры, `AppWindow`, `Debug_*`.
- [ ] **Step 3: Проверка:** `npx tsc --noEmit` PASS; `npx remotion compositions` перечисляет 4 Debug; `npm run still -- Debug_WorkOrder out/check/wo.png` и остальные три; открыть PNG через Read: шрифт Inter с кириллицей, низ сайдбара виден, нет спиннеров/скелетонов, суммы с «₽», логотип «Гараж CRM». Повторить `Debug_Calendar` с `TZ=UTC` в env поверх скрипта — PNG совпадает (скрипт перебивает TZ).
- [ ] **Step 4:** Корневые `tsc --noEmit` и `npm run build` бэкенда, `cd client && npm run build` — PASS (video исключён).
- [ ] **Step 5: Commit** — `feat(video): remotion scaffold rendering real CRM views`.

### Task 5: kit

**Files:**
- Create: `video/src/kit/{math.ts,math.spec.ts,Camera.tsx,Cursor.tsx,Highlight.tsx,Callout.tsx,TypeText.tsx,CountUp.tsx,FakeSelect.tsx,PaperSheet.tsx,PhoneFrame.tsx,LoopCrossfade.tsx,useLayout.ts,Background.tsx,BrandMark.tsx}`, `src/compositions/Debug.tsx` (+`Debug_Kit`)

**Interfaces:**
- Produces (`math.ts`, всё чистое, время — в секундах, координаты — в пикселях UI 1440×900):
  - `type CamKey = { at: number; x: number; y: number; zoom: number }`; `cameraAt(frame: number, fps: number, keys: CamKey[]): { x: number; y: number; zoom: number }` — `interpolate` с `Easing.bezier(0.65, 0, 0.35, 1)`, clamp с обеих сторон.
  - `type CursorPoint = { at: number; x: number; y: number }`; `cursorAt(frame, fps, path: CursorPoint[]): { x: number; y: number }` — `Easing.inOut(Easing.cubic)`.
  - `clickState(frame: number, clickFrames: number[], fps: number): { press: number; ring: number }` — `press` 1→0.82→1 за 6 кадров, `ring` = `spring({damping:200})` первые 18 кадров, иначе 0.
  - `typed(frame: number, startFrame: number, text: string, framesPerChar = 5): string`.
  - `countUp(frame: number, fromFrame: number, toFrame: number, from: number, to: number): number` — округление до копеек, clamp.
- Компоненты: `Camera({ keys, children })`, `Cursor({ path, clicks /* абсолютные кадры сцены */ })`, `Highlight({ rect: {x,y,w,h}, appearAt: number })` (затемнение `boxShadow 0 0 0 9999px rgba(0,0,0,.45)` + spring), `Callout({ text, at, anchor: {x,y}, side: 'left'|'right'|'top'|'bottom' })` (латунная точка, Inter 600, размер шрифта от `useLayout()`), `TypeText`, `CountUp({ from, to, fromFrame, toFrame })` → `money()`, `FakeSelect({ rect, options: string[], openAt: number, pickIndex: number, pickAt: number })`, `PaperSheet({ src, appearAt })` (`<Img src={staticFile()}>`), `PhoneFrame({ src })` (`<OffthreadVideo>`), `LoopCrossfade({ durationInFrames, overlap = 10, children })`, `useLayout(): 'wide' | 'social'` (по `width < height`), `Background`, `BrandMark({ name })`.
- [ ] **Step 1: Тесты** `math.spec.ts`:
  - `cameraAt(0, 30, keys)` = первый ключ; на `at` второго ключа = второй ключ; до первого и после последнего — clamp.
  - `clickState(f, [30], 30)`: f=29 → `{press:1, ring:0}`; f=33 → `press ≈ 0.82`; f=36 → `press 1`; f=48 → `ring 0`.
  - `typed(10, 0, 'WMW', 5) === 'WM'`; `typed(-1, 0, 'WMW') === ''`.
  - `countUp(15, 0, 30, 0, 100) === 50`; `countUp(99, 0, 30, 0, 100.555) === 100.56`.
  - Детерминизм: `cameraAt(45, …)` дважды — равны.
- [ ] **Step 2:** FAIL → реализовать `math.ts` → PASS (`cd video && npx vitest run`).
- [ ] **Step 3:** Компоненты + `Debug_Kit` (камера, курсор с кликом на 30, подсветка, подпись, CountUp, FakeSelect, TypeText на одном экране, 90 кадров).
- [ ] **Step 4: Проверка:** стиллы `Debug_Kit` на кадрах 30, 33, 42 — кольцо клика растёт, курсор сжат на 33; `still` кадра 45 дважды → `sha256sum` совпадает (Review Focus 3).
- [ ] **Step 5: Commit** — `feat(video): kit (camera, cursor, highlight, callout, counters)`.

### Task 6: тайминги, схема, Root

**Files:**
- Create: `video/src/timing.ts`, `timing.spec.ts`, `video/src/schema.ts`; Modify: `video/src/Root.tsx`

**Interfaces:**
- Produces:
  - `export const FPS = 30, BPM = 120, FRAMES_PER_BEAT = 15, TRANSITION = 15;`
  - `export const SCENES = [{ id: 'intro', dur: 75 }, { id: 'booking', dur: 180 }, { id: 'estimate', dur: 270 }, { id: 'board', dur: 150 }, { id: 'docs', dur: 120 }, { id: 'search', dur: 150 }, { id: 'dashboard', dur: 150 }, { id: 'outro', dur: 120 }] as const;`
  - `sceneStart(id: SceneId, scenes = SCENES): number` = Σ dur предыдущих − `TRANSITION` × индекс; `totalDuration(scenes = SCENES): number` = Σ dur − `TRANSITION` × (n−1) → **1110** для hero.
  - `export const SCENE_CLICKS: Record<SceneId, number[]>` — локальные кадры кликов (значения — в задачах сцен); `clicksAbsolute(scenes = SCENES): number[]`.
  - `export const SCENES_SOCIAL` — без `intro` и `docs`, `booking.dur = 150`.
  - `schema.ts`: `showcaseSchema = z.object({ brand: z.object({ name: z.string() }), theme: z.enum(['light','dark']), accent: zColor(), callouts: z.object({ intro, booking, generation, block, discounts, board, docs, vin, dashboard }), outro: z.object({ title, subtitle, cta }), musicOffsetFrames: z.number().int() })` с defaultProps = тексты из Global Constraints, `brand.name = 'Гараж CRM'`, `outro.title = 'NestJS · React · PostgreSQL'`, `theme: 'light'`.
  - `Root.tsx`: `Hero` 1920×1080, `HeroSocial` 1080×1350 — `calculateMetadata` от `totalDuration`; `Loop*` 1600×1000; `MobileMaster` 390×844; `Debug_*`; стиллы.
- [ ] **Step 1: Тесты**: `totalDuration() === 1110`; `sceneStart('booking') === 60`; каждый элемент `clicksAbsolute()` кратен 15; `sceneStart` каждой сцены кратен 15.
- [ ] **Step 2:** FAIL → реализовать → PASS; `npx remotion compositions` показывает `Hero` с 1110 кадрами.
- [ ] **Step 3: Commit** — `feat(video): timing table, props schema, compositions`.

---

### Сцены (Tasks 7–14)

Общий шаблон каждой сцены (файл `video/src/scenes/<Name>.tsx`, экспорт `<Name>Scene(props: ShowcaseProps)`; композиция `Debug_<Name>` длиной сцены добавляется в `Debug.tsx`):

- [ ] **Step 1:** Добавить локальные клики сцены в `SCENE_CLICKS`; тест `timing.spec.ts`: абсолютные клики сцены кратны 15 → FAIL, пока не добавлены.
- [ ] **Step 2:** Реализовать сцену по таблице задачи: данные — только фикстуры, состояние — функция от кадра.
- [ ] **Step 3: Проверка:** `npm run still -- Debug_<Name> out/check/<name>-<f>.png --frame=<f>` для перечисленных кадров; открыть каждый PNG: ничего не обрезано, подпись не перекрывает цифры, текст читается, нет пустых кадров, клик попадает в целевой элемент (`data-demo`).
- [ ] **Step 4: Commit** — `feat(video): <name> scene`.

Координаты целей снимаются один раз в Studio по `data-demo` и записываются константами в начале файла сцены. Кадры ниже — локальные.

### Task 7: Intro (75 f)
Фон `Background` (тёмный градиент), `BrandMark` на 0–15, строка `callouts.intro` появляется на 15 (spring снизу), латунная черта на 30. Стиллы: 0, 20, 60.

### Task 8: Booking (180 f)
`CalendarView` (неделя, vertical) с `calendar.week.json` → `workOrderToEvent`, `blocks.week.json` → `blockToEvent`, `now = demoNow`. Камера: общий план 0–30 → наезд на `heroSchedule(demoNow).freeSlot` к 60 (zoom 1.7). Курсор к слоту; **клик 75** → `selection` = призрак 14:00–16:00, `SlotMenu inline` с 82; подпись `callouts.booking` на 90; **клик 105** по `slot-booking` → меню скрыто, событие героя добавлено в `events` и «встаёт» spring-ом с 120; 150–180 камера ныряет в событие (zoom 2.6). Стиллы: 30, 75, 90, 135, 175.

### Task 9: Estimate (270 f)
`WorkOrderView` со снимками `wo-hero.0…4`. 0–30 общий план (zoom 1.15). **Клик 45** `add-from-price` → `FakeSelect` открыт, **клик 75** по «Замена цепи ГРМ (R56/N14)» → `ApplyTemplateView inline` с `template-preview.json` (spring с 80); `Highlight` строки работы + подпись `callouts.generation` на 90; **клик 120** по чекбоксу масла (picked без масла, `CountUp` суммы кнопки от `templateTotal(all)` к `templateTotal(без масла)`); подпись `callouts.block` на 135; **клик 150** `apply-confirm` → данные `wo-hero.1`, новые строки через `rowStyle` (stagger 3 f, opacity + сдвиг 8 px), `ToastView` «Блок добавлен в смету» 155–200; 180 камера на `wo-summary` (zoom 1.8); 195 → `wo-hero.2` (ячейка скидки подсвечена); 210 `TypeText` «5» в `wo-discount` → `wo-hero.3` на 225; `CountUp` итога `orderTotal(wo-hero.2) → orderTotal(wo-hero.3)` 225–255; подпись `callouts.discounts` на 225. Стиллы: 45, 90, 125, 165, 200, 240, 265.

### Task 10: Board (150 f)
`BoardView` с `board.owner.json`; сцена добавляет в начало колонки `scheduled` снимок `wo-hero.3` (копия героя в фикстуре доски отсутствует — она снята до создания копии). Курсор к карточке; **press 30** → `ghostId` = герой, плавающий `BoardCard dragging` (scale 1.03, rotate 1.5°) следует `cursorAt`; 30–75 перенос, `overStatus='in_progress'`; подпись `callouts.board` на 60; **drop 75** → герой перемещён в `in_progress` в данных колонок; 90–150 камера дрейфует вправо через «Ожидание», «Готова», «Выдана». Стиллы: 30, 60, 80, 140.

### Task 11: Docs (120 f)
Фон — размытый последний кадр доски (статический `BoardView` с `filter: blur(8px)`). `PaperSheet` `docs/order-pdf.png` поднимается 0–30; камера наезжает на блок «Замена цепи ГРМ» к 45; подпись `callouts.docs` на 45; 75 сзади выезжает `docs/smeta.png` (веер 6°). Стиллы: 15, 50, 100.

### Task 12: Search + Client (150 f)
`AppShellView` + `SearchPaletteView` поверх доски: открытие на 0 (оверлей ⌘K), `TypeText` `HERO.r56.vin` (первые 7 символов) 15–50, `hits` = `search/<prefix>.json` для текущего префикса; **клик 60** по первому `search-hit` → `ClientCardView` с `client-hero.json`; подпись `callouts.vin` на 60; камера ведёт вниз по `client-orders` 75–135. Стиллы: 30, 60, 100, 145.

### Task 13: Dashboard (150 f)
`DashboardView` с `dashboard.json` в `AppWindow` (активный пункт меню не выделяется — маршрута нет). `progress` 0→1 за 0–45 (spring); `CountUp` KPI 0–45; камера на график выручки 45–90 (`highlight='revenue'`), затем на загрузку мастеров 90–135 (`highlight='load'`); подпись `callouts.dashboard` на 60. Стиллы: 20, 60, 120.

### Task 14: Outro (120 f)
`BrandMark` крупно, строка «Запись · Смета · Доска · Документы · Поиск» на 15, `outro.title` на 30, `outro.subtitle`/`cta` на 45; всё уходит в fade 105–120. Стиллы: 10, 50, 115.

---

### Task 15: сборка Hero и звук

**Files:**
- Create: `video/src/compositions/Hero.tsx`, `video/public/audio/{click.wav,key.wav,whoosh.wav,music.mp3}`

**Interfaces:**
- Consumes: сцены (Tasks 7–14), `SCENES`, `clicksAbsolute()`, `showcaseSchema`.
- Produces: `Hero(props: ShowcaseProps)` — `TransitionSeries` по `SCENES`: fade между intro/booking, booking/estimate, docs/search, dashboard/outro; `slide({direction:'from-right'})` между estimate/board, board/docs, search/dashboard; все переходы `linearTiming({ durationInFrames: TRANSITION })`. `<Audio src={staticFile('audio/music.mp3')} volume={(f) => interpolate(f, [0, 30, total-90, total], [0, 0.8, 0.8, 0], clamp)} startFrom={musicOffsetFrames} />`; для каждого `clicksAbsolute()` — `<Sequence from={c} durationInFrames={15}><Audio src={staticFile('audio/click.wav')} volume={0.5} /></Sequence>`; звук клавиши — на каждом символе `TypeText` Search (громкость 0.2).
- [ ] **Step 1: Тест** (vitest, без рендера): позиции `from` всех клик-`Sequence` в `Hero` (вынести в `heroClickSfx(): number[]`) === `clicksAbsolute()` (Review Focus 5).
- [ ] **Step 2:** FAIL → реализовать → PASS. Музыка: плейсхолдер (тишина нужной длины) до выбора лицензионного трека пользователем.
- [ ] **Step 3: Проверка:** стиллы на всех `clicksAbsolute()` и на серединах переходов (`sceneStart(next) + 7`); черновые `npm run render -- Hero out/test.mp4 --frames=<a>-<b>` по одной сцене; полный черновой рендер `out/hero-draft.mp4`, проверить длительность `ffprobe` = 37,0 с.
- [ ] **Step 4: Commit** — `feat(video): hero assembly with music and click sfx`.

### Task 16: MobileMaster и PhoneFrame

**Files:**
- Create: `video/src/compositions/MobileMaster.tsx`; npm-скрипт `prerender`

**Interfaces:**
- Produces: композиция 390×844, 180 f: `AppShellView` с `navForRole('master')` и `drawerOpen` по кадру, `BoardView` с `board.master.json` (мобильная раскладка включается шириной 390); горизонтальный скролл доски пинг-понгом (`translateX` от кадра). `npm run prerender` → `public/prerender/mobile-master.mp4`.
- [ ] **Step 1:** Реализовать; стиллы 0, 60, 120 — в меню нет «Прайс-лист»/«Настройки», на доске только наряды `HERO.masterId`.
- [ ] **Step 2:** `npm run prerender` → файл существует, 6,0 с.
- [ ] **Step 3: Commit** — `feat(video): mobile master prerender`.

### Task 17: версия 4:5

**Files:**
- Create: `video/src/compositions/Social.tsx`; Modify: сцены (ключи камеры `CAM.wide`/`CAM.social`)

**Interfaces:**
- Consumes: `useLayout()`, `SCENES_SOCIAL`.
- Produces: `HeroSocial` — тот же набор сцен по `SCENES_SOCIAL`; в каждой сцене `const CAM = { wide: [...], social: [...] }`, выбор по `useLayout()`; в `social` zoom ≥ 1.7 и одна зона за раз (смета: сначала модалка, потом сводка; доска: две колонки). `Callout` в `social` — нижняя плашка 260 px, кегль 52–56; верхние 120 px — `BrandMark`.
- [ ] **Step 1: Тест** (`timing.spec.ts`): `totalDuration(SCENES_SOCIAL)` ≤ 900 (≤ 30 с) и все `sceneStart` кратны 15.
- [ ] **Step 2:** Реализовать; стиллы каждой сцены в 50% масштабе (`--scale=0.5`) — подписи читаются (Review Focus 4).
- [ ] **Step 3: Commit** — `feat(video): 4:5 social cut`.

### Task 18: лупы

**Files:**
- Create: `video/src/compositions/Loops.tsx`

**Interfaces:**
- Produces: композиции 1600×1000: `LoopBooking` (180 f), `LoopEstimate` (240), `LoopDiscounts` (180), `LoopPriceList` (180, `PriceListView` + `FakeSelect` R56 → F56 → F60 → R56, `CountUp` цен), `LoopBoard` (180), `LoopMasterMobile` (180, `PhoneFrame` с пререндером). Каждая обёрнута в `LoopCrossfade overlap=10` и заканчивается тем же состоянием камеры и данных, что и начинается.
- [ ] **Step 1: Тест бесшовности:** для каждого лупа `still --frame=0` и `--frame=<dur-1>` → попиксельная разница (скрипт `video/scripts/loop-diff.ts` на `pngjs`) < 1% пикселей.
- [ ] **Step 2:** Реализовать → тест PASS.
- [ ] **Step 3:** Рендер: `npm run render -- <Loop> out/loops/<name>.webm --codec=vp9 --muted` и `.mp4` (`--codec=h264 --muted`).
- [ ] **Step 4: Commit** — `feat(video): seamless feature loops`.

### Task 19: стиллы, финальный рендер, чеклист

**Files:**
- Create: `video/src/compositions/Stills.tsx`; Modify: `video/package.json` (скрипты `render:all`)

**Interfaces:**
- Produces: `<Still>` `Cover` 1920×1080 (наклонённое окно сметы + телефон + бренд), `OG` 1200×630, `ReadmeEstimate` и `ReadmeBoard` 1600×1000. `render:all` = hero, social, loops, stills.
- [ ] **Step 1:** `npm run render:all` — команды: `render Hero out/hero.mp4 --crf=16 --image-format=png`, `render HeroSocial out/social.mp4`, лупы (Task 18), `still Cover out/cover.png --scale=2`, `still OG out/og.png`, `still Readme* …`.
- [ ] **Step 2:** Чеклист гайда, с ответом по каждому пункту в отчёте: только seed-данные; превью в 50% читается; подписи о результате; курсор двигается только к цели; клики/склейки на бите (Task 6/15 тесты); hero ≤ 40 с (`ffprobe`); лупы без скачка (Task 18); отрендерены 16:9, 4:5, лупы, обложка.
- [ ] **Step 3:** Артефакты в `video/out/` не коммитятся (`.gitignore`); отдать пользователю файлы `hero.mp4`, `social.mp4`, `cover.png`.
- [ ] **Step 4: Commit** — `feat(video): stills and render scripts`.
