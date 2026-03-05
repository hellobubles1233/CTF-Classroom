#!/usr/bin/env node
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const WEB_ROOT = __dirname;
const LEADERBOARD_FILE = path.join(ROOT, "data", "leaderboard.json");
const PORT = Number(process.env.PORT || 3030);
const HOST = process.env.HOST || "127.0.0.1";

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function text(res, status, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, { "Content-Type": contentType });
  res.end(body);
}

function serveFile(res, filePath, contentType) {
  if (!fs.existsSync(filePath)) {
    text(res, 404, "Not found");
    return;
  }
  text(res, 200, fs.readFileSync(filePath), contentType);
}

const server = http.createServer((req, res) => {
  if (!req.url) return text(res, 400, "Bad request");

  if (req.url === "/api/leaderboard") {
    const data = fs.existsSync(LEADERBOARD_FILE)
      ? JSON.parse(fs.readFileSync(LEADERBOARD_FILE, "utf8"))
      : { updatedAt: null, players: [] };
    return json(res, 200, data);
  }

  if (req.url === "/" || req.url === "/index.html") {
    return serveFile(res, path.join(WEB_ROOT, "index.html"), "text/html; charset=utf-8");
  }

  if (req.url === "/styles.css") {
    return serveFile(res, path.join(WEB_ROOT, "styles.css"), "text/css; charset=utf-8");
  }

  text(res, 404, "Not found");
});

server.on("error", (err) => {
  console.error(`Failed to start server on ${HOST}:${PORT}: ${err.message}`);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`Leaderboard UI: http://${HOST}:${PORT}`);
});
