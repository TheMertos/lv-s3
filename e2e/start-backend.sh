#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="${TMPDIR:-/tmp}/lv-s3-pw-$$"
mkdir -p "$TMP/storage"
cd "$ROOT/backend"
yarn build
export NODE_ENV=test
export DATABASE_PATH="$TMP/app.db"
export STORAGE_ROOT="$TMP/storage"
export TYPEORM_SYNC=true
export JWT_ACCESS_SECRET='test-access-secret-min-32-characters!'
export MASTER_ENCRYPTION_KEY='0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
export ADMIN_BOOTSTRAP_USERNAME="${E2E_ADMIN_USER:-e2eadmin}"
export ADMIN_BOOTSTRAP_PASSWORD="${E2E_ADMIN_PASS:-E2ePlaywrightPassword123!}"
export ADMIN_THROTTLE_LIMIT=10000
export ADMIN_THROTTLE_TTL_MS=60000
export S3_THROTTLE_LIMIT=10000
export S3_THROTTLE_TTL_MS=60000
export BROWSER_REDIRECT_URL=
export ADMIN_SWAGGER=false
exec yarn node dist/main.js
