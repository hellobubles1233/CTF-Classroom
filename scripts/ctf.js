#!/usr/bin/env node
const { loadEnv } = require("./lib/env");
loadEnv();
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { loadSession, reportSuccess } = require("./lib/central-client");

const ROOT = path.resolve(__dirname, "..");
const CHALLENGE_FILE = path.join(ROOT, "challenges", "challenges.json");
const SUBMISSION_DIR = path.join(ROOT, "submissions");
const LEADERBOARD_FILE = path.join(ROOT, "data", "leaderboard.json");

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
      args[key] = value;
    }
  }
  return args;
}

function getUser(args) {
  const user = args.user || process.env.CTF_USER;
  if (!user) {
    throw new Error("Missing user. Provide --user <name> or set CTF_USER.");
  }
  return user;
}

function loadChallenges() {
  return readJSON(CHALLENGE_FILE);
}

function byId(challenges, id) {
  const c = challenges.find((item) => item.id === id);
  if (!c) {
    throw new Error(`Unknown challenge id: ${id}`);
  }
  return c;
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
  if (!fs.existsSync(file)) return "";
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

function printChallenge(challenge) {
  console.log(`${challenge.id} [${challenge.category}/${challenge.level}] ${challenge.title} (${challenge.points} pts)`);
  console.log(`  ${challenge.brief}`);
}

function cmdList(challenges) {
  challenges.forEach((c) => printChallenge(c));
}

function cmdHint(challenges, args) {
  const id = args.challenge;
  if (!id) throw new Error("Missing --challenge <id>");
  const c = byId(challenges, id);
  console.log(`${c.id}: ${c.title}`);
  console.log(c.hint);
}

function cmdGuide(challenges, args) {
  const id = args.challenge;
  const user = getUser(args);
  if (!id) throw new Error("Missing --challenge <id>");
  const c = byId(challenges, id);
  console.log(`${c.id}: ${c.title}`);
  c.guide.forEach((step, index) => {
    console.log(`${index + 1}. ${applyUser(step, user)}`);
  });
}

function loadSubmission(user) {
  const file = path.join(SUBMISSION_DIR, `${user}.json`);
  if (!fs.existsSync(file)) {
    return { user, completed: [], points: 0, updatedAt: null };
  }
  return readJSON(file);
}

function scoreSubmission(submission, challenges) {
  const challengeById = new Map(challenges.map((c) => [c.id, c]));
  const unique = Array.from(new Set(submission.completed));
  const points = unique.reduce((sum, id) => sum + (challengeById.get(id)?.points || 0), 0);
  return { ...submission, completed: unique, points };
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

function loadAllSubmissions(challenges) {
  if (!fs.existsSync(SUBMISSION_DIR)) return [];
  return fs
    .readdirSync(SUBMISSION_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => scoreSubmission(readJSON(path.join(SUBMISSION_DIR, f)), challenges));
}

function cmdCheck(challenges, args) {
  const user = getUser(args);
  const id = args.challenge;
  if (id) {
    const c = byId(challenges, id);
    const result = checkChallenge(c, user);
    console.log(`${c.id}: ${result.passed ? "PASS" : "FAIL"}`);
    result.results.forEach((r) => console.log(`- ${r.pass ? "PASS" : "FAIL"} ${r.message}`));
    process.exitCode = result.passed ? 0 : 1;
    return;
  }

  let passedCount = 0;
  challenges.forEach((c) => {
    const result = checkChallenge(c, user);
    if (result.passed) passedCount += 1;
    console.log(`${c.id}: ${result.passed ? "PASS" : "FAIL"}`);
  });
  console.log(`Passed ${passedCount}/${challenges.length} challenges.`);
  process.exitCode = passedCount === challenges.length ? 0 : 1;
}

async function cmdSubmit(challenges, args) {
  const user = getUser(args);
  let submission = loadSubmission(user);

  const targetId = args.challenge;
  const targets = targetId ? [byId(challenges, targetId)] : challenges;

  const newlyPassed = [];
  for (const c of targets) {
    const result = checkChallenge(c, user);
    if (result.passed && !submission.completed.includes(c.id)) {
      submission.completed.push(c.id);
      newlyPassed.push(c);
      console.log(`Awarded ${c.points} pts: ${c.id}`);
    } else if (result.passed) {
      console.log(`Already completed: ${c.id}`);
    } else {
      console.log(`Not passed: ${c.id}`);
    }
  }

  submission.updatedAt = new Date().toISOString();
  submission = scoreSubmission(submission, challenges);
  writeJSON(path.join(SUBMISSION_DIR, `${user}.json`), submission);

  const all = loadAllSubmissions(challenges);
  updateLeaderboard(all);

  const session = loadSession();
  if (session && process.env.CTF_CENTRAL_URL && process.env.CTF_COURSE_KEY) {
    for (const challenge of newlyPassed) {
      try {
        const result = await reportSuccess(session, challenge.id, challenge.points, "ctf-submit");
        const state = result.duplicate ? "duplicate" : "reported";
        console.log(`Central sync ${state}: ${challenge.id}`);
      } catch (error) {
        console.log(`Central sync failed for ${challenge.id}: ${error.message}`);
      }
    }
  }

  console.log(`Total points for ${user}: ${submission.points}`);
  console.log(`Completed: ${submission.completed.length}/${challenges.length}`);
}

function cmdLeaderboard() {
  if (!fs.existsSync(LEADERBOARD_FILE)) {
    console.log("No leaderboard data yet. Run submit first.");
    return;
  }
  const board = readJSON(LEADERBOARD_FILE);
  console.log(`Leaderboard updated: ${board.updatedAt || "never"}`);
  (board.players || []).forEach((p, idx) => {
    console.log(`${idx + 1}. ${p.user} - ${p.points} pts (${p.completedCount} challenges)`);
  });
}

async function main() {
  const [cmd] = process.argv.slice(2);
  const args = parseArgs(process.argv.slice(3));
  const challenges = loadChallenges();

  switch (cmd) {
    case "list":
      cmdList(challenges);
      break;
    case "hint":
      cmdHint(challenges, args);
      break;
    case "guide":
      cmdGuide(challenges, args);
      break;
    case "check":
      cmdCheck(challenges, args);
      break;
    case "submit":
      await cmdSubmit(challenges, args);
      break;
    case "leaderboard":
      cmdLeaderboard();
      break;
    default:
      console.log("Usage:");
      console.log("  npm run list");
      console.log("  npm run hint -- --challenge <id>");
      console.log("  npm run guide -- --challenge <id> --user <name>");
      console.log("  npm run check -- --user <name> [--challenge <id>]");
      console.log("  npm run submit -- --user <name> [--challenge <id>]");
      console.log("  npm run leaderboard");
      process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
