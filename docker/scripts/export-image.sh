#!/usr/bin/env bash
# Build image, start stack (docker compose up), then export the image with docker save.
# Frontend is baked into the image via backend/Dockerfile (multi-stage).
#
# Output file: docker/out/lv-s3-<tag>-<YYYYMMDD-HHMMSS>.tar.gz  (gzip; default)
#   Plain .tar:  --no-compress
#
# Usage:
#   ./export-image.sh [--tag TAG] [--no-compress] [--out-dir DIR] [--down]
#   ./export-image.sh --no-up [--tag TAG] ...     # only build, no container start (e.g. no .env)
#   ./export-image.sh --save-only [--tag TAG] ... # only docker save (image must exist)
set -euo pipefail

TAG="${LV_S3_IMAGE_TAG:-latest}"
COMPRESS=1
NO_UP=0
SAVE_ONLY=0
BRING_DOWN=0
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="${SCRIPT_DIR}/../out"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-build|--save-only) SAVE_ONLY=1; shift ;;
    --no-up) NO_UP=1; shift ;;
    --tag) TAG="$2"; shift 2 ;;
    --no-compress) COMPRESS=0; shift ;;
    --out-dir) OUT_DIR="$2"; shift 2 ;;
    --down) BRING_DOWN=1; shift ;;
    -h|--help)
      echo "Usage: $0 [--tag TAG] [--no-compress] [--out-dir DIR] [--down]"
      echo ""
      echo "Default: docker build (backend/Dockerfile) → compose up -d --wait → docker save | gzip → .tar.gz"
      echo "  --no-compress   Write uncompressed .tar instead of .tar.gz"
      echo "  --down       Run docker compose down after a successful export."
      echo "  --no-up      Only docker build, then save (no container start)."
      echo "  --save-only  Only docker save (image must already exist)."
      echo "  --no-build   Same as --save-only (deprecated alias)."
      echo ""
      echo "Requires Docker Compose v2 with 'up --wait' (or use --no-up)."
      exit 0
      ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

IMAGE="lv-s3:${TAG}"
mkdir -p "${OUT_DIR}"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_BASE="${OUT_DIR}/lv-s3-${TAG}-${STAMP}"

cd "${REPO_ROOT}"
export LV_S3_IMAGE_TAG="${TAG}"

docker_build_lv_s3() {
  echo "==> docker build -f backend/Dockerfile -t ${IMAGE}"
  docker build \
    -f backend/Dockerfile \
    -t "${IMAGE}" \
    --build-arg VITE_ADMIN_API="" \
    --build-arg "VITE_S3_ENDPOINT=${PUBLIC_S3_API:-http://localhost:9000}" \
    --build-arg "VITE_S3_REGION=${PUBLIC_S3_REGION:-us-east-1}" \
    "${REPO_ROOT}"
}

if [[ "${SAVE_ONLY}" -eq 0 ]]; then
  docker_build_lv_s3
  if [[ "${NO_UP}" -eq 0 ]]; then
    echo "==> docker compose up -d --wait"
    if ! docker compose -f docker-compose.yml up -d --wait; then
      echo "Note: if 'up --wait' fails (old Compose), use: $0 --no-up [--tag $TAG ...]" >&2
      exit 1
    fi
  fi
fi

if [[ "${COMPRESS}" -eq 1 ]]; then
  OUT_FILE="${OUT_BASE}.tar.gz"
  echo "==> docker save ${IMAGE} -> ${OUT_FILE}"
  docker save "${IMAGE}" | gzip -c > "${OUT_FILE}"
else
  OUT_FILE="${OUT_BASE}.tar"
  echo "==> docker save ${IMAGE} -> ${OUT_FILE}"
  docker save -o "${OUT_FILE}" "${IMAGE}"
fi

if [[ "${BRING_DOWN}" -eq 1 && "${SAVE_ONLY}" -eq 0 ]]; then
  echo "==> docker compose down"
  docker compose -f docker-compose.yml down
fi

echo "Done: ${OUT_FILE}"
echo "Remote: ./docker/scripts/import-image.sh -i ${OUT_FILE}  then  docker compose up -d"
