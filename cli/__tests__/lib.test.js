import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import os from "node:os";
import path from "node:path";
import { parseDeepLink } from "../../src/lib/deepLink";
import {
  FILES_PREFIX,
  browserCommand,
  buildLaunchUrl,
  createAppServer,
  listen,
  parseArgs,
  parseRange,
  registerFiles,
  resolveRequest,
} from "../lib.js";

let tmp;
let dist;
let data;

beforeAll(() => {
  tmp = realpathSync(mkdtempSync(path.join(os.tmpdir(), "duck-ui-cli-")));
  dist = path.join(tmp, "dist");
  data = path.join(tmp, "data");
  mkdirSync(path.join(dist, "assets"), { recursive: true });
  mkdirSync(data);
  writeFileSync(path.join(dist, "index.html"), "<!doctype html>app");
  writeFileSync(path.join(dist, "assets", "app.js"), "console.log(1)");
  writeFileSync(path.join(tmp, "secret.txt"), "do not serve");
  writeFileSync(path.join(data, "sales.csv"), "a,b\n1,2\n");
  writeFileSync(path.join(data, "My Data.parquet"), "PAR1....PAR1");
  writeFileSync(path.join(data, "notes.txt"), "nope");
  symlinkSync(path.join(tmp, "secret.txt"), path.join(dist, "escape.txt"));
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("parseArgs", () => {
  it("reads files and flags", () => {
    expect(parseArgs(["a.csv", "--port", "6000", "--no-open", "b.parquet"])).toMatchObject({
      files: ["a.csv", "b.parquet"],
      port: 6000,
      portExplicit: true,
      open: false,
    });
    expect(parseArgs(["--port=7000", "--sql=SELECT 1"])).toMatchObject({
      port: 7000,
      sql: "SELECT 1",
    });
    expect(parseArgs([]).port).toBe(5522);
  });

  it("rejects bad input", () => {
    expect(() => parseArgs(["--port", "abc"])).toThrow(/--port/);
    expect(() => parseArgs(["--port"])).toThrow(/needs a value/);
    expect(() => parseArgs(["--bogus"])).toThrow(/Unknown option/);
  });
});

describe("registerFiles", () => {
  it("whitelists exact routes that keep the file name", () => {
    const routes = registerFiles(["sales.csv", "My Data.parquet"], data);
    expect([...routes.keys()]).toEqual([
      `${FILES_PREFIX}0/sales.csv`,
      `${FILES_PREFIX}1/My%20Data.parquet`,
    ]);
    expect([...routes.values()]).toEqual([
      path.join(data, "sales.csv"),
      path.join(data, "My Data.parquet"),
    ]);
  });

  it("refuses missing, unsupported and non-file paths", () => {
    expect(() => registerFiles(["missing.csv"], data)).toThrow(/not found/);
    expect(() => registerFiles(["notes.txt"], data)).toThrow(/Unsupported/);
    expect(() => registerFiles(["."], data)).toThrow(/Not a file/);
  });
});

describe("resolveRequest", () => {
  const routes = () => registerFiles(["sales.csv", "My Data.parquet"], data);

  it("serves registered files by exact route only", () => {
    expect(resolveRequest(dist, routes(), `${FILES_PREFIX}0/sales.csv`)).toEqual({
      file: path.join(data, "sales.csv"),
      kind: "data",
    });
    expect(resolveRequest(dist, routes(), `${FILES_PREFIX}1/My Data.parquet?x=1`)?.file).toBe(
      path.join(data, "My Data.parquet")
    );
    expect(resolveRequest(dist, routes(), `${FILES_PREFIX}0/notes.txt`)).toBeNull();
    expect(resolveRequest(dist, routes(), `${FILES_PREFIX}0/../../secret.txt`)).toBeNull();
    expect(resolveRequest(dist, routes(), `${FILES_PREFIX}9/sales.csv`)).toBeNull();
  });

  it("serves dist assets and falls back to index.html for app routes", () => {
    expect(resolveRequest(dist, routes(), "/assets/app.js")?.file).toBe(
      path.join(dist, "assets", "app.js")
    );
    expect(resolveRequest(dist, routes(), "/")?.file).toBe(path.join(dist, "index.html"));
    expect(resolveRequest(dist, routes(), "/some/route")?.file).toBe(path.join(dist, "index.html"));
    expect(resolveRequest(dist, routes(), "/assets/missing.js")).toBeNull();
  });

  it.each([
    "/../secret.txt",
    "/assets/../../secret.txt",
    "/%2e%2e/secret.txt",
    "/assets%2f..%2f..%2fsecret.txt",
    "/..%5csecret.txt",
    "/index.html%00.js",
    "/%E0%A4%A",
    "/escape.txt",
    "//etc/passwd",
  ])("refuses %s", (requestPath) => {
    const resolved = resolveRequest(dist, routes(), requestPath);
    expect(resolved === null || resolved.file === path.join(dist, "index.html")).toBe(true);
  });
});

it("refuses absolute paths outside dist", () => {
  const routes = registerFiles(["sales.csv"], data);
  expect(resolveRequest(dist, routes, `/${path.join(tmp, "secret.txt")}`)).toBeNull();
});

describe("buildLaunchUrl", () => {
  it("builds a deep link the app accepts", () => {
    const routes = registerFiles(["sales.csv", "My Data.parquet"], data);
    const url = new URL(
      buildLaunchUrl("http://127.0.0.1:5522", routes.keys(), " SELECT * FROM sales ")
    );
    expect(url.origin).toBe("http://127.0.0.1:5522");
    expect(url.pathname).toBe("/");
    expect(url.searchParams.getAll("load")).toEqual([
      `http://127.0.0.1:5522${FILES_PREFIX}0/sales.csv`,
      `http://127.0.0.1:5522${FILES_PREFIX}1/My%20Data.parquet`,
    ]);

    const request = parseDeepLink(url.searchParams);
    expect(request?.sql).toBe("SELECT * FROM sales");
    expect(request?.sources.map(({ format, name }) => ({ format, name }))).toEqual([
      { format: "csv", name: "sales" },
      { format: "parquet", name: "my_20data" },
    ]);
  });

  it("omits sql when none is given", () => {
    const url = new URL(buildLaunchUrl("http://127.0.0.1:1", [`${FILES_PREFIX}0/a.csv`]));
    expect(url.searchParams.has("sql")).toBe(false);
  });
});

describe("parseRange", () => {
  it("handles the forms DuckDB sends", () => {
    expect(parseRange(undefined, 10)).toBeNull();
    expect(parseRange("bytes=0-3", 10)).toEqual({ start: 0, end: 3 });
    expect(parseRange("bytes=4-", 10)).toEqual({ start: 4, end: 9 });
    expect(parseRange("bytes=-4", 10)).toEqual({ start: 6, end: 9 });
    expect(parseRange("bytes=5-100", 10)).toEqual({ start: 5, end: 9 });
    expect(parseRange("bytes=20-30", 10)).toEqual({ invalid: true });
    expect(parseRange("bytes=0-1,4-5", 10)).toEqual({ invalid: true });
  });
});

describe("browserCommand", () => {
  it("picks a launcher per platform", () => {
    expect(browserCommand("http://x/?a=1&b=2", "darwin")).toEqual(["open", ["http://x/?a=1&b=2"]]);
    expect(browserCommand("http://x/", "linux")[0]).toBe("xdg-open");
    expect(browserCommand("http://x/?a=1&b=2", "win32")).toEqual([
      "rundll32",
      ["url.dll,FileProtocolHandler", "http://x/?a=1&b=2"],
    ]);
  });
});

describe("server", () => {
  let server;
  let port;

  beforeAll(async () => {
    server = createAppServer({
      distDir: dist,
      routes: registerFiles(["sales.csv"], data),
      headers: { "Cross-Origin-Opener-Policy": "same-origin" },
    });
    port = await listen(server, 0);
  });

  afterAll(() => new Promise((resolve) => server.close(resolve)));

  const get = (requestPath, headers = {}) =>
    new Promise((resolve, reject) => {
      const req = request(
        {
          host: "127.0.0.1",
          port,
          path: requestPath,
          headers: { host: `127.0.0.1:${port}`, ...headers },
        },
        (res) => {
          let body = "";
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
        }
      );
      req.on("error", reject);
      req.end();
    });

  it("binds to loopback only", () => {
    expect(server.address().address).toBe("127.0.0.1");
  });

  it("serves the app with its headers", async () => {
    const response = await get("/");
    expect(response.status).toBe(200);
    expect(response.body).toBe("<!doctype html>app");
    expect(response.headers["cross-origin-opener-policy"]).toBe("same-origin");
  });

  it("serves whitelisted files with range support", async () => {
    const full = await get(`${FILES_PREFIX}0/sales.csv`);
    expect(full.status).toBe(200);
    expect(full.body).toBe("a,b\n1,2\n");
    const partial = await get(`${FILES_PREFIX}0/sales.csv`, { range: "bytes=0-2" });
    expect(partial.status).toBe(206);
    expect(partial.body).toBe("a,b");
    expect(partial.headers["content-range"]).toBe("bytes 0-2/8");
  });

  it("refuses traversal and foreign hosts", async () => {
    expect((await get("/../secret.txt")).body).not.toContain("do not serve");
    expect((await get(`${FILES_PREFIX}0/..%2f..%2fsecret.txt`)).status).toBe(404);
    expect((await get("/", { host: "evil.example:80" })).status).toBe(403);
  });
});
