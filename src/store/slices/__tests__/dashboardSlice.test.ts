import { describe, it, expect, vi, beforeEach } from "vitest";

const saveDashboard = vi.hoisted(() => vi.fn());

vi.mock("svelte-sonner", () => ({
  toast: { warning: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/services/engine", () => ({ getSession: vi.fn() }));

vi.mock("@/services/dashboard/queryRunner", () => ({
  DatasetRunner: class {
    dispose() {}
  },
}));

vi.mock("@/services/persistence/repositories/dashboardRepository", () => ({
  deleteDashboard: vi.fn().mockResolvedValue(undefined),
  duplicateDashboard: vi.fn(),
  listDashboards: vi.fn(),
  newDashboard: vi.fn(),
  saveDashboard,
}));

import { createDashboardSlice, isDashboardEditing } from "../dashboardSlice";
import type { Dashboard } from "@/services/dashboard/types";
import type { DashboardSlice, EditorTab } from "../../types";

type State = DashboardSlice & {
  tabs: EditorTab[];
  activeTabId: string | null;
  currentProfileId: string | null;
};

const dashboard = (id: string, source = ""): Dashboard =>
  ({ id, name: id, source, updatedAt: "2024-01-01T00:00:00.000Z" }) as Dashboard;

const dashboardTab = (id: string, dashboardId: string): EditorTab => ({
  id,
  title: dashboardId,
  type: "dashboard",
  content: dashboardId,
});

const setup = (initial: Partial<State> = {}) => {
  let state = {} as State;
  const get = () => state as never;
  const set = (partial: unknown) => {
    const next = typeof partial === "function" ? partial(state) : partial;
    state = { ...state, ...(next as object) };
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const slice = createDashboardSlice(set as any, get as any, undefined as any);
  state = {
    ...slice,
    tabs: [],
    activeTabId: null,
    currentProfileId: "p1",
    ...initial,
  };
  return () => state;
};

describe("dashboard edit mode", () => {
  it("belongs to one dashboard, not to every open one", () => {
    const state = setup({ dashboards: [dashboard("a"), dashboard("b")] });

    state().setDashboardEditing(true, "a");

    expect(isDashboardEditing(state(), "a")).toBe(true);
    expect(isDashboardEditing(state(), "b")).toBe(false);

    state().setDashboardEditing(true, "b");
    state().setDashboardEditing(false, "a");

    expect(isDashboardEditing(state(), "a")).toBe(false);
    expect(isDashboardEditing(state(), "b")).toBe(true);
  });

  it("applies to the active dashboard tab when no id is given", () => {
    const state = setup({
      tabs: [dashboardTab("t1", "a"), dashboardTab("t2", "b")],
      activeTabId: "t2",
    });

    state().setDashboardEditing(true);

    expect(isDashboardEditing(state(), "b")).toBe(true);
    expect(isDashboardEditing(state(), "a")).toBe(false);
  });

  it("does nothing without an id when no dashboard is in front", () => {
    const state = setup({
      tabs: [{ id: "t1", title: "Q", type: "sql", content: "select 1" }],
      activeTabId: "t1",
    });
    state().setDashboardEditing(true);
    expect(state().dashboardEditing).toEqual({});
  });

  it("forgets the flag of a deleted dashboard", async () => {
    const state = setup({ dashboards: [dashboard("a")] });
    state().setDashboardEditing(true, "a");
    await state().deleteDashboard("a");
    expect(state().dashboardEditing).toEqual({});
  });
});

describe("updateDashboard ordering", () => {
  const written: string[] = [];

  beforeEach(() => {
    written.length = 0;
    saveDashboard.mockReset();
  });

  /** Saves that take as long as the test says, per source text. */
  const slowSaves = (delays: Record<string, number>) =>
    saveDashboard.mockImplementation(async (_profileId: string, entry: Dashboard) => {
      await new Promise((resolve) => setTimeout(resolve, delays[entry.source] ?? 0));
      written.push(entry.source);
      return { ...entry, updatedAt: `saved:${entry.source}` };
    });

  it("keeps the newer text when the older save finishes last", async () => {
    slowSaves({ older: 30, newer: 0 });
    const state = setup({ dashboards: [dashboard("a", "start")] });

    const first = state().updateDashboard(dashboard("a", "older"));
    const second = state().updateDashboard(dashboard("a", "newer"));

    // Optimistic: the newest text is on screen at once.
    expect(state().dashboards[0].source).toBe("newer");

    await Promise.all([first, second]);

    expect(state().dashboards[0].source).toBe("newer");
    expect(state().dashboards[0].updatedAt).toBe("saved:newer");
    // Storage must end on the newest text as well.
    expect(written[written.length - 1]).toBe("newer");
  });

  it("does not roll the store back while a newer edit waits to be saved", async () => {
    slowSaves({ older: 10, newer: 10 });
    const state = setup({ dashboards: [dashboard("a", "start")] });

    const first = state().updateDashboard(dashboard("a", "older"));
    const second = state().updateDashboard(dashboard("a", "newer"));

    await first;
    expect(state().dashboards[0].source).toBe("newer");
    await second;
    expect(state().dashboards[0].source).toBe("newer");
  });

  it("saves different dashboards independently", async () => {
    slowSaves({ one: 20, two: 0 });
    const state = setup({ dashboards: [dashboard("a"), dashboard("b")] });

    await Promise.all([
      state().updateDashboard(dashboard("a", "one")),
      state().updateDashboard(dashboard("b", "two")),
    ]);

    expect(state().dashboards.map((entry) => entry.source)).toEqual(["one", "two"]);
    expect(written).toEqual(["two", "one"]);
  });

  it("still saves a single edit and reports a failed one", async () => {
    const { toast } = await import("svelte-sonner");
    slowSaves({});
    const state = setup({ dashboards: [dashboard("a", "start")] });

    await state().updateDashboard(dashboard("a", "edited"));
    expect(written).toEqual(["edited"]);
    expect(state().dashboards[0].updatedAt).toBe("saved:edited");

    saveDashboard.mockRejectedValue(new Error("disk full"));
    await state().updateDashboard(dashboard("a", "again"));
    expect(toast.error).toHaveBeenCalledWith("Couldn't save the dashboard");
    expect(state().dashboards[0].source).toBe("again");
  });
});
