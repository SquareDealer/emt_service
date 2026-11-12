# Checks: CRM для СТО (MINI Cooper) — MVP

Запускать из **корня проекта**. Подставь реальные роуты/порт/`$DATABASE_URL`. Часть проверок имеет смысл после реализации соответствующей фазы.

---

## Phase 0 — Environment

```bash
node --version
npm ci --dry-run
psql "$DATABASE_URL" -c "SELECT 1;" > /dev/null
psql "$DATABASE_URL" -c "SELECT 1 FROM pg_extension WHERE extname='pg_trgm';" | grep -q 1
# enum источника клиента создан
psql "$DATABASE_URL" -c "SELECT enum_range(NULL::client_source);" | grep -q telegram_bot
```

---

## Phase 1 — Unit / Static

```bash
npx tsc --noEmit
npm test -- --passWithNoTests
npm test -- pricing.service          # override перебивает часы×ставку, скидка применяется
npm test -- clients-import.service   # нормализация телефона, парс даты, дедуп
```

---

## Phase 2 — Integration

```bash
npm run start:dev & sleep 4
curl -sf http://localhost:3000/health | grep -q '"status":"ok"'
psql "$DATABASE_URL" -c "\dt" | grep -Eq 'work_orders|vehicles|clients'
psql "$DATABASE_URL" -c "SELECT enum_range(NULL::work_order_status);" | grep -q scheduled
kill %1
```

---

## Phase 3 — Acceptance Criteria

```bash
npm run start:dev & sleep 4
TOKEN=$(curl -sf -XPOST localhost:3000/auth/login -H 'Content-Type: application/json' \
  -d '{"login":"owner","password":"<pw>"}' | jq -r .access_token)
H="-H Authorization: Bearer $TOKEN -H Content-Type: application/json"

# AC-1 + AC-10: создание клиента, source=manual, виден в поиске
CID=$(curl -sf $H -XPOST localhost:3000/clients -d '{"full_name":"Тест Тестов","phone":"+79990001122"}' | jq -r .id)
test "$(curl -sf $H localhost:3000/clients/$CID | jq -r .source)" = "manual"
curl -sf $H "localhost:3000/search?q=Тестов" | grep -q "$CID"

# AC-2: 2+ ТС на клиента
curl -sf $H -XPOST localhost:3000/vehicles -d "{\"client_id\":\"$CID\",\"vin\":\"WMW111\",\"model\":\"R56\"}" >/dev/null
V2=$(curl -sf $H -XPOST localhost:3000/vehicles -d "{\"client_id\":\"$CID\",\"vin\":\"WMW222\",\"model\":\"F56\"}" | jq -r .id)
test "$(curl -sf $H localhost:3000/clients/$CID/vehicles | jq length)" -ge 2

# AC-3: работа с временем в календаре
WID=$(curl -sf $H -XPOST localhost:3000/work-orders \
  -d "{\"vehicle_id\":\"$V2\",\"scheduled_at\":\"2026-06-20T10:00:00Z\"}" | jq -r .id)
curl -sf $H "localhost:3000/work-orders/calendar?from=2026-06-20&to=2026-06-21" | grep -q "$WID"

# AC-4 + AC-5: строки (вкл. шаблон) и итог = Σ − скидка наряда
curl -sf $H -XPOST localhost:3000/work-orders/$WID/labor -d '{"name":"Замена масла","hours":1,"rate_snapshot":2000}' >/dev/null
curl -sf $H -XPOST localhost:3000/work-orders/$WID/parts -d '{"name":"Фильтр","qty":1,"unit_price":800}' >/dev/null
curl -sf $H -XPATCH localhost:3000/work-orders/$WID -d '{"discount_type":"fixed","discount_value":300}' >/dev/null
test "$(curl -sf $H localhost:3000/work-orders/$WID | jq .total_cached)" = "2500"  # 2000+800-300

# AC-6: статус перетаскиванием (через API)
curl -sf $H -XPATCH localhost:3000/work-orders/$WID -d '{"status":"in_progress"}' >/dev/null
test "$(curl -sf $H localhost:3000/work-orders/$WID | jq -r .status)" = "in_progress"

# AC-7: поиск по части VIN
curl -sf $H "localhost:3000/search?q=WMW2" | grep -q "$V2"

# AC-8: смена глобальной ставки не меняет итог закрытого наряда
curl -sf $H -XPOST localhost:3000/work-orders/$WID/close >/dev/null
FROZEN=$(curl -sf $H localhost:3000/work-orders/$WID | jq .total_frozen)
curl -sf $H -XPATCH localhost:3000/settings -d '{"labor_rate":5000}' >/dev/null
test "$(curl -sf $H localhost:3000/work-orders/$WID | jq .total_frozen)" = "$FROZEN"

# AC-9: CSV-импорт — дата сохранена, агрегаты на месте, повторный импорт без дублей
printf 'ФИО,телефон,дата создания,кол-во закрытых сделок,сумма закрытых сделок\nИван Иванов,+79991234567,15.03.2024,12,145000\n' > /tmp/clients.csv
curl -sf $H -F file=@/tmp/clients.csv localhost:3000/clients/import >/dev/null
IID=$(curl -sf $H "localhost:3000/search?q=79991234567" | jq -r '.[0].id')
curl -sf $H localhost:3000/clients/$IID | jq -r .created_at | grep -q '2024-03-15'
test "$(curl -sf $H localhost:3000/clients/$IID | jq .imported_deals_count)" = "12"
test "$(curl -sf $H localhost:3000/clients/$IID | jq .imported_deals_sum)" = "145000"
test "$(curl -sf $H localhost:3000/clients/$IID | jq -r .source)" = "csv_import"
BEFORE=$(curl -sf $H "localhost:3000/search?q=79991234567" | jq length)
curl -sf $H -F file=@/tmp/clients.csv localhost:3000/clients/import >/dev/null   # повторный импорт
test "$(curl -sf $H "localhost:3000/search?q=79991234567" | jq length)" = "$BEFORE"  # без дублей

# AC-11: закупочная цена и аналитика (живая БД: select:false не течёт, save() не затирает колонку)
# 13 шагов: каталог/наряд без purchase_price для не-владельцев, закупка в строке жива после PATCH qty,
# summary за месяц (относительно baseline: orders +1, parts_cost +1040, unknown_count +0), duplicate копирует
# закупку, PATCH part-costs не двигает total_frozen, 403 не-владельцу, 400 на убывающие edges,
# возврат closed→done возвращает период к baseline.
# ТОЛЬКО dev-база: без ALLOW_DESTRUCTIVE_CHECK=1 скрипт отказывается работать (exit 2).
# Создаёт: двух пользователей (приёмщик, мастер), клиента, ТС, наряд (+ копию), запчасть каталога и шаблон работ.
# Убирает в finally (и при успехе, и при падении): деактивирует обоих пользователей, отвязывает запчасть
# от шаблона, деактивирует запчасть и шаблон. Клиент, ТС и наряды остаются (удаления в API нет).
ALLOW_DESTRUCTIVE_CHECK=1 API_URL=http://localhost:3000/api DATABASE_URL=$DATABASE_URL node scripts/verify-analytics.mjs   # нужен psql в PATH

kill %1
```

---

## Phase 4 — Lint / Build

```bash
npm run lint -- --max-warnings=0
npm run build
```

---

## Full suite

```bash
set -euo pipefail
echo "=== env ==="        && node --version && psql "$DATABASE_URL" -c "SELECT 1;" >/dev/null
echo "=== static ==="     && npx tsc --noEmit && npm test -- --passWithNoTests
echo "=== integration ===" # см. Phase 2
echo "=== acceptance ==="  # см. Phase 3 (AC-1..11)
echo "=== build ==="       && npm run lint -- --max-warnings=0 && npm run build
echo "✅ All checks passed"
```
