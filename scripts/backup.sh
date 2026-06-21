#!/usr/bin/env bash
# Dump the production Postgres database to ./backups/<ts>.sql.gz. Cron-friendly:
#   0 3 * * *  cd /opt/tatarin_crm && ./scripts/backup.sh >> backups/backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p backups
ts="$(date +%Y%m%d-%H%M%S)"
out="backups/tatarin_${ts}.sql.gz"
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T db \
  pg_dump -U crm tatarin_crm | gzip > "$out"
echo "backup → $out"
