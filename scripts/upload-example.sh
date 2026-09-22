#!/usr/bin/env bash
set -euo pipefail

FILE=${1:-}
TITLE=${2:-Test Video}
BASE_URL=${BASE_URL:-http://localhost:8080}

if [[ -z "$FILE" || ! -f "$FILE" ]]; then
  echo "Usage: $0 /path/to/video.mp4 'Video title'" >&2
  exit 1
fi

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

: "${ADMIN_API_KEY:?ADMIN_API_KEY must be set or present in .env}"

curl --fail-with-body \
  -H "x-api-key: ${ADMIN_API_KEY}" \
  -F "title=${TITLE}" \
  -F "mediaType=video" \
  -F "file=@${FILE}" \
  "${BASE_URL}/api/v1/admin/videos"

echo
