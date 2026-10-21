import { test, expect, type Page } from "@playwright/test";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";

/**
 * A remote DuckDB attached over Quack. Needs the `duckdb` CLI (1.5.2 or
 * later) on PATH to serve the remote side, so it is skipped where there is
 * none, CI included.
 */

const PORT = 19494;
const HOST = `localhost:${PORT}`;
const TOKEN = "e2e-quack-token";
const hasCli = spawnSync("duckdb", ["--version"]).status === 0;

let server: ChildProcess | undefined;

test.skip(!hasCli, "the duckdb CLI is not installed");

test.beforeAll(async () => {
  server = spawn("duckdb", [
    "-c",
    `INSTALL quack; LOAD quack;
     CREATE TABLE items AS SELECT range AS id, 'item ' || range AS label FROM range(3);
     CALL quack_serve('quack:${HOST}', token := '${TOKEN}');
     SELECT sleep_ms(600000);`,
  ]);
  // Ready once the endpoint answers the browser's preflight.
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const response = await fetch(`http://${HOST}/quack`, { method: "OPTIONS" });
      if (response.ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("The Quack server did not start");
});

test.afterAll(() => {
  server?.kill();
});

async function ensureProfile(page: Page) {
  const dialog = page.getByRole("dialog", { name: "New profile" });
  try {
    await dialog.waitFor({ state: "visible", timeout: 20_000 });
  } catch {
    return;
  }
  await dialog.getByLabel("Name", { exact: true }).fill("e2e");
  await dialog.getByRole("button", { name: "Create profile" }).click();
  await dialog.waitFor({ state: "hidden" });
}

const mod = process.platform === "darwin" ? "Meta" : "Control";

/** Runs `sql` in a new query tab and returns the tab's panel. */
async function runQuery(page: Page, sql: string) {
  await page.getByRole("button", { name: "New query" }).click();
  const panel = page.locator('[role="tabpanel"]:not([hidden])');
  await panel.locator(".cm-content").click();
  await page.keyboard.insertText(sql);
  await page.keyboard.press(`${mod}+Enter`);
  return panel;
}

test("attaches a remote DuckDB, keeps it across a reload, and detaches it", async ({ page }) => {
  await page.goto("/?page=connections");
  await ensureProfile(page);
  await expect(page.getByRole("button", { name: "Attach" })).toBeEnabled({ timeout: 60_000 });

  await page.getByRole("button", { name: "Attach" }).click();
  const sheet = page.getByRole("dialog", { name: "Attach remote DuckDB" });
  await sheet.getByLabel("Name").fill("remote_db");
  await sheet.getByLabel("Host").fill(HOST);
  await sheet.getByLabel("Token").fill(TOKEN);
  await sheet.getByRole("button", { name: "Attach" }).click();
  await expect(sheet).toBeHidden({ timeout: 60_000 });
  const row = page.getByRole("row", { name: /remote_db/ });
  await expect(row.getByText("Attached")).toBeVisible();

  // A reload attaches it again from the saved, encrypted token. The
  // explorer lists the remote tables, which only the server can enumerate.
  await page.goto("/");
  await ensureProfile(page);
  const tree = page.getByRole("tree", { name: "Database schema" });
  await expect(tree.getByRole("button", { name: /^remote_db\b/ }).first()).toBeVisible({
    timeout: 60_000,
  });
  await expect(tree.getByRole("button", { name: /^items\b/ }).first()).toBeVisible({
    timeout: 30_000,
  });

  // Remote and local data in one query.
  let panel = await runQuery(
    page,
    "SELECT 'rows:' || count(*) AS r FROM remote_db.items JOIN range(3) l ON l.range = items.id"
  );
  await expect(panel.getByText("rows:3", { exact: true })).toBeVisible({ timeout: 60_000 });

  // The token is not readable from SQL: not in the attach options, and the
  // secret holding it is redacted.
  panel = await runQuery(
    page,
    `SELECT 'leaks:' || (
       (SELECT count(*) FROM duckdb_databases() WHERE CAST(options AS VARCHAR) LIKE '%quack-tok%')
     + (SELECT count(*) FROM duckdb_secrets() WHERE secret_string LIKE '%quack-tok%')) AS r`
  );
  await expect(panel.getByText("leaks:0", { exact: true })).toBeVisible({ timeout: 60_000 });

  await page.goto("/?page=connections");
  await ensureProfile(page);
  const attached = page.getByRole("row", { name: /remote_db/ });
  await expect(attached.getByText("Attached")).toBeVisible({ timeout: 60_000 });
  await attached.getByRole("button", { name: "Detach remote_db" }).click();
  await page.getByRole("button", { name: "Detach", exact: true }).click();
  await expect(page.getByRole("row", { name: /remote_db/ })).toHaveCount(0);

  // Forgotten for good: not back after another reload.
  await page.reload();
  await ensureProfile(page);
  await expect(page.getByRole("button", { name: "Attach" })).toBeEnabled({ timeout: 60_000 });
  await expect(page.getByText("Nothing attached.")).toBeVisible();
});

test("a wrong token is reported in the sheet", async ({ page }) => {
  await page.goto("/?page=connections");
  await ensureProfile(page);
  await expect(page.getByRole("button", { name: "Attach" })).toBeEnabled({ timeout: 60_000 });

  await page.getByRole("button", { name: "Attach" }).click();
  const sheet = page.getByRole("dialog", { name: "Attach remote DuckDB" });
  await sheet.getByLabel("Name").fill("wrong");
  await sheet.getByLabel("Host").fill(HOST);
  await sheet.getByLabel("Token").fill("not-the-token");
  await sheet.getByRole("button", { name: "Attach" }).click();
  await expect(sheet.getByRole("alert")).toBeVisible({ timeout: 60_000 });
  await expect(sheet).toBeVisible();
});
