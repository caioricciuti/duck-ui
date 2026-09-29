import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The five launch-critical flows, run against the production build:
 * boot + query correctness, CSV import (incl. a dirty-file corpus),
 * .duckdb attach with non-main schemas, export, and Open-in-Duck-UI
 * deep links. If one of these breaks, launch day breaks.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (...parts: string[]) => path.join(here, "fixtures", ...parts);

const b64 = (sql: string) => Buffer.from(sql, "utf8").toString("base64");

/** First boot in a fresh context shows the New profile dialog: complete it. */
async function ensureProfile(page: Page) {
  const dialog = page.getByRole("dialog", { name: "New profile" });
  try {
    await dialog.waitFor({ state: "visible", timeout: 20_000 });
  } catch {
    return; // profile already exists (persisted context) or dialog not needed
  }
  await dialog.getByLabel("Name", { exact: true }).fill("e2e");
  await dialog.getByRole("button", { name: "Create profile" }).click();
  await dialog.waitFor({ state: "hidden" });
}

/** Boot the app, get through profile creation, wait for the workspace. */
async function bootApp(page: Page, url = "/") {
  await page.goto(url);
  await ensureProfile(page);
  await expect(page.getByRole("tablist", { name: "Open tabs" })).toBeVisible({
    timeout: 60_000,
  });
}

/** Import files through the real UI flow and wait for the sheet to finish. */
async function importFiles(page: Page, files: string[]) {
  await page.getByRole("button", { name: "Import data" }).first().click();
  const sheet = page.getByRole("dialog", { name: "Import data" });
  // Scoped to the importer sheet: other features keep their own hidden inputs.
  await sheet.locator('input[type="file"]').setInputFiles(files);
  await sheet.getByRole("button", { name: /Import \d+ files?/ }).click();
  await expect(page.getByText("Successfully imported").first()).toBeVisible({
    timeout: 60_000,
  });
  // The sheet closes itself once every file has landed. A file that failed
  // keeps it open, so this also asserts that nothing failed.
  await expect(page.getByRole("dialog")).toBeHidden({ timeout: 60_000 });
}

/**
 * Make sure a database node in the explorer tree is expanded and return the
 * tree locator. Database nodes start expanded, so a blind click would close it.
 */
async function expandTreeNode(page: Page, name: string) {
  const tree = page.getByRole("tree", { name: "Database schema" });
  const label = new RegExp(`^${name}\\b`);
  const node = tree.getByRole("button", { name: label }).first();
  await expect(node).toBeVisible({ timeout: 60_000 });
  const item = tree
    .getByRole("treeitem")
    .filter({ has: page.getByRole("button", { name: label }) })
    .first();
  if ((await item.getAttribute("aria-expanded")) !== "true") await node.click();
  await expect(item).toHaveAttribute("aria-expanded", "true");
  return tree;
}

test("boots and renders DECIMAL and DATE correctly (#13, #15)", async ({ page }) => {
  const sql = "SELECT 1.23 AS v, DATE '2025-01-01' AS d, 2.1 AS w";
  await page.goto(`/?query=${b64(sql)}&execute=true`);
  await ensureProfile(page);

  // The exact values from the issue reports, rendered in the real grid.
  await expect(page.getByText("1.23", { exact: true }).first()).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText("2025-01-01", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("2.1", { exact: true }).first()).toBeVisible();
});

test("imports a clean CSV through the UI", async ({ page }) => {
  await bootApp(page);
  await importFiles(page, [fixture("dirty-csv", "dirty_unicode.csv")]);

  // Table lands in the explorer tree under the in-memory database.
  const tree = await expandTreeNode(page, "memory");
  await expect(tree.getByText("dirty_unicode").first()).toBeVisible();
});

test("imports the whole dirty CSV corpus without errors", async ({ page }) => {
  const corpusDir = fixture("dirty-csv");
  const corpus = fs
    .readdirSync(corpusDir)
    .filter((name) => name.endsWith(".csv"))
    .map((name) => path.join(corpusDir, name));
  expect(corpus.length).toBeGreaterThanOrEqual(10);

  await bootApp(page);
  await importFiles(page, corpus);

  // Every file must land as a table: the import path IS the demo.
  const tree = await expandTreeNode(page, "memory");
  for (const file of corpus) {
    const tableName = path.basename(file, ".csv");
    await expect(tree.getByText(tableName).first()).toBeVisible();
  }
});

test("attaches a multi-schema .duckdb file and shows non-main schemas (#3)", async ({
  page,
}) => {
  await bootApp(page);
  await importFiles(page, [fixture("multi_schema.duckdb")]);

  // Both the default-schema table and the staging-schema table must appear.
  const tree = await expandTreeNode(page, "multi_schema");
  await expect(tree.getByText("products").first()).toBeVisible();
  await expect(tree.getByText(/staging\./).first()).toBeVisible();
});

test("exports query results to CSV", async ({ page }) => {
  const sql = "SELECT range AS id, 'name_' || range AS name FROM range(25)";
  await page.goto(`/?query=${b64(sql)}&execute=true`);
  await ensureProfile(page);
  await expect(page.getByText("name_0", { exact: true }).first()).toBeVisible({
    timeout: 60_000,
  });

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("menuitem", { name: "CSV", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.csv$/);
});

test("cell context menu items actually work", async ({ page }) => {
  const sql = "SELECT range AS id, 'name_' || range AS name FROM range(25)";
  await page.goto(`/?query=${b64(sql)}&execute=true`);
  await ensureProfile(page);
  const cell = page.getByText("name_3", { exact: true }).first();
  await expect(cell).toBeVisible({ timeout: 60_000 });

  // Select a cell, open the menu, pick Select Column: the selection must
  // grow to the whole column (regression: menu items used to unmount before
  // their click handlers could fire, so every item silently did nothing).
  await cell.click();
  await expect(page.getByText("1 cell selected")).toBeVisible();
  await cell.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Select Column" }).click();
  await expect(page.getByText("25 cells selected")).toBeVisible();
});

test("Open-in-Duck-UI deep link confirms, loads remote parquet, and runs", async ({
  page,
}) => {
  const parquet = fs.readFileSync(fixture("tiny.parquet"));

  // Serve the fixture as a CORS-enabled remote host, with Range support:
  // DuckDB's browser httpfs reads parquet files via range requests.
  await page.route("https://fixtures.test/**", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, HEAD, OPTIONS",
          "access-control-allow-headers": "*",
        },
      });
      return;
    }
    const baseHeaders = {
      "access-control-allow-origin": "*",
      "access-control-expose-headers": "*",
      "accept-ranges": "bytes",
      "content-type": "application/octet-stream",
    };
    const range = request.headers()["range"];
    if (range) {
      const match = /bytes=(\d+)-(\d*)/.exec(range);
      const start = match ? parseInt(match[1], 10) : 0;
      const end = match && match[2] ? parseInt(match[2], 10) : parquet.length - 1;
      await route.fulfill({
        status: 206,
        headers: {
          ...baseHeaders,
          "content-range": `bytes ${start}-${end}/${parquet.length}`,
        },
        body: parquet.subarray(start, end + 1),
      });
      return;
    }
    await route.fulfill({ status: 200, headers: baseHeaders, body: parquet });
  });

  await page.goto("/?load=https://fixtures.test/tiny.parquet");
  await ensureProfile(page);

  // The confirm interstitial lists the host: nothing loads before consent.
  await expect(page.getByText("Open shared data?")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("https://fixtures.test/tiny.parquet")).toBeVisible();

  await page.getByRole("button", { name: "Load & run" }).click();

  // Default query previews the data; rows from the parquet must render.
  await expect(page.getByText("row_1", { exact: true }).first()).toBeVisible();
});

test.describe("short viewport", () => {
  // Deliberately short so a right-click low in the grid would push the menu
  // past the bottom edge if it weren't clamped.
  test.use({ viewport: { width: 1280, height: 520 } });

  test("cell context menu stays fully inside the viewport", async ({ page }) => {
    const sql = "SELECT range AS id, 'name_' || range AS name FROM range(25)";
    await page.goto(`/?query=${b64(sql)}&execute=true`);
    await ensureProfile(page);

    const cell = page.getByText("name_3", { exact: true }).first();
    await expect(cell).toBeVisible({ timeout: 60_000 });
    await cell.click();
    await cell.click({ button: "right" });

    // Items rendered past the edge are unreachable: Playwright reports them
    // as "outside of the viewport" and a real user simply cannot click them.
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    const box = (await menu.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);

    await page.getByRole("menuitem", { name: "Select Column" }).click();
    await expect(page.getByText("25 cells selected")).toBeVisible();
  });
});
