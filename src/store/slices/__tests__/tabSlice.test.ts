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
