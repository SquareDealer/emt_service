# Деплой на VPS (Docker Compose + Caddy)

Один сервер: Postgres + API (NestJS) + Caddy (отдаёт SPA и проксирует `/api`, авто-HTTPS).

## Что нужно

- VPS (Ubuntu 22.04/24.04), открытые порты **80** и **443**.
- Домен с **A-записью** на IP сервера (для автоматического TLS).
- Установленный Docker + Compose plugin.

## Шаги

1. **Docker** (если не стоит):
   ```bash
   curl -fsSL https://get.docker.com | sh
   ```

2. **Код**:
   ```bash
   git clone <repo> /opt/tatarin_crm && cd /opt/tatarin_crm
   ```

3. **Env**:
   ```bash
   cp .env.production.example .env.production
   nano .env.production
   ```
   Обязательно задать: `DOMAIN`, `POSTGRES_PASSWORD`, `JWT_SECRET`
   (`openssl rand -hex 32`), `SEED_OWNER_PASSWORD` (сильный — иначе сид
   откажется создавать владельца в production).

4. **Запуск** (сборка образов + миграции/сид на старте API):
   ```bash
   docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
   ```

5. **Проверка**:
   ```bash
   curl -fsS https://$DOMAIN/api/health      # {"status":"ok"}
   docker compose -f docker-compose.prod.yml logs -f api   # миграции + сид owner
   ```
   Открыть `https://DOMAIN`, войти под `owner` с заданным паролем.

## Обновление

```bash
git pull
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```
Миграции применяются автоматически при старте API (`migrationsRun: true`).

## Бэкап БД

```bash
./scripts/backup.sh         # → backups/tatarin_<ts>.sql.gz
# cron: 0 3 * * * cd /opt/tatarin_crm && ./scripts/backup.sh >> backups/backup.log 2>&1
```
Восстановление:
```bash
gunzip -c backups/<файл>.sql.gz | \
  docker compose --env-file .env.production -f docker-compose.prod.yml exec -T db \
  psql -U crm -d tatarin_crm
```

## Локальный smoke-тест (без домена/TLS)

В `.env.production` поставить `DOMAIN=:80`, затем `up -d --build` и проверить
`http://localhost/api/health` и `http://localhost/`.

## Заметки

- API отдаётся под префиксом **`/api`** (`app.setGlobalPrefix('api')`), фронт
  собирается с `VITE_API_URL=/api` (`client/.env.production`). Dev зеркалит это
  через Vite-прокси `/api → :3000`.
- Caddy хранит сертификаты в томе `caddy_data` — не теряются между рестартами.
- Postgres-том `tatarin_pgdata` хранит данные; порт БД наружу не проброшен.
- Dev-`docker-compose.yml` (Postgres :5544) — только для локальной разработки.
