import { test, expect, type Page } from "@playwright/test";

/**
 * A table opened as a tab: rows, schema, statistics and the statement that
 * created it, without writing a query.
 */

const mod = process.platform === "darwin" ? "Meta" : "Control";

async function bootApp(page: Page) {
  await page.goto("/");
  const dialog = page.getByRole("dialog", { name: "New profile" });
  try {
    await dialog.waitFor({ state: "visible", timeout: 20_000 });
    await dialog.getByLabel("Name", { exact: true }).fill("e2e");
    await dialog.getByRole("button", { name: "Create profile" }).click();
    await dialog.waitFor({ state: "hidden" });
  } catch {
    // The profile already exists.
  }
  await expect(page.getByRole("tablist", { name: "Open tabs" })).toBeVisible({ timeout: 60_000 });
}

async function createTable(page: Page, sql: string) {
  await page.getByRole("button", { name: "New query" }).click();
  await page.locator('[role="tabpanel"]:not([hidden]) .cm-content').click();
  await page.keyboard.insertText(sql);
  await page.keyboard.press(`${mod}+Enter`);
}

test("a table opens as a tab with data, schema, stats and DDL", async ({ page }) => {
  await bootApp(page);
  await createTable(
    page,
    "create table e2e_orders as select range as id, 'name_' || range as name from range(25)"
  );

  const tree = page.getByRole("tree", { name: "Database schema" });
  const node = tree.getByRole("button", { name: /^e2e_orders\b/ });
  await expect(node).toBeVisible({ timeout: 60_000 });
  await node.dblclick();

  const openTabs = page.getByRole("tablist", { name: "Open tabs" });
  await expect(openTabs.getByRole("tab", { name: "e2e_orders" })).toHaveAttribute(
    "aria-selected",
    "true"
  );

  const panel = page.locator('[role="tabpanel"]:not([hidden])');
  await expect(panel.getByRole("heading", { name: /e2e_orders/ })).toBeVisible();
  await expect(panel.getByText("25 rows · 2 columns", { exact: true })).toBeVisible();

  // Data: the rows, without a query having been written.
  const grid = panel.getByRole("grid", { name: "Query result" });
  await expect(grid.getByText("name_7", { exact: true })).toBeVisible();

  // Schema: one row per column.
  await panel.getByRole("tab", { name: "Schema" }).click();
  await expect(grid.getByText("BIGINT", { exact: true })).toBeVisible();
  await expect(grid.getByText("VARCHAR", { exact: true })).toBeVisible();

  // Stats: a card per column, with the distribution once it has loaded.
  await panel.getByRole("tab", { name: "Stats" }).click();
  const idCard = panel.getByRole("region", { name: "id statistics" });
  await expect(idCard.getByText("Filled")).toBeVisible();
  await expect(idCard.getByText("Distribution")).toBeVisible();
  await expect(idCard).toContainText(/Total\s*25/);
  await expect(panel.getByRole("region", { name: "name statistics" }).getByText("Top values")).toBeVisible();

  // DDL: the statement DuckDB keeps for the table.
  await panel.getByRole("tab", { name: "DDL" }).click();
  await expect(panel.locator(".cm-content")).toContainText(/CREATE TABLE e2e_orders/i);

  // Opening the same table again focuses the tab it already has.
  await openTabs.getByRole("tab", { name: "Home" }).click();
  await node.dblclick();
  await expect(openTabs.getByRole("tab", { name: "e2e_orders" })).toHaveCount(1);
  await expect(openTabs.getByRole("tab", { name: "e2e_orders" })).toHaveAttribute(
    "aria-selected",
    "true"
  );
});

test("a table tab survives a reload and says when its table is gone", async ({ page }) => {
  await bootApp(page);
  await createTable(page, "create table e2e_gone as select 1 as id");

  const tree = page.getByRole("tree", { name: "Database schema" });
  const node = tree.getByRole("button", { name: /^e2e_gone\b/ });
  await expect(node).toBeVisible({ timeout: 60_000 });
  await node.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Open table" }).click();

  const panel = page.locator('[role="tabpanel"]:not([hidden])');
  await expect(panel.getByRole("grid", { name: "Query result" })).toBeVisible();

  // The in-memory database starts empty again after a reload, the tab does not.
  await page.waitForTimeout(3000);
  await page.reload();
  const openTabs = page.getByRole("tablist", { name: "Open tabs" });
  await expect(openTabs.getByRole("tab", { name: "e2e_gone" })).toBeVisible({ timeout: 60_000 });
  await expect(panel.getByText("Table not found")).toBeVisible();
});
