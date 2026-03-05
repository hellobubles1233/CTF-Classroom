#!/usr/bin/env bash
set -euo pipefail

mkdir -p .ctf/runtime submissions workspaces data

if [ ! -f data/leaderboard.json ]; then
  cat > data/leaderboard.json <<'JSON'
{
  "updatedAt": null,
  "players": []
}
JSON
fi

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example"
fi

echo "CTF classroom setup complete."
echo "Fill .env with CTF_CENTRAL_URL and CTF_COURSE_KEY"
echo "Then run: npm run start:student-agent:bg"
