#!/usr/bin/env node
const { loadEnv } = require("./lib/env");
loadEnv();
const http = require("http");
const fs = require("fs");
const path = require("path");
const {
  registerOrRejoin,
  reportSuccess,
  saveSession,
  loadSession
} = require("./lib/central-client");

const ROOT = path.resolve(__dirname, "..");
const WEB_ROOT = path.join(ROOT, "web", "student");
const PORT = Number(process.env.CTF_STUDENT_PORT || 3210);
const HOST = process.env.CTF_STUDENT_HOST || "127.0.0.1";

const pendingFile = path.join(ROOT, ".ctf", "runtime", "pending-successes.jsonl");

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

const server = http.createServer(async (req, res) => {
  if (!req.url) return text(res, 400, "Bad request");

  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    return serveFile(res, path.join(WEB_ROOT, "index.html"), "text/html; charset=utf-8");
  }

  if (req.method === "GET" && req.url === "/app.js") {
    return serveFile(res, path.join(WEB_ROOT, "app.js"), "application/javascript; charset=utf-8");
  }

  if (req.method === "GET" && req.url === "/styles.css") {
    return serveFile(res, path.join(WEB_ROOT, "styles.css"), "text/css; charset=utf-8");
  }

  if (req.method === "GET" && req.url === "/api/status") {
    const session = loadSession();
    return json(res, 200, {
      session,
      codespaceName: process.env.CODESPACE_NAME || null,
      centralConfigured: Boolean(process.env.CTF_CENTRAL_URL && process.env.CTF_COURSE_KEY)
    });
  }

  if (req.method === "POST" && req.url === "/api/signup") {
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
      saveSession(session);
      await flushPending();
      return json(res, 200, { ok: true, session });
    } catch (error) {
      const errorMessage = error && error.message ? error.message : "fetch failed";
      const session = {
        studentId: null,
        name,
        registeredAt: new Date().toISOString(),
        offline: true,
        lastCentralError: errorMessage
      };
      saveSession(session);
      return json(res, 202, {
        ok: false,
        offline: true,
        session,
        message: "Central registration unavailable. Joined locally; retry Join/Rejoin later to sync.",
        error: errorMessage
      });
    }
  }

  if (req.method === "POST" && req.url === "/api/report-success") {
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
