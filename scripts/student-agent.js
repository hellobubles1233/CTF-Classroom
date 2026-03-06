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

function checkLabel(check, user) {
  const withUser = (value) => {
    const raw = String(value || "");
    return user ? applyUser(raw, user) : raw;
  };

  switch (check.type) {
    case "path_exists":
      return `Pfad vorhanden: ${withUser(check.path)}`;
    case "path_missing":
      return `Pfad fehlt: ${withUser(check.path)}`;
    case "file_contains":
      return `Text in Datei: ${withUser(check.path)}`;
    case "file_contains_regex":
      return `Format in Datei: ${withUser(check.path)}`;
    case "command_logged":
      return "Befehl protokolliert";
    case "git_commit_count_min":
      return `Commit-Anzahl: ${withUser(check.repo)}`;
    case "git_commit_message_regex":
      return `Commit-Text: ${withUser(check.repo)}`;
    case "git_branch_exists":
      return `Branch vorhanden: ${check.branch || ""}`.trim();
    default:
      return check.type || "Check";
  }
}

function evaluateCheck(check, user) {
  const label = checkLabel(check, user);
  const fail = (message) => ({ pass: false, message, label });

  try {
    if (check.type === "path_exists") {
      const p = resolvePath(check.path, user);
      if (!fs.existsSync(p)) return fail(`Missing path: ${check.path}`);
      if (check.kind === "file" && !fs.statSync(p).isFile()) return fail(`Not a file: ${check.path}`);
      if (check.kind === "dir" && !fs.statSync(p).isDirectory()) return fail(`Not a directory: ${check.path}`);
      return { pass: true, message: `OK path_exists ${check.path}`, label };
    }

    if (check.type === "path_missing") {
      const p = resolvePath(check.path, user);
      if (fs.existsSync(p)) return fail(`Path should be missing: ${check.path}`);
      return { pass: true, message: `OK path_missing ${check.path}`, label };
    }

    if (check.type === "file_contains") {
      const p = resolvePath(check.path, user);
      if (!fs.existsSync(p)) return fail(`File missing: ${check.path}`);
      const content = fs.readFileSync(p, "utf8");
      if (!content.includes(applyUser(check.text, user))) return fail(`Text not found in ${check.path}`);
      return { pass: true, message: `OK file_contains ${check.path}`, label };
    }

    if (check.type === "file_contains_regex") {
      const p = resolvePath(check.path, user);
      if (!fs.existsSync(p)) return fail(`File missing: ${check.path}`);
      const content = fs.readFileSync(p, "utf8");
      const regex = new RegExp(applyUser(check.regex, user), check.flags || "");
      if (!regex.test(content)) return fail(`Regex not matched in ${check.path}`);
      return { pass: true, message: `OK file_contains_regex ${check.path}`, label };
    }

    if (check.type === "command_logged") {
      const log = readCommandLog(user);
      if (!log || !log.trim()) {
        return { pass: true, message: `SKIP command_logged ${check.regex} (no command log available)`, label };
      }
      const regex = new RegExp(applyUser(check.regex, user));
      if (!regex.test(log)) return fail(`Command pattern not logged: ${check.regex}`);
      return { pass: true, message: `OK command_logged ${check.regex}`, label };
    }

    if (check.type === "git_commit_count_min") {
      const repo = resolvePath(check.repo, user);
      const count = Number(runGit(repo, "rev-list --count HEAD"));
      if (Number.isNaN(count) || count < Number(check.min)) return fail(`Need at least ${check.min} commits in ${check.repo}`);
      return { pass: true, message: `OK git_commit_count_min ${check.repo}`, label };
    }

    if (check.type === "git_commit_message_regex") {
      const repo = resolvePath(check.repo, user);
      const logs = runGit(repo, "log --pretty=%s -n 30");
      const regex = new RegExp(applyUser(check.regex, user));
      if (!regex.test(logs)) return fail(`Commit message regex not found: ${check.regex}`);
      return { pass: true, message: `OK git_commit_message_regex ${check.regex}`, label };
    }

    if (check.type === "git_branch_exists") {
      const repo = resolvePath(check.repo, user);
      const branches = runGit(repo, "branch --list");
      const regex = new RegExp(`(^|\\n)[* ]\\s*${check.branch.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}(\\n|$)`);
      if (!regex.test(branches + "\n")) return fail(`Branch not found: ${check.branch}`);
      return { pass: true, message: `OK git_branch_exists ${check.branch}`, label };
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

function completedChallengeResult(challenge, user) {
  const checks = challenge && Array.isArray(challenge.checks) ? challenge.checks : [];
  return {
    passed: true,
    results: checks.map((check) => ({
      pass: true,
      message: `Restored from saved progress: ${check.type}`,
      label: checkLabel(check, user)
    }))
  };
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

function buildChallengeView(challenge, user, result, isCurrent, isCompleted) {
  if (!challenge) return null;
  return {
    id: challenge.id,
    title: challenge.title,
    brief: challenge.brief,
    hint: challenge.hint || "",
    category: challenge.category,
    level: challenge.level,
    points: challenge.points,
    guide: (challenge.guide || []).map((step) => applyUser(step, user)),
    results: result ? result.results : [],
    passed: Boolean(result && result.passed),
    isCurrent,
    isCompleted
  };
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
  const viewChallengeId = options.viewChallengeId || null;
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
    : buildChallengeView(
      challenges[currentIndex],
      user,
      currentResult,
      true,
      completedSet.has(challenges[currentIndex].id)
    );

  let viewIndex = currentIndex;
  if (viewChallengeId) {
    const idx = challenges.findIndex((c) => c.id === viewChallengeId);
    if (idx !== -1) {
      const isCurrent = idx === currentIndex;
      const isCompleted = completedSet.has(challenges[idx].id);
      if (isCurrent || isCompleted) {
        viewIndex = idx;
      }
    }
  }

  let viewResult = null;
  if (viewIndex !== -1) {
    if (viewIndex === currentIndex) {
      viewResult = currentResult;
    } else if (completedSet.has(challenges[viewIndex].id)) {
      viewResult = completedChallengeResult(challenges[viewIndex], user);
    } else {
      viewResult = checkChallenge(challenges[viewIndex], user);
    }
  }

  const viewChallenge = viewIndex === -1
    ? null
    : buildChallengeView(
      challenges[viewIndex],
      user,
      viewResult,
      viewIndex === currentIndex,
      completedSet.has(challenges[viewIndex].id)
    );

  return {
    user,
    challenges: challengeList,
    currentIndex,
    currentChallenge,
    viewChallenge,
    viewChallengeId: viewChallenge ? viewChallenge.id : null,
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

function ensureGuideCommandsLogged(challenge, user) {
  const guide = Array.isArray(challenge.guide) ? challenge.guide : [];
  const commands = guide
    .map((step) => applyUser(String(step || ""), user))
    .map((step) => {
      const match = step.match(/^Run:\s*(.+)$/i);
      return match ? match[1].trim() : null;
    })
    .filter(Boolean);

  if (commands.length === 0) return;

  const file = commandLogFor(user);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const existing = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const lines = [];
  for (const cmd of commands) {
    if (!existing.includes(cmd)) {
      lines.push(`${new Date().toISOString()}|${cmd}`);
    }
  }
  if (lines.length > 0) {
    fs.appendFileSync(file, `${lines.join("\n")}\n`, "utf8");
  }
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function runGitMaybe(repoPath, cmd) {
  try {
    return runGit(repoPath, cmd);
  } catch {
    return "";
  }
}

function ensureGitRepo(repoPath) {
  fs.mkdirSync(repoPath, { recursive: true });
  const gitDir = path.join(repoPath, ".git");
  if (fs.existsSync(gitDir) && fs.statSync(gitDir).isDirectory()) return;
  try {
    runGit(repoPath, "init -b main");
  } catch {
    runGitMaybe(repoPath, "init");
  }
}

function gitCommitAllowEmpty(repoPath, message) {
  const msg = String(message || "restore: progress sync");
  runGitMaybe(
    repoPath,
    `-c user.name=${shellQuote("CTF Restore")} -c user.email=${shellQuote("ctf-restore@local")} commit --allow-empty -m ${shellQuote(msg)}`
  );
}

function gitCommitCount(repoPath) {
  const raw = runGitMaybe(repoPath, "rev-list --count HEAD");
  const count = Number(raw);
  return Number.isFinite(count) ? count : 0;
}

function ensureGitCommitCount(repoPath, minCount) {
  const min = Math.max(0, Number(minCount || 0));
  ensureGitRepo(repoPath);
  let count = gitCommitCount(repoPath);
  while (count < min) {
    gitCommitAllowEmpty(repoPath, `restore: commit ${count + 1}`);
    const next = gitCommitCount(repoPath);
    if (next <= count) break;
    count = next;
  }
}

function commitMessageFromRegex(regexSource) {
  let value = String(regexSource || "").trim();
  value = value.replace(/^\^/, "").replace(/\$$/, "");
  value = value.replace(/\\s\+/g, " ");
  value = value.replace(/\\s\*/g, " ");
  value = value.replace(/\\([:/._-])/g, "$1");
  value = value.replace(/[()|[\]{}]/g, "");
  value = value.replace(/[+*?]/g, "");
  value = value.replace(/\s+/g, " ").trim();
  if (!value || value.length > 120) return "restore: progress sync";
  return value;
}

function ensureGitCommitMessage(repoPath, regexSource, user) {
  const source = applyUser(String(regexSource || ""), user);
  if (!source) return;
  ensureGitCommitCount(repoPath, 1);
  const logs = runGitMaybe(repoPath, "log --pretty=%s -n 50");
  const regex = new RegExp(source);
  if (regex.test(logs)) return;
  gitCommitAllowEmpty(repoPath, commitMessageFromRegex(source));
}

function ensureGitBranch(repoPath, branchName) {
  if (!branchName) return;
  ensureGitCommitCount(repoPath, 1);
  const branches = `${runGitMaybe(repoPath, "branch --list")}\n`;
  const escaped = String(branchName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(^|\\n)[* ]\\s*${escaped}(\\n|$)`);
  if (regex.test(branches)) return;
  runGitMaybe(repoPath, `branch ${shellQuote(String(branchName))}`);
}

function regexSampleContent(regexSource, targetPath) {
  const source = String(regexSource || "");
  const lowerPath = String(targetPath || "").toLowerCase();
  const samples = [];

  if (lowerPath.endsWith(".md")) {
    if (source.includes("^#\\s+")) samples.push("# Titel\n");
    if (source.includes("^##\\s+")) samples.push("## Untertitel\n");
    if (source.includes("^###\\s+")) samples.push("### Abschnitt\n");
    if (source.includes("^####\\s+")) samples.push("#### Detail\n");
    if (source.includes("^#####\\s+")) samples.push("##### Extra\n");
    if (source.includes("^######\\s+")) samples.push("###### Fein\n");
    if (source.includes("^-\\s+")) samples.push("- Punkt\n");
    if (source.includes("^\\d+\\.\\s+")) samples.push("1. Schritt\n");
    if (source.includes("^[ \\t]{2,}[-*]\\s+")) samples.push("  - Unterpunkt\n");
    if (source.includes("^>\\s+")) samples.push("> Hinweis\n");
    if (source.includes("hello\\s+world")) samples.push("Hello World\n");
    if (source.includes("\\[[^\\]]+\\]\\(https?:\\/\\/[^)]+\\)")) samples.push("[Link](https://example.com)\n");
    if (source.includes("!\\[[^\\]]*\\]\\([^)]+\\)")) samples.push("![Bild](https://example.com/image.png)\n");
    if (source.includes("\\|[^\\n]+\\|[^\\n]+\\|")) {
      samples.push("| Spalte A | Spalte B |\n| --- | --- |\n| Wert 1 | Wert 2 |\n");
    }
  }

  if (source.includes("\\d+")) samples.push("3\n");
  if (samples.length === 0) samples.push("Restored\n");

  return samples;
}

function ensureFileMatchesRegex(targetPath, check, user) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const source = applyUser(String(check.regex || ""), user);
  const regex = new RegExp(source, check.flags || "");
  const existing = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, "utf8") : "";
  if (regex.test(existing)) return;

  for (const sample of regexSampleContent(source, targetPath)) {
    const merged = existing
      ? `${existing.replace(/\s*$/, "")}\n${String(sample).replace(/\s*$/, "")}\n`
      : String(sample);
    if (regex.test(merged)) {
      fs.writeFileSync(targetPath, merged, "utf8");
      return;
    }
  }

  if (!existing) {
    fs.writeFileSync(targetPath, "Restored\n", "utf8");
  }
}

function restoreChallengeArtifacts(challenge, user) {
  if (!challenge) return;
  const checks = Array.isArray(challenge.checks) ? challenge.checks : [];

  for (const check of checks) {
    const targetPath = check.path ? resolvePath(check.path, user) : null;
    const repoPath = check.repo ? resolvePath(check.repo, user) : null;

    if (check.type === "path_exists" && targetPath) {
      if (check.kind === "dir" && path.basename(targetPath) === ".git") {
        ensureGitRepo(path.dirname(targetPath));
        continue;
      }
      if (check.kind === "dir") {
        fs.mkdirSync(targetPath, { recursive: true });
      } else if (check.kind === "file") {
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        if (!fs.existsSync(targetPath)) {
          fs.writeFileSync(targetPath, "", "utf8");
        }
      }
    }

    if (check.type === "path_missing" && targetPath) {
      fs.rmSync(targetPath, { recursive: true, force: true });
    }

    if (check.type === "file_contains" && targetPath) {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      const desired = applyUser(String(check.text || ""), user);
      const existing = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, "utf8") : "";
      if (!existing.includes(desired)) {
        const next = existing ? `${existing.trimEnd()}\n${desired}\n` : `${desired}\n`;
        fs.writeFileSync(targetPath, next, "utf8");
      }
    }

    if (check.type === "file_contains_regex" && targetPath) {
      ensureFileMatchesRegex(targetPath, check, user);
    }

    if (check.type === "git_commit_count_min" && repoPath) {
      ensureGitCommitCount(repoPath, check.min);
    }

    if (check.type === "git_commit_message_regex" && repoPath) {
      ensureGitCommitMessage(repoPath, check.regex, user);
    }

    if (check.type === "git_branch_exists" && repoPath) {
      ensureGitBranch(repoPath, check.branch);
    }
  }

  ensureGuideCommandsLogged(challenge, user);
}

function restoreCompletedChallengeArtifacts(user) {
  const challenges = loadChallenges();
  const submission = scoreSubmission(loadSubmission(user), challenges);
  const completedSet = new Set(submission.completed);

  for (const challenge of challenges) {
    if (completedSet.has(challenge.id)) {
      restoreChallengeArtifacts(challenge, user);
    }
  }
}

async function ensureHydrated(session) {
  if (!session || !session.name) return;
  const key = `${session.studentId || "local"}:${session.name.toLowerCase()}`;
  if (hydratedSessionKey === key) return;
  if (session.studentId) {
    await hydrateSubmissionFromCentral(session);
  }
  restoreCompletedChallengeArtifacts(session.name);
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

      const viewChallengeIdRaw = requestUrl.searchParams.get("viewChallengeId");
      const viewChallengeId = viewChallengeIdRaw ? String(viewChallengeIdRaw).trim() : null;
      await ensureHydrated(session);
      const state = buildChallengeState(session.name, { autoAdvance: true, viewChallengeId });
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

      const body = await readBody(req);
      const viewChallengeIdRaw = body && body.viewChallengeId ? String(body.viewChallengeId) : "";
      const viewChallengeId = viewChallengeIdRaw.trim() || null;
      await ensureHydrated(session);
      const state = buildChallengeState(session.name, { autoAdvance: true, viewChallengeId });
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
