import { test, expect, type Page } from "@playwright/test";

/**
 * Two panes side by side: each shows a tab, both keep working, and the
 * layout survives a reload.
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
  await expect(leftBar(page)).toBeVisible({ timeout: 60_000 });
}

const leftBar = (page: Page) => page.getByRole("tablist", { name: "Open tabs", exact: true });
const rightBar = (page: Page) => page.getByRole("tablist", { name: "Right pane tabs" });
const panels = (page: Page) => page.locator('[role="tabpanel"]:not([hidden])');
const panel = (page: Page, title: string) =>
  page.locator(`[role="tabpanel"][aria-label="${title}"]:not([hidden])`);

/** Opens a query tab named `title` holding `sql`, and runs it. */
async function runQueryTab(page: Page, title: string, sql: string) {
  await leftBar(page).getByRole("button", { name: "New query" }).click();
  const tab = leftBar(page).getByRole("tab", { name: "Untitled Query" });
  await tab.dblclick();
  await page.getByLabel("Tab name").fill(title);
  await page.keyboard.press("Enter");
  await panel(page, title).locator(".cm-content").click();
  await page.keyboard.insertText(sql);
  await page.keyboard.press(`${mod}+Enter`);
  await expect(panel(page, title).getByRole("grid", { name: "Query result" })).toBeVisible();
}

test("two tabs side by side both keep working, and the split survives a reload", async ({
  page,
}) => {
  await bootApp(page);
  await runQueryTab(page, "first", "select 'from the first' as side");
  await runQueryTab(page, "second", "select 'from the second' as side");

  // One pane so far.
  await expect(rightBar(page)).toHaveCount(0);
  await expect(panels(page)).toHaveCount(1);

  await leftBar(page).getByRole("tab", { name: "second" }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Split right" }).click();

  // The tab moved to its own bar; the left pane shows the tab next to it.
  await expect(rightBar(page).getByRole("tab", { name: "second" })).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expect(leftBar(page).getByRole("tab", { name: "second" })).toHaveCount(0);
  await expect(panels(page)).toHaveCount(2);
  await expect(panel(page, "first").getByText("from the first", { exact: true })).toBeVisible();
  await expect(panel(page, "second").getByText("from the second", { exact: true })).toBeVisible();

  // The moved tab kept its editor and result: it was not mounted again.
  await expect(panel(page, "second").locator(".cm-content")).toContainText("from the second");

  // Each pane runs on its own.
  await panel(page, "first").locator(".cm-content").click();
  await page.keyboard.press(`${mod}+a`);
  await page.keyboard.insertText("select 'left again' as side");
  await page.keyboard.press(`${mod}+Enter`);
  await expect(panel(page, "first").getByText("left again", { exact: true })).toBeVisible();
  await expect(panel(page, "second").getByText("from the second", { exact: true })).toBeVisible();

  // A new tab opens in the pane that was clicked last.
  await panel(page, "second").locator(".cm-content").click();
  await page.keyboard.press("Alt+n");
  await expect(rightBar(page).getByRole("tab")).toHaveCount(2);
  await rightBar(page).getByRole("button", { name: "Close Untitled Query" }).click();
  await expect(rightBar(page).getByRole("tab")).toHaveCount(1);

  // The layout is saved with the tabs.
  await page.waitForTimeout(3000);
  await page.reload();
  await expect(rightBar(page).getByRole("tab", { name: "second" })).toBeVisible({ timeout: 60_000 });
  await expect(leftBar(page).getByRole("tab", { name: "first" })).toBeVisible();
  await expect(panels(page)).toHaveCount(2);

  // Closing the last tab of a pane goes back to one pane.
  await rightBar(page).getByRole("button", { name: "Close second" }).click();
  await expect(rightBar(page)).toHaveCount(0);
  await expect(panels(page)).toHaveCount(1);
});

test("dragging a tab to the right edge splits, dragging it back joins", async ({ page }) => {
  await bootApp(page);
  await runQueryTab(page, "first", "select 1 as n");
  await runQueryTab(page, "second", "select 2 as n");

  const workspace = page.locator("main:not([hidden])");
  const box = (await workspace.boundingBox())!;
  await leftBar(page)
    .getByRole("tab", { name: "second" })
    .dragTo(workspace, { targetPosition: { x: box.width - 20, y: box.height / 2 } });

  await expect(rightBar(page).getByRole("tab", { name: "second" })).toBeVisible();
  await expect(panels(page)).toHaveCount(2);

  // Back onto the left bar: the right pane is empty and goes away.
  await rightBar(page).getByRole("tab", { name: "second" }).dragTo(leftBar(page).getByRole("tab", { name: "first" }));
  await expect(rightBar(page)).toHaveCount(0);
  await expect(leftBar(page).getByRole("tab", { name: "second" })).toHaveAttribute("aria-selected", "true");
});

test("Home is pinned: first, icon only, and it cannot be closed or split", async ({ page }) => {
  await bootApp(page);
  await runQueryTab(page, "first", "select 1 as n");

  const home = leftBar(page).getByRole("tab", { name: "Home" });
  await expect(leftBar(page).getByRole("tab").first()).toHaveAttribute("aria-label", "Home");
  await expect(home).toHaveText("");
  await expect(home.getByRole("button")).toHaveCount(0);

  await home.click({ button: "right" });
  // The name carries the shortcut, which also tells it apart from "Close others".
  await expect(page.getByRole("menuitem", { name: "Close ⌥W", exact: true })).toBeDisabled();
  await expect(page.getByRole("menuitem", { name: "Split right" })).toBeDisabled();
  await page.keyboard.press("Escape");

  // Closing a tab shows its neighbour, and Home is what remains.
  await leftBar(page).getByRole("button", { name: "Close first" }).click();
  await expect(home).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Alt+w");
  await expect(home).toBeVisible();
});
