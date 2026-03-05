#!/usr/bin/env sh
set -eu

if [ "${1:-}" = "" ]; then
  echo "Usage: sh scripts/enable-logging.sh <username>"
  exit 1
fi

CTF_USER="$1"
log_dir=".ctf/runtime/${CTF_USER}"
log_file="${log_dir}/commands.log"
current_user_file=".ctf/runtime/current-user.txt"

mkdir -p "$log_dir"
touch "$log_file"
printf '%s\n' "$CTF_USER" > "$current_user_file"

echo "CTF user saved: $CTF_USER"
echo "Command log file: $log_file"
echo "Note: In limited web shells (like StackBlitz), automatic shell hooks may be unavailable."
echo "When no command log is captured, command-based checks are skipped automatically."
