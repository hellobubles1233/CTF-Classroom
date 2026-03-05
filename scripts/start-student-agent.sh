#!/usr/bin/env bash
set -euo pipefail

mkdir -p .ctf/runtime

if pgrep -f "node scripts/student-agent.js" >/dev/null 2>&1; then
  echo "Student agent already running."
  exit 0
fi

nohup node scripts/student-agent.js > .ctf/runtime/student-agent.log 2>&1 &

echo "Student agent started."
echo "Open: http://127.0.0.1:${CTF_STUDENT_PORT:-3210}"
