const fs = require("fs");
const path = require("path");
const { convexToJson, jsonToConvex } = require("convex/values");

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

function candidateBaseUrls() {
  const primary = getCentralBaseUrl();
  const urls = [primary];

  // Some environments have DNS issues with region-qualified convex hosts.
  const regionSiteMatch = primary.match(/^(https:\/\/[^./]+)\.[a-z0-9-]+(\.convex\.site)$/i);
  if (regionSiteMatch) {
    urls.push(`${regionSiteMatch[1]}${regionSiteMatch[2]}`);
  }

  const regionCloudMatch = primary.match(/^(https:\/\/[^./]+)\.[a-z0-9-]+(\.convex\.cloud)$/i);
  if (regionCloudMatch) {
    urls.push(`${regionCloudMatch[1]}${regionCloudMatch[2]}`);
  }

  if (/\.convex\.site$/i.test(primary)) {
    urls.push(primary.replace(/\.convex\.site$/i, ".convex.cloud"));
  }
  if (/\.convex\.cloud$/i.test(primary)) {
    urls.push(primary.replace(/\.convex\.cloud$/i, ".convex.site"));
  }

  return [...new Set(urls)];
}

function getCourseKey() {
  return envRequired("CTF_COURSE_KEY");
}

async function callConvexMutation(pathName, argsObject) {
  let lastError = null;

  for (const baseUrl of candidateBaseUrls()) {
    const url = `${baseUrl}/api/mutation`;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          path: pathName,
          format: "convex_encoded_json",
          args: [convexToJson(argsObject)]
        })
      });

      const text = await response.text();
      let data;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { raw: text };
      }

      if (!response.ok) {
        lastError = new Error(`Convex mutation ${pathName} failed (${response.status}): ${JSON.stringify(data)}`);
        continue;
      }

      if (data.status === "success") {
        return jsonToConvex(data.value);
      }

      if (data.status === "error") {
        throw new Error(data.errorMessage || `Convex mutation ${pathName} returned error.`);
      }

      throw new Error(`Convex mutation ${pathName} invalid response: ${JSON.stringify(data)}`);
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    `Convex mutation ${pathName} unreachable: ${lastError && lastError.message ? lastError.message : String(lastError)}`
  );
}

function candidatePathnames(pathname) {
  const p = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const paths = [p];
  if (!p.startsWith("/api/")) {
    paths.push(`/api${p}`);
  }
  return [...new Set(paths)];
}

async function postJSON(pathname, payload) {
  let lastNetworkError = null;
  const notFoundUrls = [];

  for (const baseUrl of candidateBaseUrls()) {
    for (const apiPath of candidatePathnames(pathname)) {
      const url = `${baseUrl}${apiPath}`;
      try {
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

        if (response.status === 404) {
          notFoundUrls.push(url);
          continue;
        }

        if (!response.ok) {
          throw new Error(`Central API ${apiPath} failed (${response.status}): ${JSON.stringify(data)}`);
        }

        return data;
      } catch (error) {
        // Stop on HTTP-level errors from the API, but retry on network-level failures.
        if (error && /Central API/.test(String(error.message || ""))) {
          throw error;
        }
        lastNetworkError = error;
      }
    }
  }

  if (notFoundUrls.length) {
    const tried = [...new Set(notFoundUrls)].slice(0, 6).join(", ");
    throw new Error(`Central API route not found (404). Tried: ${tried}`);
  }

  const details = lastNetworkError && lastNetworkError.cause
    ? `${lastNetworkError.message} (${lastNetworkError.cause.code || "no-code"})`
    : String(lastNetworkError && lastNetworkError.message ? lastNetworkError.message : lastNetworkError);
  throw new Error(`Central API ${pathname} network error: ${details}`);
}

async function registerOrRejoin(name) {
  const codespaceName = process.env.CODESPACE_NAME || process.env.HOSTNAME || undefined;
  const payload = {
    courseKey: getCourseKey(),
    name,
    codespaceName
  };

  try {
    return await postJSON("/register", payload);
  } catch (error) {
    const message = String(error && error.message ? error.message : error);
    if (/route not found \(404\)|failed \(404\)/i.test(message)) {
      return callConvexMutation("ctf:registerOrRejoin", payload);
    }
    throw error;
  }
}

async function reportSuccess(session, challengeId, points, source) {
  const payload = {
    courseKey: getCourseKey(),
    studentId: session.studentId,
    challengeId,
    points,
    source
  };

  try {
    return await postJSON("/report-success", payload);
  } catch (error) {
    const message = String(error && error.message ? error.message : error);
    if (/route not found \(404\)|failed \(404\)/i.test(message)) {
      return callConvexMutation("ctf:reportSuccess", payload);
    }
    throw error;
  }
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
