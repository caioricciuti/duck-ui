import { test, expect, type Page } from "@playwright/test";

/**
 * The map view for GEOMETRY results. The check that matters is the height:
 * maplibre's stylesheet once beat the container's positioning and the map
 * rendered 0 px tall, so everything else about it looked fine in the code
 * and nothing showed on screen.
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
  await panel.locator(".cm-content").click();
  await page.keyboard.insertText(sql);
  return panel;
}

test("a GEOMETRY result gets a Map view that draws at full height", async ({ page }) => {
  // The spatial extension comes from the network on first use.
  test.slow();
  await bootApp(page);
  const panel = await newQuery(
    page,
    "INSTALL spatial;\nLOAD spatial;\nSELECT ST_Point(2.17 + i, 41.38) AS geom, i FROM range(3) t(i)"
  );
  // Mod-Shift-Enter runs the whole document; the last statement's result is shown.
  await page.keyboard.press(`${mod}+Shift+Enter`);

  const mapTab = panel.getByRole("tablist", { name: "Result views" }).getByRole("tab", { name: "Map" });
  await expect(mapTab).toBeVisible({ timeout: 60_000 });
  await mapTab.click();

  await expect(panel.getByText("3 features")).toBeVisible({ timeout: 60_000 });
  // Measure the container, not the canvas: maplibre sizes the canvas to a
  // 300 px fallback when the container has no height, so the canvas alone
  // looked fine while the 0 px container clipped it away.
  const map = panel.locator(".maplibregl-map");
  await expect(map.locator(".maplibregl-canvas")).toBeAttached({ timeout: 60_000 });
  await expect
    .poll(async () => (await map.boundingBox())?.height ?? 0, { timeout: 30_000 })
    .toBeGreaterThan(100);
  const box = await map.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(100);
});
