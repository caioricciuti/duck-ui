import { test, expect, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Remote files are read in ranges (#75), and a server that ignores Range
 * still works. Two local servers stand in for the remote: one honours Range,
 * one always sends the whole file, like Python's http.server.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
// Big enough that a range is a real part of the file: 5000 rows in five
// row groups, about 170 kB.
const PARQUET = readFileSync(path.join(here, "fixtures", "ranges.parquet"));
const mod = process.platform === "darwin" ? "Meta" : "Control";

interface Seen {
  method: string;
  range: string | undefined;
  status: number;
}

function serve(port: number, honourRange: boolean, seen: Seen[]): Promise<Server> {
  const server = createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.setHeader("Access-Control-Expose-Headers", "*");
    res.setHeader("Cache-Control", "no-store");
    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }
    const range = req.headers.range;
    const match = honourRange ? /^bytes=(\d+)-(\d*)$/.exec(range ?? "") : null;
    let status = 200;
    let body = PARQUET;
    if (match) {
      const start = Number(match[1]);
      const end = match[2] ? Math.min(Number(match[2]), PARQUET.length - 1) : PARQUET.length - 1;
      body = PARQUET.subarray(start, end + 1);
      status = 206;
      res.setHeader("Content-Range", `bytes ${start}-${end}/${PARQUET.length}`);
    }
    if (honourRange) res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Length", String(body.length));
    seen.push({ method: req.method ?? "", range, status });
    res.writeHead(status);
    res.end(req.method === "HEAD" ? undefined : body);
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

const ranged: Seen[] = [];
const whole: Seen[] = [];
const servers: Server[] = [];

test.beforeAll(async () => {
  servers.push(await serve(18181, true, ranged), await serve(18182, false, whole));
});

test.afterAll(() => {
  for (const server of servers) server.close();
});

async function boot(page: Page, url = "/") {
  await page.goto(url);
  const dialog = page.getByRole("dialog", { name: "New profile" });
  try {
    await dialog.waitFor({ state: "visible", timeout: 20_000 });
    await dialog.getByLabel("Name", { exact: true }).fill("e2e");
    await dialog.getByRole("button", { name: "Create profile" }).click();
    await dialog.waitFor({ state: "hidden" });
  } catch {
    // The profile already exists.
  }
}

async function countRows(page: Page, port: number) {
  await expect(page.getByRole("tablist", { name: "Open tabs" })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "New query" }).click();
  const panel = page.locator('[role="tabpanel"]:not([hidden])');
  await panel.locator(".cm-content").click();
  await page.keyboard.insertText(
    `SELECT 'n:' || count(*) AS n FROM 'http://127.0.0.1:${port}/ranges.parquet'`
  );
  await page.keyboard.press(`${mod}+Enter`);
  await expect(panel.getByText("n:5000", { exact: true })).toBeVisible({ timeout: 60_000 });
}

test.beforeEach(() => {
  ranged.length = 0;
  whole.length = 0;
});

test("a remote file is read in ranges", async ({ page }) => {
  await boot(page);
  await countRows(page, 18181);

  const gets = ranged.filter((r) => r.method === "GET");
  expect(gets.length).toBeGreaterThan(0);
  expect(gets.every((r) => r.range && r.status === 206)).toBe(true);
});

test("a server that ignores Range still answers, with one full download", async ({ page }) => {
  await boot(page);
  await countRows(page, 18182);

  const gets = whole.filter((r) => r.method === "GET");
  // The ranged attempt that fails, then the download that works.
  expect(gets.some((r) => r.range)).toBe(true);
  expect(gets.at(-1)).toMatchObject({ range: undefined, status: 200 });
});

test("turned off in settings, remote files are downloaded whole", async ({ page }) => {
  await boot(page, "/?page=settings&section=performance");
  const toggle = page.getByLabel("Enabled");
  await expect(toggle).toBeChecked({ timeout: 60_000 });
  await toggle.uncheck();

  await page.goto("/");
  await countRows(page, 18181);
  const gets = ranged.filter((r) => r.method === "GET");
  expect(gets.length).toBeGreaterThan(0);
  expect(gets.some((r) => r.status === 206)).toBe(false);
});
