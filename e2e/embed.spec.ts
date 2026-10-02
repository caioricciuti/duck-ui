import { test, expect, type Page } from "@playwright/test";

/**
 * The embed view: a shared query runs on its own at /embed, and the
 * interactive filters the Share dialog exposes actually filter it. They
 * were carried in the link and ignored by the view.
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

test("embed filters from the Share dialog filter the shared query live", async ({ page }) => {
  test.slow();
  await bootApp(page);

  // A query that reproduces anywhere: no local table.
  await page.getByRole("button", { name: "New query" }).click();
  const panel = page.locator('[role="tabpanel"]:not([hidden])');
  await panel.locator(".cm-content").click();
  await page.keyboard.insertText(
    "SELECT i AS n, CASE WHEN i % 2 = 0 THEN 'even' ELSE 'odd' END AS parity FROM range(10) t(i)"
  );
  await page.keyboard.press(`${mod}+Enter`);
  const grid = panel.getByRole("grid", { name: "Query result" });
  await expect(grid.getByText("odd").first()).toBeVisible({ timeout: 60_000 });

  // Expose n as a range and parity as a dropdown.
  await panel.getByRole("button", { name: "Share", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Share this analysis" });
  await sheet.getByRole("tab", { name: "Embed" }).click();
  await sheet.getByRole("checkbox", { name: "n", exact: true }).check();
  await sheet.getByRole("checkbox", { name: "parity", exact: true }).check();
  await expect(sheet.getByText("2 filters")).toBeVisible();
  const snippet = sheet.getByRole("textbox", { name: "iframe snippet" });
  await expect(snippet).not.toHaveValue(/Building/, { timeout: 30_000 });
  const src = /src="([^"]+)"/.exec(await snippet.inputValue())?.[1];
  expect(src).toBeTruthy();

  // Open the embed itself, as the iframe would.
  await page.goto(src as string);
  const embedGrid = page.getByRole("grid", { name: "Query result" });
  await expect(embedGrid.getByText("odd").first()).toBeVisible({ timeout: 120_000 });
  const filters = page.getByRole("group", { name: "Filters" });
  await expect(filters.getByLabel("parity")).toBeVisible();

  // Dropdown: only the even rows stay.
  await expect(filters.getByLabel("parity").locator("option", { hasText: "even" })).toBeAttached({
    timeout: 60_000,
  });
  await filters.getByLabel("parity").selectOption("even");
  await expect(embedGrid.getByText("odd", { exact: true })).toHaveCount(0, { timeout: 60_000 });
  await expect(embedGrid.getByText("even", { exact: true })).toHaveCount(5);

  // Range on top of it: evens from 6 up are 6 and 8.
  await filters.getByLabel("n", { exact: true }).fill("6");
  await expect(embedGrid.getByText("even", { exact: true })).toHaveCount(2, { timeout: 60_000 });
  await expect(embedGrid.getByText("8", { exact: true })).toBeVisible();

  // Reset brings every row back.
  await filters.getByRole("button", { name: "Reset" }).click();
  await expect(embedGrid.getByText("odd", { exact: true })).toHaveCount(5, { timeout: 60_000 });
});
