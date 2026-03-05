#!/usr/bin/env sh
set -eu

mkdir -p .ctf/runtime submissions workspaces data

if [ ! -f data/leaderboard.json ]; then
  printf '{\n  "updatedAt": null,\n  "players": []\n}\n' > data/leaderboard.json
fi

if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
    echo "Created .env from .env.example"
  else
    : > .env
    echo "Created empty .env (no .env.example found)"
  fi
fi

echo "CTF classroom setup complete."
echo "Fill .env with CTF_CENTRAL_URL and CTF_COURSE_KEY"
echo "Then run: npm run start:student-agent:bg"
