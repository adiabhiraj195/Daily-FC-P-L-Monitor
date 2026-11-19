#!/bin/sh
set -e

echo "=========================================================="
echo " Starting Prozo FC Margin Monitor - Express API Container "
echo "=========================================================="

# Extract database connection details or use defaults
DB_HOST="${DB_HOST:-db}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${POSTGRES_USER:-postgres}"
DB_NAME="${POSTGRES_DB:-prozo_margin}"

echo "[API Entrypoint] Checking database availability at ${DB_HOST}:${DB_PORT}..."

# Wait for database with timeout
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
    echo "[API Entrypoint] ERROR: Timed out waiting for PostgreSQL after ${MAX_RETRIES} attempts."
    exit 1
  fi
  echo "[API Entrypoint] PostgreSQL is not ready yet (attempt ${RETRY_COUNT}/${MAX_RETRIES}). Waiting 2s..."
  sleep 2
done

echo "[API Entrypoint] Database is ready and accepting connections!"

# Synchronize database schema using Prisma db push
echo "[API Entrypoint] Applying Prisma database schema..."
pnpm prisma db push --skip-generate

# Seed the database idempotently
echo "[API Entrypoint] Running database seed (users, FCs, and target rules)..."
pnpm prisma:seed || echo "[API Entrypoint] Database seed notice: data already seeded or verified."

echo "[API Entrypoint] Initialization complete. Launching Express API server on port ${API_PORT:-4000}..."
exec pnpm --filter @prozo/api start
