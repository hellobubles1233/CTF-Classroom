#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const runtimeDir = path.join(root, ".ctf", "runtime");
const submissionsDir = path.join(root, "submissions");
const workspacesDir = path.join(root, "workspaces");
const dataDir = path.join(root, "data");
const leaderboardFile = path.join(dataDir, "leaderboard.json");
const envFile = path.join(root, ".env");
const envExampleFile = path.join(root, ".env.example");

for (const dir of [runtimeDir, submissionsDir, workspacesDir, dataDir]) {
  fs.mkdirSync(dir, { recursive: true });
}

if (!fs.existsSync(leaderboardFile)) {
  fs.writeFileSync(
    leaderboardFile,
    '{\n  "updatedAt": null,\n  "players": []\n}\n'
  );
}

if (!fs.existsSync(envFile)) {
  if (fs.existsSync(envExampleFile)) {
    fs.copyFileSync(envExampleFile, envFile);
    console.log("Created .env from .env.example");
  } else {
    fs.writeFileSync(envFile, "");
    console.log("Created empty .env (no .env.example found)");
  }
}

console.log("CTF classroom setup complete.");
console.log("Fill .env with CTF_CENTRAL_URL and CTF_COURSE_KEY");
console.log("Then run: npm run start:student-agent:bg");
