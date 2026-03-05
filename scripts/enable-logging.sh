#!/usr/bin/env bash
set -euo pipefail

if [ "${1:-}" = "" ]; then
  echo "Usage: source scripts/enable-logging.sh <username>"
  return 1 2>/dev/null || exit 1
fi

CTF_USER="$1"
export CTF_USER

log_dir=".ctf/runtime/${CTF_USER}"
log_file="${log_dir}/commands.log"
mkdir -p "$log_dir"
touch "$log_file"

if [ -n "${ZSH_VERSION:-}" ]; then
  ctf_log_command_zsh() {
    local cmd="$1"
    printf '%s|%s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$cmd" >> "$log_file"
  }
  autoload -Uz add-zsh-hook
  add-zsh-hook preexec ctf_log_command_zsh
  echo "CTF logging enabled for zsh user: $CTF_USER"
elif [ -n "${BASH_VERSION:-}" ]; then
  ctf_log_command_bash() {
    if [ -n "${BASH_COMMAND:-}" ]; then
      printf '%s|%s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$BASH_COMMAND" >> "$log_file"
    fi
  }
  trap 'ctf_log_command_bash' DEBUG
  echo "CTF logging enabled for bash user: $CTF_USER"
else
  echo "Unsupported shell for command logging."
  return 1 2>/dev/null || exit 1
fi

echo "Logs: $log_file"
