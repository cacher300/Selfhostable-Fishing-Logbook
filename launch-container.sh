#!/usr/bin/env sh
set -eu

APP_URL="${APP_URL:-http://127.0.0.1:8080}"
CONTAINER_NAME="${CONTAINER_NAME:-detailed-fishing-logbook}"

cd "$(dirname "$0")"

if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE="docker-compose"
else
  echo "Docker Compose is required. Install Docker Desktop or docker compose first." >&2
  exit 1
fi

echo "Stopping any running Fishing Logbook container..."
$COMPOSE down --remove-orphans

if docker ps -a --format '{{.Names}}' | grep -Fx "$CONTAINER_NAME" >/dev/null 2>&1; then
  docker stop "$CONTAINER_NAME" >/dev/null 2>&1 || true
  docker rm "$CONTAINER_NAME" >/dev/null 2>&1 || true
fi

mkdir -p data

echo "Building and starting Fishing Logbook..."
$COMPOSE up --build -d

echo "Fishing Logbook is running at $APP_URL"
