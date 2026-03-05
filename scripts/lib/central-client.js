const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const SESSION_FILE = path.join(ROOT, ".ctf", "runtime", "session.json");

function envRequired(key) {
  const val = process.env[key];
  if (!val) {
    throw new Error(`Missing env ${key}`);
  }
  return val;
}

function getCentralBaseUrl() {
  const url = envRequired("CTF_CENTRAL_URL");
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function getCourseKey() {
  return envRequired("CTF_COURSE_KEY");
}

async function postJSON(pathname, payload) {
  const url = `${getCentralBaseUrl()}${pathname}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    throw new Error(`Central API ${pathname} failed (${response.status}): ${JSON.stringify(data)}`);
  }

  return data;
}

async function registerOrRejoin(name) {
  const codespaceName = process.env.CODESPACE_NAME || process.env.HOSTNAME || undefined;
  return postJSON("/register", {
    courseKey: getCourseKey(),
    name,
    codespaceName
  });
}

async function reportSuccess(session, challengeId, points, source) {
  return postJSON("/report-success", {
    courseKey: getCourseKey(),
    studentId: session.studentId,
    challengeId,
    points,
    source
  });
}

function saveSession(session) {
  fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true });
  fs.writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2) + "\n", "utf8");
}

function loadSession() {
  if (!fs.existsSync(SESSION_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(SESSION_FILE, "utf8"));
  } catch {
    return null;
  }
}

module.exports = {
  registerOrRejoin,
  reportSuccess,
  saveSession,
  loadSession,
  SESSION_FILE
};
