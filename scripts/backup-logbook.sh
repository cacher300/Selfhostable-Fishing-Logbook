#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
APP_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)

DATA_FILE="${DATA_FILE:-$APP_DIR/data/logbook.json}"
UPLOADS_DIR="${UPLOADS_DIR:-$APP_DIR/data/uploads}"
LOCAL_BACKUP_DIR="${LOCAL_BACKUP_DIR:-$APP_DIR/backups}"
NAS_BACKUP_TARGET="${NAS_BACKUP_TARGET:-}"
SSH_KEY_PATH="${SSH_KEY_PATH:-}"
KEEP_MONTHLY_BACKUPS="${KEEP_MONTHLY_BACKUPS:-3}"
LOCK_DIR="$LOCAL_BACKUP_DIR/.backup.lock"

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
