import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A failed run without a tab id must come back as a result carrying `error`.
 * It used to resolve with nothing, so ad-hoc callers took failures for success.
 */

const collectExecution = vi.hoisted(() => vi.fn());

vi.mock("@/services/engine", () => ({
  collectExecution,
  materializeCollected: vi.fn().mockReturnValue({
    columns: ["a"],
    columnTypes: ["INTEGER"],
    data: [{ a: 1 }],
    rowCount: 1,
  }),
  requireLocalDuckSession: vi.fn(),
}));

vi.mock("@/services/persistence/repositories/queryHistoryRepository", () => ({
  addHistoryEntry: vi.fn().mockResolvedValue(undefined),
  clearHistory: vi.fn(),
}));

vi.mock("@/services/duckdb", () => ({
  updateHistory: vi.fn((history: unknown[]) => history),
}));

import { createQuerySlice } from "../querySlice";
import type { EditorTab } from "../../types";

const execute = vi.fn().mockReturnValue({ cancel: vi.fn() });

const setup = (session: unknown = { execute }) => {
  const tab: EditorTab = { id: "t1", title: "Q", type: "sql", content: "" };
  let state: Record<string, unknown> = {
    tabs: [tab],
    executingTabs: {},
    queryProgress: {},
    queryHistory: [],
    maxResultRows: 1000,
    currentSession: session,
    currentProfileId: null,
    fetchDatabasesAndTablesInfo: vi.fn(),
  };
  const get = () => state as never;
  const set = (partial: unknown) => {
    const next = typeof partial === "function" ? partial(state) : partial;
    state = { ...state, ...(next as object) };
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const slice = createQuerySlice(set as any, get as any, undefined as any);
  return {
    slice,
    state: () => state as { tabs: EditorTab[]; queryProgress: Record<string, unknown> },
  };
};

describe("executeQuery failures", () => {
  beforeEach(() => {
    execute.mockClear();
    collectExecution.mockReset();
  });

  it("returns a result carrying the error when called without a tab id", async () => {
    collectExecution.mockResolvedValue({ error: { message: "Table t does not exist" } });
    const { slice, state } = setup();

    const result = await slice.executeQuery("select * from t");

    expect(result).toEqual({
      columns: [],
      columnTypes: [],
      data: [],
      rowCount: 0,
      error: "Table t does not exist",
    });
    // No tab was involved, so none may pick up the failure.
    expect(state().tabs[0].result).toBeUndefined();
    expect(state().queryProgress).toEqual({});
  });

  it("returns the error when there is no connection", async () => {
    const { slice } = setup(null);
    const result = await slice.executeQuery("select 1");
    expect(result?.error).toBe("No active connection");
  });

  it("still returns the rows of a successful ad-hoc run", async () => {
    collectExecution.mockResolvedValue({ error: null, durationMs: 1 });
    const { slice } = setup();
    const result = await slice.executeQuery("select 1 as a");
    expect(result?.error).toBeUndefined();
    expect(result?.rowCount).toBe(1);
  });

  it("keeps a tab run on the tab and returns nothing", async () => {
    collectExecution.mockResolvedValue({ error: { message: "boom" } });
    const { slice, state } = setup();
    const result = await slice.executeQuery("select 1", "t1");
    expect(result).toBeUndefined();
    expect(state().tabs[0].result?.error).toBe("boom");
  });
});
