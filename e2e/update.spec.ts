import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * A new build used to need a hard reload: the service worker updated itself
 * but the open page kept the old code and said nothing. Now the rail shows an
 * update button once the new worker is in control, and the click reloads.
 *
 * A release is simulated by changing sw.js on disk between two update
 * checks; the preview server serves the file as it is on disk.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const swPath = path.join(here, "..", "dist", "sw.js");

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

test("a new build shows an update button in the rail, and clicking it reloads", async ({ page }) => {
  test.slow();
  const original = fs.readFileSync(swPath, "utf8");
  try {
    await bootApp(page);
    // The first visit installs the worker; from the next load on, the page
    // is controlled by it, which is the state every returning visitor is in.
    await page.waitForFunction(
      async () => (await navigator.serviceWorker.getRegistration())?.active?.state === "activated",
      null,
      { timeout: 60_000 }
    );
    await page.reload();
    await bootApp(page);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 60_000 });
    await expect(page.getByRole("button", { name: "Update to the latest version" })).toHaveCount(0);

    // A release: the worker script changes, and the open tab checks for it.
    fs.writeFileSync(swPath, `${original}\n// release ${Date.now()}\n`);
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration?.update();
    });

    const button = page.getByRole("button", { name: "Update to the latest version" });
    await expect(button).toBeVisible({ timeout: 60_000 });

    // The reload is the app's own: no leave prompt, and the workspace is back.
    page.on("dialog", (dialog) => {
      throw new Error(`Unexpected dialog: ${dialog.type()}`);
    });
    await button.click();
    await page.waitForLoadState("load");
    await expect(page.getByRole("tablist", { name: "Open tabs" })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("button", { name: "Update to the latest version" })).toHaveCount(0);
  } finally {
    fs.writeFileSync(swPath, original);
  }
});
