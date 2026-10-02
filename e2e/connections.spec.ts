import { test, expect, type Page } from "@playwright/test";

/**
 * Connections a profile saves have to come back after a reload. They used
 * not to: the profile loaded them, then the engine's own start replaced
 * the list with the built-in ones.
 */

/** Boots straight into the Connections page, which has no tab bar to wait for. */
async function bootConnections(page: Page) {
  await page.goto("/?page=connections");
  const dialog = page.getByRole("dialog", { name: "New profile" });
  try {
    await dialog.waitFor({ state: "visible", timeout: 20_000 });
    await dialog.getByLabel("Name", { exact: true }).fill("e2e");
    await dialog.getByRole("button", { name: "Create profile" }).click();
    await dialog.waitFor({ state: "hidden" });
  } catch {
    // The profile already exists.
  }
  await expect(page.getByRole("heading", { name: "Connections", level: 1 })).toBeVisible({
    timeout: 60_000,
  });
}

test("a saved browser-storage connection is still listed after a reload", async ({ page }) => {
  await bootConnections(page);
  const list = page.getByRole("table");
  await expect(list.getByRole("row", { name: /WASM/ })).toBeVisible({ timeout: 60_000 });

  await page.getByRole("button", { name: "Add connection" }).click();
  const sheet = page.getByRole("dialog", { name: "Add New Connection" });
  await sheet.getByLabel("Connection Name").fill("Kept");
  await sheet.getByLabel("Connection Type").selectOption("OPFS");
  await sheet.getByLabel("Database File").fill("kept.db");
  await sheet.getByRole("button", { name: "Connect" }).click();
  await expect(sheet).toBeHidden({ timeout: 60_000 });
  await expect(list.getByRole("row", { name: /Kept/ })).toBeVisible();

  await page.reload();
  await bootConnections(page);
  await expect(list.getByRole("row", { name: /WASM/ })).toBeVisible({ timeout: 60_000 });
  await expect(list.getByRole("row", { name: /Kept/ })).toBeVisible({ timeout: 30_000 });
  // One row, not a duplicate from the engine and the profile each adding it.
  await expect(list.getByRole("row", { name: /Kept/ })).toHaveCount(1);
});
