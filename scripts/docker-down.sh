#!/usr/bin/env bash
set -euo pipefail

if [ -f .docker-ports.env ]; then
  docker compose --env-file .docker-ports.env down "$@"
else
  docker compose down "$@"
fi
