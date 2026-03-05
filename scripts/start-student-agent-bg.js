#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const root = process.cwd();
const runtimeDir = path.join(root, ".ctf", "runtime");
const pidFile = path.join(runtimeDir, "student-agent.pid");
const logFile = path.join(runtimeDir, "student-agent.log");
const agentEntry = path.join(root, "scripts", "student-agent.js");
const restart = process.argv.includes("--restart");

fs.mkdirSync(runtimeDir, { recursive: true });

function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function stopIfRunning() {
  if (!fs.existsSync(pidFile)) return;

  const raw = fs.readFileSync(pidFile, "utf8").trim();
  const pid = Number(raw);
  if (!Number.isInteger(pid) || pid <= 0) return;
  if (!isRunning(pid)) return;

  if (!restart) {
    console.log("Student agent already running.");
    process.exit(0);
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // Fall through; we will still try to continue startup.
  }

  for (let i = 0; i < 20; i += 1) {
    if (!isRunning(pid)) break;
    // Wait up to ~2s for graceful shutdown.
    // eslint-disable-next-line no-await-in-loop
    await sleep(100);
  }

  if (isRunning(pid)) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // If this fails we still continue and try to start a fresh process.
    }
  }
}

async function main() {
  await stopIfRunning();

  const out = fs.openSync(logFile, "a");
  const child = spawn(process.execPath, [agentEntry], {
    detached: true,
    stdio: ["ignore", out, out],
    cwd: root,
    env: process.env
  });
  child.unref();

  fs.writeFileSync(pidFile, String(child.pid));

  console.log("Student agent started.");
  console.log(`Open: http://127.0.0.1:${process.env.CTF_STUDENT_PORT || "3210"}`);
}

main().catch((error) => {
  console.error(`Failed to start student agent: ${error && error.message ? error.message : String(error)}`);
  process.exit(1);
});
