#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
APP_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)

LOGBOOK_DIR="${LOGBOOK_DIR:-$APP_DIR}"
DATA_FILE="${DATA_FILE:-$LOGBOOK_DIR/data/logbook.json}"
UPLOADS_DIR="${UPLOADS_DIR:-$LOGBOOK_DIR/data/uploads}"
LOCAL_BACKUP_DIR="${LOCAL_BACKUP_DIR:-$LOGBOOK_DIR/backups}"
NAS_BACKUP_TARGET="${NAS_BACKUP_TARGET:-}"
SSH_KEY_PATH="${SSH_KEY_PATH:-}"
KEEP_MONTHLY_BACKUPS="${KEEP_MONTHLY_BACKUPS:-3}"
LOCK_DIR="$LOCAL_BACKUP_DIR/.backup.lock"

show_usage() {
  cat <<EOF
Usage:
  $0
  $0 --install-cron

Configuration is supplied through environment variables:
  LOGBOOK_DIR             Logbook repository or deployment directory
  DATA_FILE               JSON data file (default: LOGBOOK_DIR/data/logbook.json)
  UPLOADS_DIR             Media directory (default: LOGBOOK_DIR/data/uploads)
  LOCAL_BACKUP_DIR        Local staging directory (default: LOGBOOK_DIR/backups)
  NAS_BACKUP_TARGET       Mounted directory or user@host:/remote/directory
  SSH_KEY_PATH            Optional SSH private key
  KEEP_MONTHLY_BACKUPS    Number of monthly JSON snapshots to retain (default: 3)
  BACKUP_LOG_FILE         Cron output log (default: LOCAL_BACKUP_DIR/backup.log)
  BACKUP_CRON_SCHEDULE    Cron schedule (default: 0 3 * * *)

Nothing is scheduled unless --install-cron is explicitly used.
EOF
}

shell_quote() {
  printf "'%s'" "$(printf "%s" "$1" | sed "s/'/'\\\\''/g")"
}

install_cron() {
  if ! command -v crontab >/dev/null 2>&1; then
    echo "crontab is required to install the scheduled backup." >&2
    exit 1
  fi
  if [ -z "$NAS_BACKUP_TARGET" ]; then
    echo "Set NAS_BACKUP_TARGET before installing the scheduled backup." >&2
    exit 1
  fi

  script_path=$(CDPATH= cd -- "$SCRIPT_DIR" && pwd)/$(basename "$0")
  log_file="${BACKUP_LOG_FILE:-$LOCAL_BACKUP_DIR/backup.log}"
  schedule="${BACKUP_CRON_SCHEDULE:-0 3 * * *}"
  mkdir -p "$LOCAL_BACKUP_DIR"
  chmod +x "$script_path"

  cron_command="PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
  cron_command="$cron_command LOGBOOK_DIR=$(shell_quote "$LOGBOOK_DIR")"
  cron_command="$cron_command NAS_BACKUP_TARGET=$(shell_quote "$NAS_BACKUP_TARGET")"
  cron_command="$cron_command SSH_KEY_PATH=$(shell_quote "$SSH_KEY_PATH")"
  cron_command="$cron_command KEEP_MONTHLY_BACKUPS=$(shell_quote "$KEEP_MONTHLY_BACKUPS")"
  cron_command="$cron_command $(shell_quote "$script_path") >> $(shell_quote "$log_file") 2>&1"

  tmp_cron=$(mktemp)
  trap 'rm -f "$tmp_cron"' EXIT INT TERM
  crontab -l 2>/dev/null | grep -Fv "$script_path" > "$tmp_cron" || true
  printf "%s %s\n" "$schedule" "$cron_command" >> "$tmp_cron"
  crontab "$tmp_cron"
  rm -f "$tmp_cron"
  trap - EXIT INT TERM

  echo "Installed backup schedule: $schedule"
  echo "Target: $NAS_BACKUP_TARGET"
  echo "Log: $log_file"
}

case "${1:-}" in
  --install-cron)
    install_cron
    exit 0
    ;;
  -h|--help)
    show_usage
    exit 0
    ;;
  "")
    ;;
  *)
    show_usage >&2
    exit 2
    ;;
esac

month=$(date +"%Y-%m")
backup_name="logbook-$month.json"
backup_path="$LOCAL_BACKUP_DIR/$backup_name"
uploads_backup_path="$LOCAL_BACKUP_DIR/uploads"

if [ ! -f "$DATA_FILE" ]; then
  echo "No logbook data found at $DATA_FILE" >&2
  exit 1
fi

mkdir -p "$LOCAL_BACKUP_DIR"

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "A backup is already running; exiting." >&2
  exit 0
fi
trap 'rmdir "$LOCK_DIR"' EXIT INT TERM

cp "$DATA_FILE" "$backup_path"

if [ -d "$UPLOADS_DIR" ]; then
  mkdir -p "$uploads_backup_path"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete "$UPLOADS_DIR/" "$uploads_backup_path/"
  else
    rm -rf "$uploads_backup_path"
    mkdir -p "$uploads_backup_path"
    cp -R "$UPLOADS_DIR/." "$uploads_backup_path/"
  fi
fi

if command -v python3 >/dev/null 2>&1; then
  python3 -m json.tool "$backup_path" >/dev/null
elif command -v python >/dev/null 2>&1; then
  python -m json.tool "$backup_path" >/dev/null
fi

if [ -n "$NAS_BACKUP_TARGET" ]; then
  case "$NAS_BACKUP_TARGET" in
    *:*)
      remote_host=${NAS_BACKUP_TARGET%%:*}
      remote_dir=${NAS_BACKUP_TARGET#*:}
      if [ -n "$SSH_KEY_PATH" ]; then
        ssh -i "$SSH_KEY_PATH" -o BatchMode=yes "$remote_host" "mkdir -p '$remote_dir'"
        if command -v rsync >/dev/null 2>&1; then
          rsync -a -e "ssh -i $SSH_KEY_PATH -o BatchMode=yes" "$backup_path" "$NAS_BACKUP_TARGET/"
          if [ -d "$UPLOADS_DIR" ]; then
            rsync -a --delete -e "ssh -i $SSH_KEY_PATH -o BatchMode=yes" "$UPLOADS_DIR/" "$NAS_BACKUP_TARGET/uploads/"
          fi
        else
          scp -i "$SSH_KEY_PATH" -o BatchMode=yes "$backup_path" "$NAS_BACKUP_TARGET/"
          if [ -d "$UPLOADS_DIR" ]; then
            ssh -i "$SSH_KEY_PATH" -o BatchMode=yes "$remote_host" "rm -rf '$remote_dir/uploads'"
            scp -i "$SSH_KEY_PATH" -o BatchMode=yes -r "$UPLOADS_DIR" "$NAS_BACKUP_TARGET/"
          fi
        fi
        ssh -i "$SSH_KEY_PATH" -o BatchMode=yes "$remote_host" "cd '$remote_dir' && ls -1 logbook-????-??.json 2>/dev/null | sort -r | awk 'NR > $KEEP_MONTHLY_BACKUPS' | xargs -r rm -f"
      else
        ssh -o BatchMode=yes "$remote_host" "mkdir -p '$remote_dir'"
        if command -v rsync >/dev/null 2>&1; then
          rsync -a -e "ssh -o BatchMode=yes" "$backup_path" "$NAS_BACKUP_TARGET/"
          if [ -d "$UPLOADS_DIR" ]; then
            rsync -a --delete -e "ssh -o BatchMode=yes" "$UPLOADS_DIR/" "$NAS_BACKUP_TARGET/uploads/"
          fi
        else
          scp -o BatchMode=yes "$backup_path" "$NAS_BACKUP_TARGET/"
          if [ -d "$UPLOADS_DIR" ]; then
            ssh -o BatchMode=yes "$remote_host" "rm -rf '$remote_dir/uploads'"
            scp -o BatchMode=yes -r "$UPLOADS_DIR" "$NAS_BACKUP_TARGET/"
          fi
        fi
        ssh -o BatchMode=yes "$remote_host" "cd '$remote_dir' && ls -1 logbook-????-??.json 2>/dev/null | sort -r | awk 'NR > $KEEP_MONTHLY_BACKUPS' | xargs -r rm -f"
      fi
      ;;
    *)
      mkdir -p "$NAS_BACKUP_TARGET"
      cp "$backup_path" "$NAS_BACKUP_TARGET/"
      if [ -d "$UPLOADS_DIR" ]; then
        mkdir -p "$NAS_BACKUP_TARGET/uploads"
        if command -v rsync >/dev/null 2>&1; then
          rsync -a --delete "$UPLOADS_DIR/" "$NAS_BACKUP_TARGET/uploads/"
        else
          rm -rf "$NAS_BACKUP_TARGET/uploads"
          mkdir -p "$NAS_BACKUP_TARGET/uploads"
          cp -R "$UPLOADS_DIR/." "$NAS_BACKUP_TARGET/uploads/"
        fi
      fi
      find "$NAS_BACKUP_TARGET" -name "logbook-????-??.json" -type f | sort -r | awk "NR > $KEEP_MONTHLY_BACKUPS" | while IFS= read -r old_backup; do
        rm -f "$old_backup"
      done
      ;;
  esac
else
  echo "NAS_BACKUP_TARGET is not set; kept local backup only at $backup_path" >&2
fi

find "$LOCAL_BACKUP_DIR" -name "logbook-????-??.json" -type f | sort -r | awk "NR > $KEEP_MONTHLY_BACKUPS" | while IFS= read -r old_backup; do
  rm -f "$old_backup"
done

echo "Backup created: $backup_path"
