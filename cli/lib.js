/**
 * Local launcher for the built Duck-UI app.
 *
 * Serves `dist/` plus the files named on the command line from one
 * 127.0.0.1-only server, then opens the app with an "Open in Duck-UI" deep
 * link (`?load=<url>`, see src/lib/deepLink.ts) pointing at those files. The
 * app shows its usual confirmation before loading anything.
 *
 * Zero runtime dependencies: node:http, node:fs, node:path, child_process.
 */

import { createReadStream, existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";

export const DEFAULT_PORT = 5522;
export const HOST = "127.0.0.1";
/** URL prefix for command-line files. Never overlaps a dist/ asset. */
export const FILES_PREFIX = "/__duck-ui/files/";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".map": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".tsv": "text/tab-separated-values; charset=utf-8",
};

//
// Arguments
//

export const USAGE = `Usage: duck-ui [files...] [options]

Serves Duck-UI locally and opens it in your browser, loading any
CSV, TSV, Parquet, JSON/NDJSON or DuckDB files you pass.

Options:
  --port <n>     Port to listen on (default ${DEFAULT_PORT})
  --sql <query>  Query to open with the loaded files
  --no-open      Print the URL instead of opening a browser
  -h, --help     Show this help
`;

export function parseArgs(argv) {
  const options = { files: [], port: DEFAULT_PORT, portExplicit: false, open: true, sql: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const [flag, inline] = arg.startsWith("--") ? arg.split(/=(.*)/s, 2) : [arg, undefined];
    const value = () => {
      const next = inline ?? argv[++i];
      if (next === undefined) throw new Error(`${flag} needs a value`);
      return next;
    };
    switch (flag) {
      case "-h":
      case "--help":
        options.help = true;
        break;
      case "--no-open":
        options.open = false;
        break;
      case "--port": {
        const port = Number(value());
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
          throw new Error("--port must be an integer between 1 and 65535");
        }
        options.port = port;
        options.portExplicit = true;
        break;
      }
      case "--sql":
        options.sql = value();
        break;
      case "--":
        options.files.push(...argv.slice(i + 1));
        i = argv.length;
        break;
      default:
        if (arg.startsWith("-") && arg !== "-") throw new Error(`Unknown option: ${arg}`);
        options.files.push(arg);
    }
  }
  return options;
}

//
// Files
//

/** Mirrors `inferFormat` in src/lib/deepLink.ts for local paths. */
export function inferFormat(filePath) {
  const name = filePath.toLowerCase();
  if (/\.(csv|tsv|csv\.gz|tsv\.gz)$/.test(name)) return "csv";
  if (/\.(json|jsonl|ndjson|json\.gz)$/.test(name)) return "json";
  if (/\.parquet$/.test(name)) return "parquet";
  if (/\.(duckdb|ddb|db)$/.test(name)) return "duckdb";
  return null;
}

/**
 * Resolves command-line files to an exact whitelist of URL routes.
 *
 * Each file is served under its own index, so two files with the same name in
 * different folders cannot collide, and the route keeps the file name so the
 * app infers the format and table name from it.
 *
 * @returns {Map<string, string>} route -> absolute real path
 */
export function registerFiles(files, cwd = process.cwd()) {
  const routes = new Map();
  files.forEach((file, index) => {
    const absolute = path.resolve(cwd, file);
    if (!existsSync(absolute)) throw new Error(`File not found: ${file}`);
    const real = realpathSync(absolute);
    if (!statSync(real).isFile()) throw new Error(`Not a file: ${file}`);
    if (!inferFormat(real)) {
      throw new Error(
        `Unsupported file type: ${file} (expected CSV, TSV, Parquet, JSON/NDJSON or DuckDB)`
      );
    }
    routes.set(`${FILES_PREFIX}${index}/${encodeURIComponent(path.basename(real))}`, real);
  });
  return routes;
}

//
// URLs
//

/**
 * The app URL that loads the given routes — the same `?load=` format the
 * README's "Open in Duck-UI" links use.
 */
export function buildLaunchUrl(origin, routes, sql) {
  const url = new URL("/", origin);
  for (const route of routes) url.searchParams.append("load", new URL(route, origin).toString());
  if (sql && sql.trim()) url.searchParams.set("sql", sql.trim());
  return url.toString();
}

/**
 * Maps a request path to a file on disk, or null.
 *
 * Command-line files match only by exact route. Everything else must resolve
 * inside dist/ — `..`, encoded slashes, NUL bytes and symlinks pointing out
 * are all refused. Extensionless paths fall back to index.html (SPA routing).
 */
export function resolveRequest(distDir, routes, rawPath) {
  const pathname = rawPath.split(/[?#]/)[0];
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  // Clients may re-encode a file name differently; compare decoded forms.
  for (const [route, file] of routes) {
    if (route === pathname || safeDecode(route) === decoded) return { file, kind: "data" };
  }
  if (decoded.startsWith(FILES_PREFIX)) return null;

  if (decoded.includes("\0") || decoded.includes("\\") || !decoded.startsWith("/")) return null;
  if (decoded.split("/").some((segment) => segment === "..")) return null;

  const root = realpathSync(distDir);
  const candidate = path.resolve(root, `.${decoded}`);
  if (!isInside(root, candidate)) return null;

  if (existsSync(candidate)) {
    const real = realpathSync(candidate);
    if (!isInside(root, real)) return null;
    const stat = statSync(real);
    if (stat.isFile()) return { file: real, kind: "app" };
    if (stat.isDirectory()) {
      const index = path.join(real, "index.html");
      if (existsSync(index)) return { file: index, kind: "app" };
    }
  }

  if (!path.extname(decoded)) return { file: path.join(root, "index.html"), kind: "app" };
  return null;
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

//
// Server
//

/** Security headers from the repository's serve.json, when it ships alongside. */
export function loadAppHeaders(serveJsonPath) {
  const headers = {
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "credentialless",
    "X-Content-Type-Options": "nosniff",
  };
  try {
    const config = JSON.parse(readFileSync(serveJsonPath, "utf8"));
    for (const rule of config.headers ?? []) {
      for (const { key, value } of rule.headers ?? []) headers[key] = value;
    }
  } catch {
    // Defaults above are enough for DuckDB-WASM; the CSP is defence in depth.
  }
  return headers;
}

/** Parses a single-range `Range` header. Returns null when absent or multi-range. */
export function parseRange(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === "" && match[2] === "")) return { invalid: true };
  let start;
  let end;
  if (match[1] === "") {
    const suffix = Number(match[2]);
    if (suffix === 0) return { invalid: true };
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  if (start > end || start >= size) return { invalid: true };
  return { start, end };
}

/** Only requests addressed to this machine by name — blocks DNS rebinding. */
function isLocalHost(hostHeader, port) {
  return hostHeader === `${HOST}:${port}` || hostHeader === `localhost:${port}`;
}

export function createAppServer({ distDir, routes, headers = {} }) {
  const server = createServer((req, res) => {
    const port = server.address()?.port;
    const send = (status, message) => {
      res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", ...headers });
      res.end(req.method === "HEAD" ? undefined : message);
    };

    if (!isLocalHost(req.headers.host, port)) return send(403, "Forbidden");
    if (req.method !== "GET" && req.method !== "HEAD") return send(405, "Method Not Allowed");

    let target;
    try {
      target = resolveRequest(distDir, routes, req.url ?? "/");
    } catch {
      target = null;
    }
    if (!target) return send(404, "Not Found");

    const { size } = statSync(target.file);
    const ext = path.extname(target.file).toLowerCase();
    const common = {
      ...headers,
      "Content-Type": MIME_TYPES[ext] ?? "application/octet-stream",
      "Accept-Ranges": "bytes",
      "Cache-Control":
        target.kind === "data" || ext === ".html" ? "no-cache" : "public, max-age=3600",
    };

    const range = parseRange(req.headers.range, size);
    if (range?.invalid) {
      res.writeHead(416, { ...common, "Content-Range": `bytes */${size}` });
      return res.end();
    }
    if (range) {
      res.writeHead(206, {
        ...common,
        "Content-Length": range.end - range.start + 1,
        "Content-Range": `bytes ${range.start}-${range.end}/${size}`,
      });
    } else {
      res.writeHead(200, { ...common, "Content-Length": size });
    }
    if (req.method === "HEAD" || size === 0) return res.end();
    createReadStream(target.file, range ? { start: range.start, end: range.end } : {})
      .on("error", () => res.destroy())
      .pipe(res);
  });
  return server;
}

/** Listens on 127.0.0.1, walking up from `port` when it is taken (unless pinned). */
export function listen(server, port, { tries = 10 } = {}) {
  return new Promise((resolve, reject) => {
    let attempt = 0;
    const tryPort = (candidate) => {
      const onError = (error) => {
        server.off("listening", onListening);
        if (error.code === "EADDRINUSE" && ++attempt < tries) return tryPort(candidate + 1);
        reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        resolve(server.address().port);
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(candidate, HOST);
    };
    tryPort(port);
  });
}

//
// Browser
//

export function browserCommand(url, platform = process.platform) {
  if (platform === "darwin") return ["open", [url]];
  // rundll32 takes the URL as one argument, so `&` in it needs no shell quoting.
  if (platform === "win32") return ["rundll32", ["url.dll,FileProtocolHandler", url]];
  return ["xdg-open", [url]];
}

export function openBrowser(url) {
  const [command, args] = browserCommand(url);
  return new Promise((resolve) => {
    try {
      const child = spawn(command, args, { stdio: "ignore", detached: true });
      child.once("error", () => resolve(false));
      child.once("spawn", () => {
        child.unref();
        resolve(true);
      });
    } catch {
      resolve(false);
    }
  });
}
