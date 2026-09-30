import { describe, expect, it } from "vitest";
import type { NotebookCell, QueryResult } from "@/store/types";
import { CellOutputCache, isCodeCell, isKnownCellType } from "../cells";

const result = (value: number): QueryResult => ({
  columns: ["n"],
  columnTypes: ["INTEGER"],
  data: [{ n: value }],
  rowCount: 1,
});

const parse = (cells: NotebookCell[]): NotebookCell[] =>
  JSON.parse(JSON.stringify(cells)) as NotebookCell[];

describe("CellOutputCache", () => {
  it("keeps the result object when only the text of a cell changed", () => {
    const cache = new CellOutputCache();
    const first = cache.reconcile(
      parse([{ id: "a", type: "sql", content: "select 1", result: result(1) }])
    );
    const second = cache.reconcile(
      parse([{ id: "a", type: "sql", content: "select 1 -- edited", result: result(1) }])
    );
    expect(second[0].content).toBe("select 1 -- edited");
    expect(second[0].result).toBe(first[0].result);
  });

  it("hands out the new result after a rerun", () => {
    const cache = new CellOutputCache();
    const first = cache.reconcile(
      parse([{ id: "a", type: "sql", content: "select 1", result: result(1) }])
    );
    const second = cache.reconcile(
      parse([{ id: "a", type: "sql", content: "select 1", result: result(2) }])
    );
    expect(second[0].result).not.toBe(first[0].result);
    expect(second[0].result?.data).toEqual([{ n: 2 }]);
  });

  it("forgets removed cells and leaves cleared outputs cleared", () => {
    const cache = new CellOutputCache();
    cache.reconcile(parse([{ id: "a", type: "sql", content: "", result: result(1) }]));
    const cleared = cache.reconcile(parse([{ id: "a", type: "sql", content: "", result: null }]));
    expect(cleared[0].result).toBeNull();
  });
});

describe("cell type guards", () => {
  it("recognizes the types this build can edit", () => {
    expect(isKnownCellType("python")).toBe(true);
    expect(isKnownCellType("r")).toBe(false);
    expect(isCodeCell("markdown")).toBe(false);
    expect(isCodeCell("sql")).toBe(true);
  });
});
