#!/usr/bin/env bash
set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required. Install Docker Engine + the Compose plugin first." >&2
  exit 1
fi

if [[ ! -f .env ]]; then
  cp .env.example .env
  POSTGRES_PASSWORD="$(openssl rand -hex 24)"
  ADMIN_API_KEY="$(openssl rand -hex 32)"
  STREAM_SERVICE_API_KEY="$(openssl rand -hex 32)"
  STREAM_SIGNING_SECRET="$(openssl rand -hex 32)"
  sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=${POSTGRES_PASSWORD}/" .env
  sed -i "s#^DATABASE_URL=.*#DATABASE_URL=postgres://moobee:${POSTGRES_PASSWORD}@postgres:5432/moobee_stream#" .env
  sed -i "s/^ADMIN_API_KEY=.*/ADMIN_API_KEY=${ADMIN_API_KEY}/" .env
  sed -i "s/^STREAM_SERVICE_API_KEY=.*/STREAM_SERVICE_API_KEY=${STREAM_SERVICE_API_KEY}/" .env
  sed -i "s/^STREAM_SIGNING_SECRET=.*/STREAM_SIGNING_SECRET=${STREAM_SIGNING_SECRET}/" .env
  echo "Created .env with random local secrets. Set PUBLIC_EMBED_BASE_URL before public deployment."
fi

mkdir -p storage/uploads storage/videos storage/posters
docker compose up -d --build

echo
echo "MooBee Stream is starting on http://localhost:8080"
echo "Health endpoint: http://localhost:8080/api/health"
