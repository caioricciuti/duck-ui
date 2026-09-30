const fs = require("fs");
const path = require("path");

// Writes runtime environment variables into env.js (loaded by index.html as a
// classic script). Writing a separate file instead of injecting an inline
// <script> keeps the Content-Security-Policy free of 'unsafe-inline'.
const envVars = {
  DUCK_UI_EXTERNAL_CONNECTION_NAME: process.env.DUCK_UI_EXTERNAL_CONNECTION_NAME || "",
  DUCK_UI_EXTERNAL_HOST: process.env.DUCK_UI_EXTERNAL_HOST || "",
  DUCK_UI_EXTERNAL_PORT: process.env.DUCK_UI_EXTERNAL_PORT || null,
  DUCK_UI_EXTERNAL_USER: process.env.DUCK_UI_EXTERNAL_USER || "",
  DUCK_UI_EXTERNAL_PASS: process.env.DUCK_UI_EXTERNAL_PASS || "",
  DUCK_UI_EXTERNAL_API_KEY: process.env.DUCK_UI_EXTERNAL_API_KEY || "",
  DUCK_UI_EXTERNAL_DATABASE_NAME: process.env.DUCK_UI_EXTERNAL_DATABASE_NAME || "",
  DUCK_UI_ALLOW_UNSIGNED_EXTENSIONS: process.env.DUCK_UI_ALLOW_UNSIGNED_EXTENSIONS === "true" || false,
  DUCK_UI_DUCKDB_WASM_USE_CDN: process.env.DUCK_UI_DUCKDB_WASM_USE_CDN === "true" || false,
  DUCK_UI_DUCKDB_WASM_BASE_URL: process.env.DUCK_UI_DUCKDB_WASM_BASE_URL || "",
  DUCK_UI_PYODIDE_BASE_URL: process.env.DUCK_UI_PYODIDE_BASE_URL || "",
  // Live sessions. Passed through as given, and left out when unset:
  // JSON.stringify drops undefined, and the client reads an empty STUN list
  // as "no STUN", which differs from "not configured" (use Google's).
  DUCK_UI_STUN_URLS: process.env.DUCK_UI_STUN_URLS,
  DUCK_UI_TURN_URLS: process.env.DUCK_UI_TURN_URLS,
  DUCK_UI_TURN_USERNAME: process.env.DUCK_UI_TURN_USERNAME,
  DUCK_UI_TURN_CREDENTIAL: process.env.DUCK_UI_TURN_CREDENTIAL,
};

// The Docker image serves dist/ alone and keeps this script beside it, so
// the target folder can differ from the one this file lives in.
const outDir = process.env.DUCK_UI_ENV_DIR || __dirname;
const envJsPath = path.join(outDir, "env.js");
fs.writeFileSync(envJsPath, `window.env = ${JSON.stringify(envVars)};\n`);

// A custom WASM CDN origin must be allowed by the CSP's script-src, or the
// worker's importScripts is blocked and DuckDB (or Pyodide, for Python
// cells) never initializes. jsDelivr (the default CDN for both) is already in
// the baked-in policy; a same-origin self-hosted copy needs nothing.
const cdnBaseUrls = [
  ["WASM CDN", envVars.DUCK_UI_DUCKDB_WASM_BASE_URL],
  ["Pyodide", envVars.DUCK_UI_PYODIDE_BASE_URL],
];
for (const [label, baseUrl] of cdnBaseUrls) {
  if (!/^https?:\/\//i.test(baseUrl)) continue;
  try {
    const origin = new URL(baseUrl).origin;
    const servePath = path.join(__dirname, "serve.json");
    const serveConfig = JSON.parse(fs.readFileSync(servePath, "utf8"));
    for (const rule of serveConfig.headers ?? []) {
      for (const header of rule.headers ?? []) {
        if (header.key === "Content-Security-Policy" && !header.value.includes(origin)) {
          header.value = header.value.replace("script-src ", `script-src ${origin} `);
        }
      }
    }
    fs.writeFileSync(servePath, JSON.stringify(serveConfig, null, 2));
    console.log(`CSP widened for ${label} origin ${origin}`);
  } catch (error) {
    console.warn(`Could not widen CSP for the ${label} origin:`, error.message);
  }
}

console.log("Environment variables injected successfully");
