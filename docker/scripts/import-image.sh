#!/usr/bin/env bash
# Load a Docker image from export-image.sh and always tag it as lv-s3:latest for compose.
#
# Export naming (from export-image.sh): lv-s3-<tag>-<YYYYMMDD-HHMMSS>.tar.gz (default) or .tar (--no-compress)
#   Example: lv-s3-latest-20260409-132834.tar
#
# Without -i: searches every *existing* directory from the candidate list and picks
# the newest matching archive (see LV_S3_EXPORT_DIRS / LV_S3_EXPORT_DIR below).
#
# Usage:
#   ./import-image.sh
#   ./import-image.sh -i PATH
#   LV_S3_EXPORT_DIRS="/data/img:./exports" ./import-image.sh
#   NO_TAG_LATEST=1 ./import-image.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Repo root if import-image.sh lives in repo root, docker/, or docker/scripts/ (not always two levels up).
resolve_repo_root() {
  local s="$1"
  if [[ -f "${s}/docker-compose.yml" ]]; then
    (cd "${s}" && pwd)
  elif [[ -f "${s}/../docker-compose.yml" ]]; then
    (cd "${s}/.." && pwd)
  elif [[ -f "${s}/../../docker-compose.yml" ]]; then
    (cd "${s}/../.." && pwd)
  else
    (cd "${s}/../.." && pwd)
  fi
}
REPO_ROOT="$(resolve_repo_root "${SCRIPT_DIR}")"
INPUT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    -i|--input) INPUT="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: $0 [-i FILE]"
      echo ""
      echo "Without -i: newest lv-s3-*.tar(.gz) among all existing search directories:"
      echo "  1) LV_S3_EXPORT_DIRS  — colon or semicolon separated list (only dirs that exist)"
      echo "  2) LV_S3_EXPORT_DIR   — single directory (if it exists)"
      echo "  3) directory of this script (e.g. copy next to lv-s3-*.tar.gz)"
      echo "  4) <repo>/docker/out and script/../out (if they exist)"
      echo "  5) \$PWD/docker/out and \$PWD/out (if they exist)"
      echo ""
      echo "Example file: lv-s3-latest-20260409-132834.tar"
      echo "After load: docker tag → lv-s3:latest (disable with NO_TAG_LATEST=1)."
      exit 0
      ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

pick_newest_export() {
  local dir="$1"
  local best="" best_ts=0 f ts
  shopt -s nullglob
  for f in "${dir}"/lv-s3-*.tar "${dir}"/lv-s3-*.tar.gz "${dir}"/lv-s3-*.tgz; do
    [[ -f "$f" ]] || continue
    if ts=$(stat -c %Y "$f" 2>/dev/null) || ts=$(stat -f %m "$f" 2>/dev/null); then
      if (( ts >= best_ts )); then
        best_ts=$ts
        best=$f
      fi
    fi
  done
  shopt -u nullglob
  printf '%s' "$best"
}

# Print unique absolute paths of directories that exist (one per line).
gather_search_dirs() {
  local USED="|" d abs _tmp
  declare -a _raw=()
  if [[ -n "${LV_S3_EXPORT_DIRS:-}" ]]; then
    _tmp="${LV_S3_EXPORT_DIRS//;/:}"
    IFS=':' read -ra _parts <<< "$_tmp"
    for d in "${_parts[@]}"; do
      d="${d#"${d%%[![:space:]]*}"}"
      d="${d%"${d##*[![:space:]]}"}"
      [[ -n "$d" ]] || continue
      _raw+=("$d")
    done
  fi
  if [[ -n "${LV_S3_EXPORT_DIR:-}" ]]; then
    _raw+=("${LV_S3_EXPORT_DIR}")
  fi
  _raw+=("${SCRIPT_DIR}" "${REPO_ROOT}/docker/out" "${SCRIPT_DIR}/../out" "${PWD}/docker/out" "${PWD}/out")
  for d in "${_raw[@]}"; do
    [[ -d "$d" ]] || continue
    abs="$(cd "$d" && pwd)" || continue
    [[ "$USED" == *"|${abs}|"* ]] && continue
    USED+="${abs}|"
    printf '%s\n' "$abs"
  done
}

pick_newest_across_search_dirs() {
  local global_best="" global_ts=0 dir f ts
  while IFS= read -r dir; do
    [[ -z "$dir" ]] && continue
    f="$(pick_newest_export "$dir")"
    [[ -z "$f" ]] && continue
    ts=$(stat -c %Y "$f" 2>/dev/null) || ts=$(stat -f %m "$f" 2>/dev/null) || continue
    if (( ts > global_ts )); then
      global_ts=$ts
      global_best=$f
    fi
  done < <(gather_search_dirs)
  printf '%s' "$global_best"
}

if [[ -z "${INPUT}" ]]; then
  INPUT="$(pick_newest_across_search_dirs)"
  if [[ -z "${INPUT}" ]]; then
    echo "Error: no lv-s3-*.tar(.gz) in any existing search directory." >&2
    echo "Searched (only if folder exists): LV_S3_EXPORT_DIRS, LV_S3_EXPORT_DIR," >&2
    echo "  ${SCRIPT_DIR}, ${REPO_ROOT}/docker/out, ${SCRIPT_DIR}/../out, \${PWD}/docker/out, \${PWD}/out" >&2
    echo "Use -i FILE or set LV_S3_EXPORT_DIRS=/path1:/path2" >&2
    exit 1
  fi
  echo "Using newest export: ${INPUT}"
elif [[ ! -f "${INPUT}" ]]; then
  echo "Error: file not found: ${INPUT}" >&2
  exit 1
fi

load_and_capture() {
  case "${INPUT}" in
    *.gz|*.tgz)
      echo "Loading (gzip) ${INPUT}"
      gzip -dc "${INPUT}" | docker load 2>&1
      ;;
    *)
      echo "Loading ${INPUT}"
      docker load -i "${INPUT}" 2>&1
      ;;
  esac
}

LOAD_LOG="$(load_and_capture)" || exit 1
echo "${LOAD_LOG}"

LOADED_REF=""
while IFS= read -r line; do
  if [[ "$line" =~ Loaded\ image:\ (.+)$ ]]; then
    LOADED_REF="${BASH_REMATCH[1]}"
    break
  fi
done <<< "${LOAD_LOG}"

if [[ -z "${LOADED_REF}" ]]; then
  echo "Warning: could not parse 'Loaded image:' from docker load; skip tagging lv-s3:latest" >&2
else
  if [[ -z "${NO_TAG_LATEST:-}" ]]; then
    docker tag "${LOADED_REF}" lv-s3:latest
    echo "Tagged ${LOADED_REF} -> lv-s3:latest"
  fi
fi

echo "Done. Example: LV_S3_IMAGE_TAG=latest docker compose -f docker-compose.yml up -d"
