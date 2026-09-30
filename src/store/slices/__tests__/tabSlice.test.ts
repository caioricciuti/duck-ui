import { describe, it, expect, vi } from "vitest";

vi.mock("svelte-sonner", () => ({
  toast: { warning: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("@/services/python/kernel", () => ({ disposePythonKernel: vi.fn() }));
vi.mock("@/lib/pageNavigation", () => ({ isPageTabType: () => false, openPageFor: vi.fn() }));
vi.mock("@/lib/appConfig", () => ({ isGatedTabHidden: () => false }));

import { createStore } from "@/store/createStore";
import { createTabSlice } from "../tabSlice";
import type { TabSlice } from "../../types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const setup = () => createStore<TabSlice>(createTabSlice as any);

describe("openTableTab", () => {
  it("opens a table as a tab titled after it and focuses it", () => {
    const store = setup();
    const id = store.getState().openTableTab("memory", "main", "orders");

    const tab = store.getState().tabs.find((t) => t.id === id);
    expect(tab).toMatchObject({
      type: "table",
      title: "orders",
      content: { database: "memory", schema: "main", table: "orders" },
    });
    expect(store.getState().activeTabId).toBe(id);
  });

  it("focuses the existing tab instead of opening the same table twice", () => {
    const store = setup();
    const first = store.getState().openTableTab("memory", "main", "orders");
    store.getState().setActiveTab("home");

    const again = store.getState().openTableTab("memory", "main", "orders");

    expect(again).toBe(first);
    expect(store.getState().activeTabId).toBe(first);
    expect(store.getState().tabs.filter((t) => t.type === "table")).toHaveLength(1);
  });

  it("treats a missing schema as main", () => {
    const store = setup();
    const first = store.getState().openTableTab("memory", undefined, "orders");
    expect(store.getState().openTableTab("memory", "main", "orders")).toBe(first);
  });

  it("keeps tables of the same name in other schemas and databases apart", () => {
    const store = setup();
    const main = store.getState().openTableTab("shop", "main", "orders");
    const staging = store.getState().openTableTab("shop", "staging", "orders");
    const other = store.getState().openTableTab("archive", "main", "orders");

    expect(new Set([main, staging, other]).size).toBe(3);
  });
});

describe("panes", () => {
  const titles = (store: ReturnType<typeof setup>, pane?: "right") =>
    store
      .getState()
      .tabs.filter((tab) => tab.pane === pane)
      .map((tab) => tab.title);

  it("opens a new tab in the pane being worked in", () => {
    const store = setup();
    const left = store.getState().createTab("sql", "", "left");
    const right = store.getState().createTab("sql", "", "right");
    store.getState().splitTab(right);

    store.getState().createTab("sql", "", "next to right");
    expect(titles(store, "right")).toEqual(["right", "next to right"]);

    store.getState().setActiveTab(left);
    store.getState().createTab("sql", "", "next to left");
    expect(titles(store)).toEqual(["Home", "left", "next to left"]);
  });

  it("focusing the other pane keeps the tab that was active on screen there", () => {
    const store = setup();
    const left = store.getState().createTab("sql", "", "left");
    const right = store.getState().createTab("sql", "", "right");
    store.getState().splitTab(right);

    store.getState().setActiveTab(left);

    expect(store.getState().activeTabId).toBe(left);
    expect(store.getState().otherPaneTabId).toBe(right);
  });

  it("splitTab sends a tab across and back, and the right pane closes when empty", () => {
    const store = setup();
    const id = store.getState().createTab("sql", "", "only");

    store.getState().splitTab(id);
    expect(titles(store, "right")).toEqual(["only"]);

    store.getState().splitTab(id);
    expect(titles(store, "right")).toEqual([]);
    expect(store.getState().otherPaneTabId).toBeNull();
  });

  it("does not close, move or split Home", () => {
    const store = setup();
    const id = store.getState().createTab("sql", "", "query");

    store.getState().closeTab("home");
    store.getState().splitTab("home");
    store.getState().moveTab(0, 1);
    store.getState().moveTab(1, 0);

    expect(titles(store)).toEqual(["Home", "query"]);
    expect(store.getState().activeTabId).toBe(id);
  });

  it("closeAllTabs leaves Home, in one pane", () => {
    const store = setup();
    store.getState().splitTab(store.getState().createTab("sql", "", "a"));
    store.getState().createTab("sql", "", "b");

    store.getState().closeAllTabs();

    expect(store.getState().tabs.map((tab) => tab.title)).toEqual(["Home"]);
    expect(store.getState().activeTabId).toBe("home");
    expect(store.getState().otherPaneTabId).toBeNull();
  });

  it("ignores a request to focus a tab that does not exist", () => {
    const store = setup();
    const id = store.getState().createTab("sql", "", "query");

    store.getState().setActiveTab("gone");

    expect(store.getState().activeTabId).toBe(id);
  });
});
