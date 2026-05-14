#!/usr/bin/env sh
set -eu

APP_URL="${APP_URL:-http://127.0.0.1}"
CONTAINER_NAME="${CONTAINER_NAME:-detailed-fishing-logbook}"
NAS_BACKUP_TARGET="${NAS_BACKUP_TARGET:-Default@192.168.3.30:/volume1/FishingBackups}"
SSH_KEY_PATH="${SSH_KEY_PATH:-$HOME/.ssh/fishing_logbook_backup}"
KEEP_MONTHLY_BACKUPS="${KEEP_MONTHLY_BACKUPS:-3}"

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

if command -v crontab >/dev/null 2>&1; then
  echo "Installing nightly NAS backup job..."
  NAS_BACKUP_TARGET="$NAS_BACKUP_TARGET" SSH_KEY_PATH="$SSH_KEY_PATH" KEEP_MONTHLY_BACKUPS="$KEEP_MONTHLY_BACKUPS" ./scripts/install-nightly-backup.sh "$NAS_BACKUP_TARGET"
else
  echo "crontab is not available; skipping nightly backup install." >&2
fi

echo "Building and starting Fishing Logbook..."
$COMPOSE up --build -d

echo "Fishing Logbook is running at $APP_URL"
