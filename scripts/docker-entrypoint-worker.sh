#!/bin/sh
set -e

echo "=========================================================="
echo " Starting Prozo FC Margin Monitor - Background Worker    "
echo "=========================================================="

DB_HOST="${DB_HOST:-db}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${POSTGRES_USER:-postgres}"
DB_NAME="${POSTGRES_DB:-prozo_margin}"

echo "[Worker Entrypoint] Checking database availability at ${DB_HOST}:${DB_PORT}..."

MAX_RETRIES=30
RETRY_COUNT=0

until pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" > /dev/null 2>&1 || node -e "
const net = require('net');
const client = new net.Socket();
client.connect($DB_PORT, '$DB_HOST', () => { client.destroy(); process.exit(0); });
client.on('error', () => process.exit(1));
" 2>/dev/null; do
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
    echo "[Worker Entrypoint] ERROR: Timed out waiting for PostgreSQL after ${MAX_RETRIES} attempts."
    exit 1
  fi
  echo "[Worker Entrypoint] PostgreSQL is not ready yet (attempt ${RETRY_COUNT}/${MAX_RETRIES}). Waiting 2s..."
  sleep 2
done

echo "[Worker Entrypoint] Database is ready! Waiting 5s for API schema migration..."
sleep 5

echo "[Worker Entrypoint] Launching Background Worker process (Concurrency: ${WORKER_CONCURRENCY:-3})..."
exec pnpm --filter @prozo/worker start
