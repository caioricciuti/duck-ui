import { describe, it, expect, vi, beforeEach } from "vitest";

const executeQuery = vi.hoisted(() => vi.fn());

vi.mock("@/store", () => ({
  useDuckStore: {
    // A matching failed history entry with a different message: the error
    // must come from the result, not be read back from history.
    getState: () => ({
      executeQuery,
      queryHistory: [{ id: "h", query: "select 1", timestamp: new Date(), error: "stale" }],
    }),
  },
}));

import { runImportQuery } from "../context";

describe("runImportQuery", () => {
  beforeEach(() => executeQuery.mockReset());

  it("throws the message carried by a failed result", async () => {
    executeQuery.mockResolvedValue({
      columns: [],
      columnTypes: [],
      data: [],
      rowCount: 0,
      error: "HTTP 404 for https://example.com/missing.csv",
    });
    await expect(runImportQuery("select 1")).rejects.toThrow(
      "HTTP 404 for https://example.com/missing.csv"
    );
  });

  it("returns the result of a successful statement", async () => {
    const result = { columns: ["a"], columnTypes: ["INTEGER"], data: [{ a: 1 }], rowCount: 1 };
    executeQuery.mockResolvedValue(result);
    expect(await runImportQuery("select 1 as a")).toBe(result);
  });

  it("does not read a message back from history", async () => {
    executeQuery.mockResolvedValue(undefined);
    await expect(runImportQuery("select 1")).rejects.toThrow("Query failed");
  });
});
