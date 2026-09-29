import { test, expect, type Page } from "@playwright/test";

/**
 * The editor features that make multi-statement tabs usable: running the
 * statement under the cursor, pointing at the error, and finding earlier
 * work again through the history page and the command menu.
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

/** Opens a new SQL tab holding `sql` and returns its panel. */
async function newQuery(page: Page, sql: string) {
  await page.getByRole("button", { name: "New query" }).click();
  const panel = page.locator('[role="tabpanel"]:not([hidden])');
  const editor = panel.locator(".cm-content");
  await editor.click();
  await page.keyboard.insertText(sql);
  return { panel, editor };
}

test("Mod-Enter runs only the statement under the cursor", async ({ page }) => {
  await bootApp(page);
  const { panel } = await newQuery(page, "select 'first' as which;\nselect 'second' as which");

  // The cursor is at the end, inside the second statement.
  await page.keyboard.press(`${mod}+Enter`);
  const grid = panel.getByRole("grid", { name: "Query result" });
  await expect(grid.getByText("second", { exact: true })).toBeVisible();
  await expect(grid.getByText("first", { exact: true })).toHaveCount(0);

  // Moving the cursor into the first statement runs that one instead.
  await page.keyboard.press(`${mod}+Home`);
  await page.keyboard.press(`${mod}+Enter`);
  await expect(grid.getByText("first", { exact: true })).toBeVisible();
});

test("a failed query underlines the position the engine points at", async ({ page }) => {
  await bootApp(page);
  const { panel, editor } = await newQuery(page, "select 1 as ok;\nselect * FORM nowhere");

  await page.keyboard.press(`${mod}+Enter`);
  await expect(panel.getByText("Query error")).toBeVisible();

  // The error says LINE 1, because only the second statement ran. The mark
  // has to land on line 2 of the document all the same.
  const mark = editor.locator(".cm-sql-error");
  await expect(mark).toHaveText("nowhere");
  await expect(mark).toHaveAttribute("title", /syntax error/);

  // The mark described the text that ran. Editing removes it.
  await page.keyboard.press("End");
  await page.keyboard.type(" ");
  await expect(mark).toHaveCount(0);
});

test("history keeps every run and can be searched", async ({ page }) => {
  await bootApp(page);
  await newQuery(page, "select 'needle_in_history' as marker");
  await page.keyboard.press(`${mod}+Enter`);
  await expect(page.getByRole("grid", { name: "Query result" }).last()).toBeVisible();

  await newQuery(page, "select * FORM broken_on_purpose");
  await page.keyboard.press(`${mod}+Enter`);
  await expect(page.locator('[role="tabpanel"]:not([hidden])').getByText("Query error")).toBeVisible();

  await page.getByRole("button", { name: "Library" }).click();
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible();

  const list = page.getByRole("main").getByRole("listitem");
  await expect(list.filter({ hasText: "needle_in_history" })).toHaveCount(1);
  await expect(list.filter({ hasText: "broken_on_purpose" })).toHaveCount(1);

  await page.getByLabel("Search history").fill("needle");
  await expect(list).toHaveCount(1);
  await expect(list.first()).toContainText("needle_in_history");

  await page.getByLabel("Search history").fill("");
  await page.getByRole("tab", { name: "Failed" }).click();
  await expect(list).toHaveCount(1);
  await expect(list.first()).toContainText("broken_on_purpose");

  // History survives a reload: it is read from storage, not from memory.
  await page.reload();
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("main").getByRole("listitem").filter({ hasText: "needle_in_history" })).toHaveCount(1);
});

test("the command menu finds an earlier query and opens it", async ({ page }) => {
  await bootApp(page);
  await newQuery(page, "select 'findable_from_menu' as marker");
  await page.keyboard.press(`${mod}+Enter`);
  await expect(page.getByRole("grid", { name: "Query result" }).last()).toBeVisible();

  await page.getByRole("button", { name: "Command menu" }).click();
  const menu = page.getByRole("dialog", { name: "Command menu" });
  await menu.getByLabel("Search tables, tabs and actions").fill("findable_from");
  await expect(menu.getByText("Recent queries")).toBeVisible();
  await page.keyboard.press("Enter");

  await expect(menu).toBeHidden();
  await expect(page.locator('[role="tabpanel"]:not([hidden]) .cm-content')).toContainText("findable_from_menu");
});
