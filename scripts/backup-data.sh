#!/usr/bin/env bash
# Creates a tar.gz backup of LV S3 persistent data (SQLite DB + object storage).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

if [[ -n "${DATABASE_PATH:-}" ]]; then
  DATA_DIR="$(cd "$(dirname "$DATABASE_PATH")" && pwd)"
elif [[ -d "$ROOT_DIR/lv_s3_data" ]]; then
  DATA_DIR="$(cd "$ROOT_DIR/lv_s3_data" && pwd)"
elif [[ -d "$ROOT_DIR/backend/data" ]]; then
  DATA_DIR="$(cd "$ROOT_DIR/backend/data" && pwd)"
else
  echo "No data directory found. Set DATABASE_PATH or create lv_s3_data/ or backend/data/." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
OUT="$BACKUP_DIR/lv-s3-data-${TIMESTAMP}.tar.gz"
PARENT="$(dirname "$DATA_DIR")"
NAME="$(basename "$DATA_DIR")"

tar -czf "$OUT" -C "$PARENT" "$NAME"
echo "Backup written to $OUT"
