#!/usr/bin/env node
const { loadEnv } = require("./lib/env");
loadEnv();
const http = require("http");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const {
  registerOrRejoin,
  reportSuccess,
  fetchProgress,
  saveSession,
  loadSession
} = require("./lib/central-client");

const ROOT = path.resolve(__dirname, "..");
const WEB_ROOT = path.join(ROOT, "web", "student");
const PORT = Number(process.env.CTF_STUDENT_PORT || 3210);
const HOST = process.env.CTF_STUDENT_HOST || "127.0.0.1";

const CHALLENGE_FILE = path.join(ROOT, "challenges", "challenges.json");
const SUBMISSION_DIR = path.join(ROOT, "submissions");
const LEADERBOARD_FILE = path.join(ROOT, "data", "leaderboard.json");
const pendingFile = path.join(ROOT, ".ctf", "runtime", "pending-successes.jsonl");
let hydratedSessionKey = null;

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function text(res, status, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, { "content-type": contentType });
  res.end(body);
}

function serveFile(res, filePath, contentType) {
  if (!fs.existsSync(filePath)) {
    text(res, 404, "Not found");
    return;
  }
  text(res, 200, fs.readFileSync(filePath), contentType);
}

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function loadChallenges() {
  if (!fs.existsSync(CHALLENGE_FILE)) return [];
  return readJSON(CHALLENGE_FILE);
}

function applyUser(str, user) {
  return String(str).replaceAll("{user}", user);
}

function resolvePath(p, user) {
  return path.join(ROOT, applyUser(p, user));
}

function commandLogFor(user) {
  return path.join(ROOT, ".ctf", "runtime", user, "commands.log");
}

function readCommandLog(user) {
  const file = commandLogFor(user);
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, "utf8");
}

function runGit(repoPath, cmd) {
  return execSync(`git -C '${repoPath.replace(/'/g, "'\\''")}' ${cmd}`, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function evaluateCheck(check, user) {
  const fail = (message) => ({ pass: false, message });

  try {
    if (check.type === "path_exists") {
      const p = resolvePath(check.path, user);
      if (!fs.existsSync(p)) return fail(`Missing path: ${check.path}`);
      if (check.kind === "file" && !fs.statSync(p).isFile()) return fail(`Not a file: ${check.path}`);
      if (check.kind === "dir" && !fs.statSync(p).isDirectory()) return fail(`Not a directory: ${check.path}`);
      return { pass: true, message: `OK path_exists ${check.path}` };
    }

    if (check.type === "path_missing") {
      const p = resolvePath(check.path, user);
      if (fs.existsSync(p)) return fail(`Path should be missing: ${check.path}`);
      return { pass: true, message: `OK path_missing ${check.path}` };
    }

    if (check.type === "file_contains") {
      const p = resolvePath(check.path, user);
      if (!fs.existsSync(p)) return fail(`File missing: ${check.path}`);
      const content = fs.readFileSync(p, "utf8");
      if (!content.includes(applyUser(check.text, user))) return fail(`Text not found in ${check.path}`);
      return { pass: true, message: `OK file_contains ${check.path}` };
    }

    if (check.type === "file_contains_regex") {
      const p = resolvePath(check.path, user);
      if (!fs.existsSync(p)) return fail(`File missing: ${check.path}`);
      const content = fs.readFileSync(p, "utf8");
      const regex = new RegExp(applyUser(check.regex, user), check.flags || "");
      if (!regex.test(content)) return fail(`Regex not matched in ${check.path}`);
      return { pass: true, message: `OK file_contains_regex ${check.path}` };
    }

    if (check.type === "command_logged") {
      const log = readCommandLog(user);
      if (!log || !log.trim()) {
        return { pass: true, message: `SKIP command_logged ${check.regex} (no command log available)` };
      }
      const regex = new RegExp(applyUser(check.regex, user));
      if (!regex.test(log)) return fail(`Command pattern not logged: ${check.regex}`);
      return { pass: true, message: `OK command_logged ${check.regex}` };
    }

    if (check.type === "git_commit_count_min") {
      const repo = resolvePath(check.repo, user);
      const count = Number(runGit(repo, "rev-list --count HEAD"));
      if (Number.isNaN(count) || count < Number(check.min)) return fail(`Need at least ${check.min} commits in ${check.repo}`);
      return { pass: true, message: `OK git_commit_count_min ${check.repo}` };
    }

    if (check.type === "git_commit_message_regex") {
      const repo = resolvePath(check.repo, user);
      const logs = runGit(repo, "log --pretty=%s -n 30");
      const regex = new RegExp(applyUser(check.regex, user));
      if (!regex.test(logs)) return fail(`Commit message regex not found: ${check.regex}`);
      return { pass: true, message: `OK git_commit_message_regex ${check.regex}` };
    }

    if (check.type === "git_branch_exists") {
      const repo = resolvePath(check.repo, user);
      const branches = runGit(repo, "branch --list");
      const regex = new RegExp(`(^|\\n)[* ]\\s*${check.branch.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}(\\n|$)`);
      if (!regex.test(branches + "\n")) return fail(`Branch not found: ${check.branch}`);
      return { pass: true, message: `OK git_branch_exists ${check.branch}` };
    }

    return fail(`Unknown check type: ${check.type}`);
  } catch (error) {
    return fail(`Error in check ${check.type}: ${error.message}`);
  }
}

function checkChallenge(challenge, user) {
  const checks = challenge.checks || [];
  const results = checks.map((check) => evaluateCheck(check, user));
  const passed = results.every((r) => r.pass);
  return { passed, results };
}

function loadSubmission(user) {
  const file = path.join(SUBMISSION_DIR, `${user}.json`);
  if (!fs.existsSync(file)) {
    return { user, completed: [], points: 0, updatedAt: null };
  }
  return readJSON(file);
}

function saveSubmission(user, submission) {
  writeJSON(path.join(SUBMISSION_DIR, `${user}.json`), submission);
}

function scoreSubmission(submission, challenges) {
  const challengeById = new Map(challenges.map((c) => [c.id, c]));
  const unique = Array.from(new Set(submission.completed));
  const points = unique.reduce((sum, id) => sum + (challengeById.get(id)?.points || 0), 0);
  return { ...submission, completed: unique, points };
}

function loadAllSubmissions(challenges) {
  if (!fs.existsSync(SUBMISSION_DIR)) return [];
  return fs
    .readdirSync(SUBMISSION_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => scoreSubmission(readJSON(path.join(SUBMISSION_DIR, f)), challenges));
}

function updateLeaderboard(allSubmissions) {
  const players = allSubmissions
    .map((entry) => ({
      user: entry.user,
      points: entry.points,
      completedCount: entry.completed.length
    }))
    .sort((a, b) => b.points - a.points || b.completedCount - a.completedCount || a.user.localeCompare(b.user));

  writeJSON(LEADERBOARD_FILE, {
    updatedAt: new Date().toISOString(),
    players
  });
}

function firstIncompleteIndex(challenges, completedSet) {
  return challenges.findIndex((c) => !completedSet.has(c.id));
}

function buildProgressBars(challenges, completedSet) {
  const categories = ["markdown", "unix", "git"];
  return categories.map((key) => {
    const total = challenges.filter((c) => String(c.category || "").toLowerCase() === key).length;
    const done = challenges.filter((c) => String(c.category || "").toLowerCase() === key && completedSet.has(c.id)).length;
    const percent = total > 0 ? Math.round((done / total) * 100) : 0;
    return {
      key,
      label: key.charAt(0).toUpperCase() + key.slice(1),
      done,
      total,
      percent
    };
  });
}

function buildChallengeState(user, options = {}) {
  const autoAdvance = options.autoAdvance !== false;
  const challenges = loadChallenges();

  let submission = scoreSubmission(loadSubmission(user), challenges);
  const completedSet = new Set(submission.completed);
  const newlyPassed = [];

  let currentIndex = firstIncompleteIndex(challenges, completedSet);
  let currentResult = null;

  while (currentIndex !== -1) {
    const challenge = challenges[currentIndex];
    const result = checkChallenge(challenge, user);
    currentResult = result;

    if (!(autoAdvance && result.passed)) {
      break;
    }

    if (!completedSet.has(challenge.id)) {
      completedSet.add(challenge.id);
      submission.completed.push(challenge.id);
      newlyPassed.push(challenge);
    }

    currentIndex = firstIncompleteIndex(challenges, completedSet);
    currentResult = null;
  }

  if (newlyPassed.length > 0) {
    submission.updatedAt = new Date().toISOString();
    submission = scoreSubmission(submission, challenges);
    saveSubmission(user, submission);
    updateLeaderboard(loadAllSubmissions(challenges));
  } else {
    submission = scoreSubmission(submission, challenges);
  }

  if (currentIndex !== -1 && !currentResult) {
    currentResult = checkChallenge(challenges[currentIndex], user);
  }

  const challengeList = challenges.map((challenge, index) => ({
    id: challenge.id,
    title: challenge.title,
    brief: challenge.brief,
    category: challenge.category,
    level: challenge.level,
    points: challenge.points,
    status: completedSet.has(challenge.id) ? "completed" : index === currentIndex ? "current" : "locked"
  }));

  const currentChallenge = currentIndex === -1
    ? null
    : {
        id: challenges[currentIndex].id,
        title: challenges[currentIndex].title,
        brief: challenges[currentIndex].brief,
        hint: challenges[currentIndex].hint || "",
        category: challenges[currentIndex].category,
        level: challenges[currentIndex].level,
        points: challenges[currentIndex].points,
        guide: (challenges[currentIndex].guide || []).map((step) => applyUser(step, user)),
        results: currentResult ? currentResult.results : [],
        passed: Boolean(currentResult && currentResult.passed)
      };

  return {
    user,
    challenges: challengeList,
    currentIndex,
    currentChallenge,
    allCompleted: currentIndex === -1 && challenges.length > 0,
    completedCount: completedSet.size,
    totalCount: challenges.length,
    progressBars: buildProgressBars(challenges, completedSet),
    newlyPassed: newlyPassed.map((c) => ({ id: c.id, points: Number(c.points || 0) }))
  };
}

async function hydrateSubmissionFromCentral(session) {
  if (!session || !session.name || !session.studentId) return;

  const challenges = loadChallenges();
  const knownIds = new Set(challenges.map((c) => c.id));
  let submission = scoreSubmission(loadSubmission(session.name), challenges);
  const merged = new Set(submission.completed);
  const localCount = merged.size;

  let remote;
  try {
    remote = await fetchProgress(session);
  } catch {
    return;
  }

  let changed = false;

  const remoteIds = Array.isArray(remote.completedIds) ? remote.completedIds : [];
  if (remoteIds.length > 0) {
    for (const id of remoteIds) {
      if (knownIds.has(id) && !merged.has(id)) {
        merged.add(id);
        changed = true;
      }
    }
  } else {
    const targetCount = Math.max(0, Math.floor(Number(remote.completedCount || 0)));
    if (targetCount > localCount) {
      for (const challenge of challenges) {
        if (merged.size >= targetCount) break;
        if (!merged.has(challenge.id)) {
          merged.add(challenge.id);
          changed = true;
        }
      }
    }
  }

  if (!changed) return;

  submission.completed = Array.from(merged);
  submission.updatedAt = new Date().toISOString();
  submission = scoreSubmission(submission, challenges);
  saveSubmission(session.name, submission);
  updateLeaderboard(loadAllSubmissions(challenges));
}

async function ensureHydrated(session) {
  if (!session || !session.studentId || !session.name) return;
  const key = `${session.studentId}:${session.name.toLowerCase()}`;
  if (hydratedSessionKey === key) return;
  await hydrateSubmissionFromCentral(session);
  hydratedSessionKey = key;
}

function appendPending(event) {
  fs.mkdirSync(path.dirname(pendingFile), { recursive: true });
  fs.appendFileSync(pendingFile, JSON.stringify(event) + "\n", "utf8");
}

async function flushPending() {
  const session = loadSession();
  if (!session || !session.studentId || !fs.existsSync(pendingFile)) return;

  const lines = fs
    .readFileSync(pendingFile, "utf8")
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);

  if (lines.length === 0) return;

  const keep = [];
  for (const line of lines) {
    try {
      const evt = JSON.parse(line);
      await reportSuccess(session, evt.challengeId, evt.points, evt.source || "local-agent");
    } catch {
      keep.push(line);
    }
  }

  fs.writeFileSync(pendingFile, keep.join("\n") + (keep.length ? "\n" : ""), "utf8");
}

async function syncNewlyPassed(session, newlyPassed) {
  for (const item of newlyPassed) {
    const payload = {
      challengeId: item.id,
      points: item.points,
      source: "student-agent-autocheck",
      createdAt: new Date().toISOString()
    };

    if (!session || !session.studentId) {
      appendPending(payload);
      continue;
    }

    try {
      await reportSuccess(session, payload.challengeId, payload.points, payload.source);
    } catch {
      appendPending(payload);
    }
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (!req.url) return text(res, 400, "Bad request");

    const requestUrl = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
    const pathname = requestUrl.pathname;

    if (req.method === "GET" && (pathname === "/" || pathname === "/index.html")) {
      return serveFile(res, path.join(WEB_ROOT, "index.html"), "text/html; charset=utf-8");
    }

    if (req.method === "GET" && pathname === "/app.js") {
      return serveFile(res, path.join(WEB_ROOT, "app.js"), "application/javascript; charset=utf-8");
    }

    if (req.method === "GET" && pathname === "/styles.css") {
      return serveFile(res, path.join(WEB_ROOT, "styles.css"), "text/css; charset=utf-8");
    }

    if (req.method === "GET" && pathname === "/api/status") {
      const session = loadSession();
      return json(res, 200, {
        session,
        codespaceName: process.env.CODESPACE_NAME || null,
        centralConfigured: Boolean(process.env.CTF_CENTRAL_URL && process.env.CTF_COURSE_KEY)
      });
    }

    if (req.method === "GET" && pathname === "/api/challenges/state") {
      const session = loadSession();
      if (!session || !session.name) {
        return json(res, 401, { error: "No local session. Sign up first." });
      }

      await ensureHydrated(session);
      const state = buildChallengeState(session.name, { autoAdvance: true });
      await syncNewlyPassed(session, state.newlyPassed);
      return json(res, 200, {
        ok: true,
        session,
        ...state
      });
    }

    if (req.method === "POST" && pathname === "/api/challenges/check") {
      const session = loadSession();
      if (!session || !session.name) {
        return json(res, 401, { error: "No local session. Sign up first." });
      }

      await ensureHydrated(session);
      const state = buildChallengeState(session.name, { autoAdvance: true });
      await syncNewlyPassed(session, state.newlyPassed);
      return json(res, 200, {
        ok: true,
        session,
        ...state
      });
    }

    if (req.method === "POST" && pathname === "/api/signup") {
      const body = await readBody(req);
      const name = String(body.name || "").trim();
      if (!name) return json(res, 400, { error: "Missing name" });

      try {
        const central = await registerOrRejoin(name);
        const session = {
          studentId: central.studentId,
          name: central.name,
          registeredAt: new Date().toISOString(),
          offline: false
        };
        hydratedSessionKey = null;
        saveSession(session);
        await flushPending();
        await ensureHydrated(session);
        return json(res, 200, { ok: true, session });
      } catch (error) {
        const errorMessage = error && error.message ? error.message : "fetch failed";
        const hintMessage = /route not found \(404\)/i.test(errorMessage)
          ? "Central API routes are missing on this Convex deployment. Run `npm run convex:deploy` for the central backend, then click Join / Rejoin again."
          : "Central registration unavailable. Joined locally; retry Join/Rejoin later to sync.";
        const session = {
          studentId: null,
          name,
          registeredAt: new Date().toISOString(),
          offline: true,
          lastCentralError: errorMessage
        };
        saveSession(session);
        hydratedSessionKey = null;
        return json(res, 202, {
          ok: false,
          offline: true,
          session,
          message: hintMessage,
          error: errorMessage
        });
      }
    }

    if (req.method === "POST" && pathname === "/api/report-success") {
      const session = loadSession();
      if (!session) return json(res, 401, { error: "No local session. Sign up first." });

      const body = await readBody(req);
      const challengeId = String(body.challengeId || "").trim();
      const points = Number(body.points || 0);
      if (!challengeId) return json(res, 400, { error: "Missing challengeId" });

      const payload = {
        challengeId,
        points,
        source: String(body.source || "local-agent"),
        createdAt: new Date().toISOString()
      };

      if (!session.studentId) {
        appendPending(payload);
        return json(res, 202, {
          ok: false,
          queued: true,
          message: "Session not synced with central yet. Event queued."
        });
      }

      try {
        const result = await reportSuccess(session, payload.challengeId, payload.points, payload.source);
        return json(res, 200, { ok: true, result });
      } catch {
        appendPending(payload);
        return json(res, 202, {
          ok: false,
          queued: true,
          message: "Central server unreachable. Event queued for retry."
        });
      }
    }

    return text(res, 404, "Not found");
  } catch (error) {
    return json(res, 500, { error: error.message || "Internal server error" });
  }
});

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString("utf8");
      if (body.length > 1_000_000) {
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

server.on("error", (err) => {
  console.error(`Student agent failed on ${HOST}:${PORT}: ${err.message}`);
  process.exit(1);
});

server.listen(PORT, HOST, async () => {
  console.log(`Student agent running at http://${HOST}:${PORT}`);
  await flushPending();
});
