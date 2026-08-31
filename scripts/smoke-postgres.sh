#!/usr/bin/env bash
# Smoke-test Postgres wiring: start DB, run API, log in, and exercise bucket CRUD.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

POSTGRES_USER="${POSTGRES_USER:-lvs3}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-lvs3}"
POSTGRES_DB="${POSTGRES_DB:-lvs3}"
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PUBLISH_PORT:-5432}"
ADMIN_PORT="${ADMIN_PORT:-9001}"
S3_PORT="${S3_PORT:-9000}"
ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-ChangeMe12345678}"

export DATABASE_URL="${DATABASE_URL:-postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}}"

cd "$ROOT_DIR"

echo "Starting Postgres (compose profile)..."
docker compose --profile postgres up -d postgres

echo "Waiting for Postgres..."
for _ in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
docker compose exec -T postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"

API_PID=""
cleanup() {
  if [[ -n "$API_PID" ]] && kill -0 "$API_PID" 2>/dev/null; then
    kill "$API_PID" 2>/dev/null || true
    wait "$API_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "Starting backend with DATABASE_URL..."
(
  cd "$ROOT_DIR/backend"
  export TYPEORM_SYNC=false
  export STORAGE_ROOT="${STORAGE_ROOT:-$ROOT_DIR/backend/data/storage}"
  export ADMIN_PORT
  export S3_PORT
  yarn start:prod
) &
API_PID=$!

echo "Waiting for /health/ready..."
for _ in $(seq 1 60); do
  if curl -sf "http://127.0.0.1:${ADMIN_PORT}/health/ready" >/dev/null; then
    break
  fi
  sleep 1
done
curl -sf "http://127.0.0.1:${ADMIN_PORT}/health/ready" | head -c 200
echo

echo "POST /auth/login..."
LOGIN_RESPONSE="$(curl -sf -X POST "http://127.0.0.1:${ADMIN_PORT}/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"${ADMIN_USERNAME}\",\"password\":\"${ADMIN_PASSWORD}\"}")"
ACCESS_TOKEN="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).accessToken)' "$LOGIN_RESPONSE")"

BUCKET_NAME="postgres-smoke-$(date +%s)-$$"
echo "POST /buckets (${BUCKET_NAME})..."
curl -sf -X POST "http://127.0.0.1:${ADMIN_PORT}/buckets" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"${BUCKET_NAME}\"}" >/dev/null

echo "GET /buckets..."
BUCKETS_RESPONSE="$(curl -sf "http://127.0.0.1:${ADMIN_PORT}/buckets" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}")"
node -e '
  const buckets = JSON.parse(process.argv[1]);
  const name = process.argv[2];
  if (!buckets.some((bucket) => bucket.name === name)) {
    throw new Error(`Created bucket ${name} was not listed`);
  }
' "$BUCKETS_RESPONSE" "$BUCKET_NAME"

echo "DELETE /buckets/${BUCKET_NAME}..."
curl -sf -X DELETE "http://127.0.0.1:${ADMIN_PORT}/buckets/${BUCKET_NAME}" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" >/dev/null

echo "Postgres smoke OK"
