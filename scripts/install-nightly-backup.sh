#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
APP_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
BACKUP_SCRIPT="$APP_DIR/scripts/backup-logbook.sh"
LOG_FILE="$APP_DIR/backups/backup.log"
TARGET="${1:-${NAS_BACKUP_TARGET:-}}"
SSH_KEY_PATH="${SSH_KEY_PATH:-$HOME/.ssh/fishing_logbook_backup}"
KEEP_MONTHLY_BACKUPS="${KEEP_MONTHLY_BACKUPS:-3}"

if [ -z "$TARGET" ]; then
  cat >&2 <<EOF
Usage:
  $0 user@192.168.3.30:/path/to/fishing-logbook-backups

You can also pass a mounted NAS folder:
  $0 /mnt/nas/fishing-logbook-backups
EOF
  exit 1
fi

mkdir -p "$APP_DIR/backups"
chmod +x "$BACKUP_SCRIPT"

if [ ! -f "$SSH_KEY_PATH" ]; then
  echo "Warning: SSH key not found at $SSH_KEY_PATH." >&2
  echo "Create it with: ssh-keygen -t ed25519 -f $SSH_KEY_PATH -C fishing-logbook-backup" >&2
fi

cron_line="0 3 * * * PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin NAS_BACKUP_TARGET='$TARGET' SSH_KEY_PATH='$SSH_KEY_PATH' KEEP_MONTHLY_BACKUPS='$KEEP_MONTHLY_BACKUPS' '$BACKUP_SCRIPT' >> '$LOG_FILE' 2>&1"
tmp_cron=$(mktemp)

crontab -l 2>/dev/null | grep -v "$BACKUP_SCRIPT" > "$tmp_cron" || true
printf "%s\n" "$cron_line" >> "$tmp_cron"
crontab "$tmp_cron"
rm -f "$tmp_cron"

echo "Installed nightly Fishing Logbook backup for 3:00 AM."
echo "Target: $TARGET"
echo "SSH key: $SSH_KEY_PATH"
echo "Monthly backups kept: $KEEP_MONTHLY_BACKUPS"
echo "Log: $LOG_FILE"
