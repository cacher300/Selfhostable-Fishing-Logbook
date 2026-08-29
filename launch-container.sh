#!/usr/bin/env sh
set -eu

APP_URL="${APP_URL:-http://127.0.0.1}"
CONTAINER_NAME="${CONTAINER_NAME:-selfhostable-fishing-logbook}"
LEGACY_CONTAINER_NAME="${LEGACY_CONTAINER_NAME:-detailed-fishing-logbook}"

cd "$(dirname "$0")"

if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE="docker-compose"
else
  echo "Docker Compose is required. Install Docker Desktop or docker compose first." >&2
  exit 1
fi

echo "Stopping any running Selfhostable Fishing Logbook container..."
$COMPOSE down --remove-orphans

for name in "$CONTAINER_NAME" "$LEGACY_CONTAINER_NAME"; do
  if docker ps -a --format '{{.Names}}' | grep -Fx "$name" >/dev/null 2>&1; then
    docker stop "$name" >/dev/null 2>&1 || true
    docker rm "$name" >/dev/null 2>&1 || true
  fi
done

mkdir -p data

echo "Building and starting Selfhostable Fishing Logbook..."
$COMPOSE up --build -d

echo "Selfhostable Fishing Logbook is running at $APP_URL"
