#!/bin/sh
set -eu

secret_file="${SECRET_KEY_FILE:-/app/data/.secret_key}"

if [ -z "${SECRET_KEY:-}" ]; then
  if [ -s "$secret_file" ]; then
    SECRET_KEY="$(awk 'NR == 1 { print; exit }' "$secret_file")"
  else
    SECRET_KEY="$(python -c 'import secrets; print(secrets.token_hex(32))')"
    umask 077
    printf '%s\n' "$SECRET_KEY" > "$secret_file"
  fi
  export SECRET_KEY
fi

exec "$@"
