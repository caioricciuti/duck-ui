import { describe, it, expect } from "vitest";
import {
  closeInPanes,
  isSplit,
  joinPanes,
  moveToPane,
  restorePanes,
  settlePanes,
  splitToSide,
  visibleTabs,
  type PaneState,
} from "../tabPanes";
import type { EditorTab } from "../types";

const home: EditorTab = { id: "home", title: "Home", type: "home", content: "" };
const sql = (id: string, pane?: "right"): EditorTab => ({
  id,
  title: id,
  type: "sql",
  content: "",
  ...(pane ? { pane } : {}),
});

/** Tab ids per pane, in bar order, for readable assertions. */
const layout = (state: PaneState) => ({
  left: state.tabs.filter((tab) => tab.pane !== "right").map((tab) => tab.id),
  right: state.tabs.filter((tab) => tab.pane === "right").map((tab) => tab.id),
  shown: visibleTabs(state),
  active: state.activeTabId,
});

const single = (active = "a"): PaneState => ({
  tabs: [home, sql("a"), sql("b"), sql("c")],
  activeTabId: active,
  otherPaneTabId: null,
});

/** Home, a | b, c with `b` focused and `a` showing on the left. */
const split = (): PaneState => ({
  tabs: [home, sql("a"), sql("b", "right"), sql("c", "right")],
  activeTabId: "b",
  otherPaneTabId: "a",
});

describe("moveToPane", () => {
  it("opens the right pane with the tab, focused, and leaves its neighbour showing on the left", () => {
    const next = moveToPane(single("b"), "b", "right");

    expect(layout(next)).toEqual({
      left: ["home", "a", "c"],
      right: ["b"],
      shown: { left: "c", right: "b" },
      active: "b",
    });
  });

  it("keeps the tab that was being worked in on screen when another tab is moved", () => {
    const next = moveToPane(single("a"), "c", "right");

    expect(layout(next).shown).toEqual({ left: "a", right: "c" });
    expect(next.activeTabId).toBe("c");
  });

  it("moves a tab back and closes the right pane when it was the last one there", () => {
    const state = moveToPane(single("b"), "b", "right");
    const next = moveToPane(state, "b", "left");

    expect(isSplit(next.tabs)).toBe(false);
    expect(next.tabs.find((tab) => tab.id === "b")).not.toHaveProperty("pane");
    expect(next.activeTabId).toBe("b");
    expect(next.otherPaneTabId).toBeNull();
  });

  it("never moves Home", () => {
    const state = single("home");
    expect(moveToPane(state, "home", "right")).toBe(state);
  });

  it("splits with only Home left behind", () => {
    const state: PaneState = { tabs: [home, sql("a")], activeTabId: "a", otherPaneTabId: null };
    const next = moveToPane(state, "a", "right");

    expect(layout(next).shown).toEqual({ left: "home", right: "a" });
  });
});

describe("splitToSide", () => {
  it("on the right edge sends the tab to a new right pane", () => {
    const next = splitToSide(single("a"), "b", "right");
    expect(layout(next)).toMatchObject({ left: ["home", "a", "c"], right: ["b"] });
  });

  it("on the left edge keeps the tab and sends the others right", () => {
    const next = splitToSide(single("a"), "b", "left");

    expect(layout(next)).toEqual({
      left: ["home", "b"],
      right: ["a", "c"],
      shown: { left: "b", right: "a" },
      active: "b",
    });
  });

  it("with two panes moves the tab to the pane on that side", () => {
    const next = splitToSide(split(), "c", "left");
    expect(layout(next)).toMatchObject({ left: ["home", "a", "c"], right: ["b"], active: "c" });
  });

  it("does nothing on the left edge when there is no other tab to send away", () => {
    const state: PaneState = { tabs: [home, sql("a")], activeTabId: "a", otherPaneTabId: null };
    expect(splitToSide(state, "a", "left")).toBe(state);
  });
});

describe("settlePanes: focus", () => {
  it("focusing the other pane leaves the previous tab showing in its own", () => {
    const state = split();
    const next = settlePanes(state.tabs, "a", [state.activeTabId, state.otherPaneTabId]);

    expect(next.activeTabId).toBe("a");
    expect(visibleTabs(next)).toEqual({ left: "a", right: "b" });
  });

  it("switching tabs inside a pane does not change what the other pane shows", () => {
    const state = split();
    const next = settlePanes(state.tabs, "c", [state.activeTabId, state.otherPaneTabId]);

    expect(visibleTabs(next)).toEqual({ left: "a", right: "c" });
  });

  it("puts Home first and on the left", () => {
    const next = settlePanes([sql("a"), { ...home, pane: "right" }, sql("b", "right")], "a");

    expect(next.tabs.map((tab) => tab.id)).toEqual(["home", "a", "b"]);
    expect(next.tabs[0]).not.toHaveProperty("pane");
  });

  it("turns a right pane with nothing on the left into a single pane", () => {
    const next = settlePanes([sql("a", "right"), sql("b", "right")], "a");

    expect(isSplit(next.tabs)).toBe(false);
    expect(next.otherPaneTabId).toBeNull();
  });

  it("falls back to the first tab when the active one is gone", () => {
    expect(settlePanes([home, sql("a")], "missing").activeTabId).toBe("home");
  });
});

describe("closeInPanes", () => {
  it("shows the next tab of the same pane, not the first tab of the workspace", () => {
    const next = closeInPanes(single("b"), "b");
    expect(next.activeTabId).toBe("c");
  });

  it("shows the previous tab when the last one of a pane closes", () => {
    const next = closeInPanes(single("c"), "c");
    expect(next.activeTabId).toBe("b");
  });

  it("closing the focused tab keeps the focus in its pane", () => {
    const next = closeInPanes(split(), "b");
    expect(layout(next)).toMatchObject({
      right: ["c"],
      shown: { left: "a", right: "c" },
      active: "c",
    });
  });

  it("closing the last tab of the right pane goes back to one pane", () => {
    const state: PaneState = {
      tabs: [home, sql("a"), sql("b", "right")],
      activeTabId: "b",
      otherPaneTabId: "a",
    };
    const next = closeInPanes(state, "b");

    expect(isSplit(next.tabs)).toBe(false);
    expect(next.activeTabId).toBe("a");
    expect(next.otherPaneTabId).toBeNull();
  });

  it("closing the tab the other pane shows replaces it there and keeps the focus", () => {
    const state: PaneState = { ...split(), activeTabId: "a", otherPaneTabId: "b" };
    const next = closeInPanes(state, "b");

    expect(next.activeTabId).toBe("a");
    expect(visibleTabs(next)).toEqual({ left: "a", right: "c" });
  });

  it("closing a background tab changes nothing on screen", () => {
    const next = closeInPanes(split(), "c");
    expect(visibleTabs(next)).toEqual({ left: "a", right: "b" });
  });

  it("never closes Home", () => {
    const state = single("home");
    expect(closeInPanes(state, "home")).toBe(state);
  });
});

describe("visibleTabs", () => {
  it("shows only the active tab without a split", () => {
    expect(visibleTabs(single("b"))).toEqual({ left: "b", right: null });
  });

  it("survives a stale other-pane tab, as left by code that replaces the tab list", () => {
    const state: PaneState = { ...split(), otherPaneTabId: "deleted" };
    expect(visibleTabs(state)).toEqual({ left: "home", right: "b" });
  });
});

describe("restorePanes", () => {
  it("gives a workspace saved without Home its Home back", () => {
    const next = restorePanes([sql("a")], "a");

    expect(next.tabs.map((tab) => tab.id)).toEqual(["home", "a"]);
    expect(next.activeTabId).toBe("a");
  });

  it("restores a saved split and picks a tab for the pane that is not focused", () => {
    const next = restorePanes(split().tabs, "c");

    expect(visibleTabs(next)).toEqual({ left: "home", right: "c" });
    expect(next.otherPaneTabId).toBe("home");
  });

  it("opens on the first tab when the saved active tab no longer exists", () => {
    expect(restorePanes([home, sql("a")], "settings-tab").activeTabId).toBe("home");
  });
});

describe("joinPanes", () => {
  it("puts every tab back in one pane and keeps the active one", () => {
    const next = joinPanes(split());

    expect(isSplit(next.tabs)).toBe(false);
    expect(next.tabs.map((tab) => tab.id)).toEqual(["home", "a", "b", "c"]);
    expect(next.activeTabId).toBe("b");
  });
});
