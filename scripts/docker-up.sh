#!/usr/bin/env bash
set -euo pipefail

find_open_port() {
  local port="$1"
  local avoid="${2:-}"
  while lsof -iTCP:"$port" -sTCP:LISTEN -t >/dev/null 2>&1; do
    port=$((port + 1))
  done
  if [ -n "$avoid" ]; then
    while [ "$port" = "$avoid" ]; do
      port=$((port + 1))
      while lsof -iTCP:"$port" -sTCP:LISTEN -t >/dev/null 2>&1; do
        port=$((port + 1))
      done
    done
  fi
  echo "$port"
}

POSTGRES_START_PORT="${POSTGRES_START_PORT:-9001}"
REDIS_START_PORT="${REDIS_START_PORT:-9002}"

POSTGRES_PORT="$(find_open_port "$POSTGRES_START_PORT")"
REDIS_PORT="$(find_open_port "$REDIS_START_PORT" "$POSTGRES_PORT")"

cat > .docker-ports.env <<EOV
POSTGRES_PORT=${POSTGRES_PORT}
REDIS_PORT=${REDIS_PORT}
POSTGRES_USER=${POSTGRES_USER:-postgres}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-postgres}
POSTGRES_DB=${POSTGRES_DB:-openpinna}
EOV

echo "Using ports: postgres=${POSTGRES_PORT}, redis=${REDIS_PORT}"
docker compose --env-file .docker-ports.env up -d

echo "Set app env values:"
echo "DATABASE_URL=postgresql://postgres:postgres@localhost:${POSTGRES_PORT}/openpinna?schema=public"
echo "REDIS_URL=redis://localhost:${REDIS_PORT}"
