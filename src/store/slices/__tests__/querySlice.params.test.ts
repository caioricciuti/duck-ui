import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * `$name` parameters substitute inside `executeQuery` for SQL tabs, so every
 * run path gets them — and a run with an unset parameter never reaches the
 * engine.
 */

vi.mock("@/services/engine", () => ({
  collectExecution: vi.fn().mockResolvedValue({ error: null, durationMs: 1 }),
  materializeCollected: vi.fn().mockReturnValue({
    columns: [],
    columnTypes: [],
    data: [],
    rowCount: 0,
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

const setup = (tab: EditorTab) => {
  let state: Record<string, unknown> = {
    tabs: [tab],
    executingTabs: {},
    queryProgress: {},
    queryHistory: [],
    maxResultRows: 1000,
    currentSession: { execute },
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
  return { slice, state: () => state as { tabs: EditorTab[] } };
};

describe("executeQuery with $name parameters", () => {
  beforeEach(() => execute.mockClear());

  it("substitutes tab parameter values before execution", async () => {
    const { slice } = setup({
      id: "t1",
      title: "Q",
      type: "sql",
      content: "",
      queryParams: { values: { n: "5", who: "O'Brien" } },
    });
    await slice.executeQuery("select * from t where a > $n and b = ${who} -- $n", "t1");
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0][0].sql).toBe(
      "select * from t where a > 5 and b = 'O''Brien' -- $n"
    );
  });

  it("blocks the run and explains when a parameter is unset", async () => {
    const { slice, state } = setup({ id: "t1", title: "Q", type: "sql", content: "" });
    await slice.executeQuery("select $missing", "t1");
    expect(execute).not.toHaveBeenCalled();
    expect(state().tabs[0].result?.error).toContain("$missing");
  });

  it("runs the SQL verbatim when parameters are disabled for the tab", async () => {
    const { slice } = setup({
      id: "t1",
      title: "Q",
      type: "sql",
      content: "",
      queryParams: { values: {}, disabled: true },
    });
    await slice.executeQuery("select $x", "t1");
    expect(execute.mock.calls[0][0].sql).toBe("select $x");
  });
});
