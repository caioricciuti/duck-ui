import { describe, it, expect, vi, beforeEach } from "vitest";

const rows = new Map<string, unknown>();

vi.mock("../fallback", () => ({
  fallbackGetAll: vi.fn(async () => [...rows.values()]),
  fallbackPut: vi.fn(async (_store: string, row: { id: string }) => {
    rows.set(row.id, row);
  }),
  fallbackDelete: vi.fn(async (_store: string, id: string) => {
    rows.delete(id);
  }),
}));

import { listDashboards, saveDashboard } from "../repositories/dashboardRepository";
import { createDashboard } from "@/services/dashboard/types";

const store = (payload: object) =>
  rows.set((payload as { id: string }).id, {
    id: (payload as { id: string }).id,
    profile_id: "p1",
    payload: JSON.stringify(payload),
    updated_at: "2026-01-01T00:00:00.000Z",
  });

describe("dashboardRepository refresh interval", () => {
  beforeEach(() => rows.clear());

  it("round-trips a saved interval", async () => {
    const dashboard = { ...createDashboard("A", "a", "2026-01-01"), source: "# A" };
    await saveDashboard("p1", { ...dashboard, refreshIntervalSeconds: 300 });
    const [loaded] = await listDashboards("p1");
    expect(loaded.refreshIntervalSeconds).toBe(300);
  });

  it("loads a record saved before the field existed as off", async () => {
    const legacy = { ...createDashboard("Old", "old", "2026-01-01"), source: "# Old" };
    store(legacy);
    const [loaded] = await listDashboards("p1");
    expect(loaded.id).toBe("old");
    expect(loaded.refreshIntervalSeconds).toBeUndefined();
  });

  it("sanitises a corrupt interval instead of scheduling it", async () => {
    store({ ...createDashboard("B", "b", "2026-01-01"), source: "# B", refreshIntervalSeconds: 1 });
    store({
      ...createDashboard("C", "c", "2026-01-01"),
      source: "# C",
      refreshIntervalSeconds: "x",
    });
    const loaded = await listDashboards("p1");
    expect(loaded.find((d) => d.id === "b")?.refreshIntervalSeconds).toBe(10);
    expect(loaded.find((d) => d.id === "c")?.refreshIntervalSeconds).toBeUndefined();
  });
});
