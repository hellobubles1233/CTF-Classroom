const fs = require("fs");
const path = require("path");

function loadEnv() {
  const envPath = path.resolve(__dirname, "..", "..", ".env");
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const idx = trimmed.indexOf("=");
      if (idx < 1) continue;

      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim();
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  }

  if (!process.env.CTF_COURSE_KEY) {
    process.env.CTF_COURSE_KEY = "0com";
  }

  if (!process.env.CTF_CENTRAL_URL) {
    process.env.CTF_CENTRAL_URL = "https://outstanding-elk-594.eu-west-1.convex.site";
  }
}

module.exports = { loadEnv };
