#!/usr/bin/env node
const { loadEnv } = require("./lib/env");
loadEnv();
const { loadSession, reportSuccess } = require("./lib/central-client");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const t = argv[i];
    if (t.startsWith("--")) {
      const key = t.slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
      args[key] = value;
    }
  }
  return args;
}

(async function main() {
  const args = parseArgs(process.argv.slice(2));
  const challengeId = String(args.challenge || "").trim();
  const points = Number(args.points || 0);
  const source = String(args.source || "manual-cli");

  if (!challengeId) {
    console.error("Missing --challenge <id>");
    process.exit(1);
  }

  const session = loadSession();
  if (!session) {
    console.error("No local session. Open student UI and sign up first.");
    process.exit(1);
  }

  const result = await reportSuccess(session, challengeId, points, source);
  console.log(JSON.stringify(result, null, 2));
})();
