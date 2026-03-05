#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const root = process.cwd();
const runtimeDir = path.join(root, ".ctf", "runtime");
const pidFile = path.join(runtimeDir, "student-agent.pid");
const logFile = path.join(runtimeDir, "student-agent.log");
const agentEntry = path.join(root, "scripts", "student-agent.js");

fs.mkdirSync(runtimeDir, { recursive: true });

function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

if (fs.existsSync(pidFile)) {
  const raw = fs.readFileSync(pidFile, "utf8").trim();
  const pid = Number(raw);
  if (Number.isInteger(pid) && pid > 0 && isRunning(pid)) {
    console.log("Student agent already running.");
    process.exit(0);
  }
}

const out = fs.openSync(logFile, "a");
const child = spawn(process.execPath, [agentEntry], {
  detached: true,
  stdio: ["ignore", out, out],
  cwd: root,
  env: process.env,
});
child.unref();

fs.writeFileSync(pidFile, String(child.pid));

console.log("Student agent started.");
console.log(`Open: http://127.0.0.1:${process.env.CTF_STUDENT_PORT || "3210"}`);
