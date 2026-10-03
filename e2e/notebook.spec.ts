import { test, expect, type Page } from "@playwright/test";

/**
 * Notebook cell management through the real UI. The "+" under a cell opens
 * a menu positioned in viewport coordinates; it once sat inside a transformed
 * wrapper, which pinned the menu to that wrapper and put it off screen.
 */

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

test("the + under a cell adds a cell of the chosen type right after it", async ({ page }) => {
  await bootApp(page);
  await page.getByRole("button", { name: "New notebook" }).click();
  const panel = page.locator('[role="tabpanel"]:not([hidden])');
  await expect(panel.getByText("[1]", { exact: true })).toBeVisible({ timeout: 60_000 });

  await panel.getByText("[1]", { exact: true }).hover();
  await panel.getByRole("button", { name: "Add cell below" }).click();
  const item = page.getByRole("menuitem", { name: "Python Cell" });
  await expect(item).toBeInViewport();
  await item.click();

  await expect(panel.getByText("[2]", { exact: true })).toBeVisible();
  await expect(panel.getByText("PY", { exact: true })).toBeVisible();
});
