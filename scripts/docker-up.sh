#!/usr/bin/env bash
set -euo pipefail

if [ -z "${OPENAI_API_KEY:-}" ] && [ -f .env ]; then
  openai_key_line="$(rg '^OPENAI_API_KEY=' .env -N -m 1 || true)"
  if [ -n "$openai_key_line" ]; then
    OPENAI_API_KEY="${openai_key_line#OPENAI_API_KEY=}"
    export OPENAI_API_KEY
  fi
fi

find_open_port() {
  local port="$1"
  shift || true

  while true; do
    local conflict="false"

    if lsof -iTCP:"$port" -sTCP:LISTEN -t >/dev/null 2>&1; then
      conflict="true"
    else
      for avoid in "$@"; do
        if [ -n "$avoid" ] && [ "$port" = "$avoid" ]; then
          conflict="true"
          break
        fi
      done
    fi

    if [ "$conflict" = "false" ]; then
      break
    fi

    port=$((port + 1))
  done

  echo "$port"
}

POSTGRES_START_PORT="${POSTGRES_START_PORT:-9001}"
REDIS_START_PORT="${REDIS_START_PORT:-9002}"
MEM0_START_PORT="${MEM0_START_PORT:-9003}"
MEM0_DASHBOARD_START_PORT="${MEM0_DASHBOARD_START_PORT:-9004}"

POSTGRES_PORT="$(find_open_port "$POSTGRES_START_PORT")"
REDIS_PORT="$(find_open_port "$REDIS_START_PORT" "$POSTGRES_PORT")"
MEM0_PORT="$(find_open_port "$MEM0_START_PORT" "$POSTGRES_PORT" "$REDIS_PORT")"
MEM0_DASHBOARD_PORT="$(find_open_port "$MEM0_DASHBOARD_START_PORT" "$POSTGRES_PORT" "$REDIS_PORT" "$MEM0_PORT")"
MEM0_JWT_SECRET="${MEM0_JWT_SECRET:-$(openssl rand -base64 48 | tr -d '\n')}"

cat > .docker-ports.env <<EOV
POSTGRES_PORT=${POSTGRES_PORT}
REDIS_PORT=${REDIS_PORT}
MEM0_PORT=${MEM0_PORT}
MEM0_DASHBOARD_PORT=${MEM0_DASHBOARD_PORT}
POSTGRES_USER=${POSTGRES_USER:-postgres}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-postgres}
POSTGRES_DB=${POSTGRES_DB:-openpinna}
MEM0_POSTGRES_USER=${MEM0_POSTGRES_USER:-postgres}
MEM0_POSTGRES_PASSWORD=${MEM0_POSTGRES_PASSWORD:-postgres}
MEM0_POSTGRES_DB=${MEM0_POSTGRES_DB:-postgres}
MEM0_POSTGRES_COLLECTION_NAME=${MEM0_POSTGRES_COLLECTION_NAME:-mem0}
MEM0_APP_DB_NAME=${MEM0_APP_DB_NAME:-postgres}
MEM0_AUTH_DISABLED=${MEM0_AUTH_DISABLED:-true}
MEM0_ADMIN_API_KEY=${MEM0_ADMIN_API_KEY:-}
MEM0_JWT_SECRET=${MEM0_JWT_SECRET}
MEM0_TELEMETRY=${MEM0_TELEMETRY:-false}
OPENAI_API_KEY=${OPENAI_API_KEY:-}
EOV

echo "Using ports: postgres=${POSTGRES_PORT}, redis=${REDIS_PORT}, mem0=${MEM0_PORT}, mem0-dashboard=${MEM0_DASHBOARD_PORT}"

if [ -z "${OPENAI_API_KEY:-}" ]; then
  echo "Warning: OPENAI_API_KEY is not set in the shell environment."
  echo "Mem0 will boot, but provider-backed memory operations may fail until OPENAI_API_KEY is configured."
fi

docker compose --env-file .docker-ports.env up -d

echo "Set app env values:"
echo "DATABASE_URL=postgresql://postgres:postgres@localhost:${POSTGRES_PORT}/openpinna?schema=public"
echo "REDIS_URL=redis://localhost:${REDIS_PORT}"
echo "MEM0_BASE_URL=http://localhost:${MEM0_PORT}"
echo "Optional Mem0 dashboard: http://localhost:${MEM0_DASHBOARD_PORT}"
