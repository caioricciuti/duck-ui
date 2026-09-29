import { describe, expect, it } from "vitest";
import {
  canonicalValue,
  createResultSnapshot,
  diffResults,
  diffSchema,
  isIdentical,
  ResultDiffError,
  valuesEqual,
  type DiffRow,
  type ResultSnapshot,
} from "../resultDiff";

const snap = (columns: string[], rows: DiffRow[], types?: string[]): ResultSnapshot =>
  createResultSnapshot({
    columns,
    columnTypes: types ?? columns.map(() => "INTEGER"),
    data: rows,
  });

describe("createResultSnapshot", () => {
  it("copies columns, types and rows", () => {
    const data = [{ a: 1 }, { a: 2 }];
    const s = createResultSnapshot({ columns: ["a"], columnTypes: ["INTEGER"], data });
    expect(s.columns).toEqual(["a"]);
    expect(s.columnTypes).toEqual(["INTEGER"]);
    expect(s.rows).toEqual(data);
    expect(s.rows).not.toBe(data);
    expect(s.sourceRowCount).toBe(2);
    expect(s.truncated).toBe(false);
  });

  it("caps rows at the limit and marks the snapshot truncated", () => {
    const data = Array.from({ length: 25 }, (_, i) => ({ i }));
    const s = createResultSnapshot({ columns: ["i"], data }, 10);
    expect(s.rows).toHaveLength(10);
    expect(s.rows[9]).toEqual({ i: 9 });
    expect(s.sourceRowCount).toBe(25);
    expect(s.truncated).toBe(true);
  });

  it("carries over engine truncation", () => {
    const s = createResultSnapshot({ columns: ["i"], data: [{ i: 1 }], truncated: true });
    expect(s.truncated).toBe(true);
  });

  it("uses rowCount when it is larger than the delivered data", () => {
    const s = createResultSnapshot({ columns: ["i"], data: [{ i: 1 }], rowCount: 5 });
    expect(s.sourceRowCount).toBe(5);
    expect(s.truncated).toBe(true);
  });

  it("fills missing column types with empty strings", () => {
    const s = createResultSnapshot({ columns: ["a", "b"], columnTypes: ["INTEGER"], data: [] });
    expect(s.columnTypes).toEqual(["INTEGER", ""]);
  });
});

describe("canonicalValue / valuesEqual", () => {
  it("treats null and undefined as the same missing value", () => {
    expect(valuesEqual(null, undefined)).toBe(true);
    expect(valuesEqual(null, "")).toBe(false);
    expect(valuesEqual(null, 0)).toBe(false);
  });

  it("matches numbers with bigints of equal value", () => {
    expect(valuesEqual(1, 1n)).toBe(true);
    expect(valuesEqual(2, 1n)).toBe(false);
  });

  it("does not match numbers with numeric strings", () => {
    expect(valuesEqual(1, "1")).toBe(false);
  });

  it("treats -0 and 0 as equal and NaN as equal to itself", () => {
    expect(valuesEqual(-0, 0)).toBe(true);
    expect(valuesEqual(NaN, NaN)).toBe(true);
  });

  it("compares dates by instant", () => {
    expect(valuesEqual(new Date("2024-01-01T00:00:00Z"), new Date(1704067200000))).toBe(true);
    expect(valuesEqual(new Date("2024-01-01"), new Date("2024-01-02"))).toBe(false);
    expect(canonicalValue(new Date("nope"))).toBe("d:invalid");
  });

  it("compares objects and arrays structurally, bigints included", () => {
    expect(valuesEqual({ a: [1, 2] }, { a: [1, 2] })).toBe(true);
    expect(valuesEqual({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
    expect(valuesEqual({ n: 5n }, { n: 5n })).toBe(true);
  });

  it("compares byte arrays by content", () => {
    expect(valuesEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true);
    expect(valuesEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(false);
  });

  it("distinguishes booleans from strings", () => {
    expect(valuesEqual(true, "true")).toBe(false);
    expect(valuesEqual(false, false)).toBe(true);
  });
});

describe("diffSchema", () => {
  it("reports added, removed and type-changed columns", () => {
    const d = diffSchema(
      { columns: ["id", "name", "old"], columnTypes: ["INTEGER", "VARCHAR", "DATE"] },
      { columns: ["id", "name", "new"], columnTypes: ["BIGINT", "VARCHAR", "DOUBLE"] }
    );
    expect(d.added).toEqual([{ name: "new", type: "DOUBLE" }]);
    expect(d.removed).toEqual([{ name: "old", type: "DATE" }]);
    expect(d.typeChanged).toEqual([{ name: "id", from: "INTEGER", to: "BIGINT" }]);
    expect(d.common).toEqual(["id", "name"]);
    expect(d.reordered).toBe(false);
  });

  it("flags a pure reorder without calling it a change", () => {
    const d = diffSchema(
      { columns: ["a", "b"], columnTypes: ["X", "Y"] },
      { columns: ["b", "a"], columnTypes: ["Y", "X"] }
    );
    expect(d.reordered).toBe(true);
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
    expect(d.typeChanged).toEqual([]);
    expect(d.common).toEqual(["b", "a"]);
  });
});

describe("diffResults — multiset (no keys)", () => {
  it("reports identical results as identical", () => {
    const a = snap(["x"], [{ x: 1 }, { x: 2 }]);
    const b = snap(["x"], [{ x: 2 }, { x: 1 }]);
    const d = diffResults(a, b);
    expect(d.rows.mode).toBe("multiset");
    expect(d.rows.unchangedCount).toBe(2);
    expect(isIdentical(d)).toBe(true);
  });

  it("finds added and removed rows", () => {
    const a = snap(
      ["x", "y"],
      [
        { x: 1, y: "a" },
        { x: 2, y: "b" },
      ]
    );
    const b = snap(
      ["x", "y"],
      [
        { x: 2, y: "b" },
        { x: 3, y: "c" },
      ]
    );
    const d = diffResults(a, b);
    expect(d.rows.added).toEqual([{ x: 3, y: "c" }]);
    expect(d.rows.removed).toEqual([{ x: 1, y: "a" }]);
    expect(d.rows.unchangedCount).toBe(1);
    expect(d.rows.changed).toEqual([]);
    expect(d.rowCount).toEqual({ left: 2, right: 2, delta: 0 });
    expect(isIdentical(d)).toBe(false);
  });

  it("counts duplicates instead of collapsing them", () => {
    const a = snap(["x"], [{ x: 1 }, { x: 1 }, { x: 1 }]);
    const b = snap(["x"], [{ x: 1 }]);
    const d = diffResults(a, b);
    expect(d.rows.removed).toEqual([{ x: 1 }, { x: 1 }]);
    expect(d.rows.added).toEqual([]);
    expect(d.rows.unchangedCount).toBe(1);
    expect(d.rowCount.delta).toBe(-2);
  });

  it("reports extra duplicates on the right as added", () => {
    const a = snap(["x"], [{ x: 1 }]);
    const b = snap(["x"], [{ x: 1 }, { x: 1 }]);
    const d = diffResults(a, b);
    expect(d.rows.added).toEqual([{ x: 1 }]);
    expect(d.rows.removed).toEqual([]);
  });

  it("compares only the columns both sides share", () => {
    const a = snap(["x", "gone"], [{ x: 1, gone: "a" }]);
    const b = snap(["x", "fresh"], [{ x: 1, fresh: "z" }]);
    const d = diffResults(a, b);
    expect(d.rows.comparedColumns).toEqual(["x"]);
    expect(d.rows.unchangedCount).toBe(1);
    expect(d.schema.added.map((c) => c.name)).toEqual(["fresh"]);
    expect(d.schema.removed.map((c) => c.name)).toEqual(["gone"]);
    expect(isIdentical(d)).toBe(false);
  });

  it("keeps removed rows in their original order", () => {
    const a = snap(["x"], [{ x: 3 }, { x: 1 }, { x: 2 }]);
    const b = snap(["x"], []);
    expect(diffResults(a, b).rows.removed).toEqual([{ x: 3 }, { x: 1 }, { x: 2 }]);
  });

  it("does not confuse a number with its string form", () => {
    const a = snap(["x"], [{ x: 1 }]);
    const b = snap(["x"], [{ x: "1" }]);
    const d = diffResults(a, b);
    expect(d.rows.added).toHaveLength(1);
    expect(d.rows.removed).toHaveLength(1);
  });

  it("handles empty inputs", () => {
    const d = diffResults(snap(["x"], []), snap(["x"], []));
    expect(isIdentical(d)).toBe(true);
  });
});

describe("diffResults — keyed", () => {
  const before = snap(
    ["id", "name", "score"],
    [
      { id: 1, name: "ann", score: 10 },
      { id: 2, name: "bob", score: 20 },
      { id: 3, name: "cat", score: 30 },
    ]
  );
  const after = snap(
    ["id", "name", "score"],
    [
      { id: 2, name: "bob", score: 25 },
      { id: 3, name: "cat", score: 30 },
      { id: 4, name: "dan", score: 40 },
    ]
  );

  it("pairs rows by key and names changed cells", () => {
    const d = diffResults(before, after, { keyColumns: ["id"] });
    expect(d.rows.mode).toBe("keyed");
    expect(d.rows.added).toEqual([{ id: 4, name: "dan", score: 40 }]);
    expect(d.rows.removed).toEqual([{ id: 1, name: "ann", score: 10 }]);
    expect(d.rows.changed).toEqual([
      {
        key: [2],
        before: { id: 2, name: "bob", score: 20 },
        after: { id: 2, name: "bob", score: 25 },
        changedColumns: ["score"],
      },
    ]);
    expect(d.rows.unchangedCount).toBe(1);
    expect(d.rows.duplicateKeys).toEqual({ left: 0, right: 0 });
  });

  it("supports composite keys", () => {
    const a = snap(
      ["k1", "k2", "v"],
      [
        { k1: "a", k2: 1, v: "x" },
        { k1: "a", k2: 2, v: "y" },
      ]
    );
    const b = snap(
      ["k1", "k2", "v"],
      [
        { k1: "a", k2: 1, v: "x" },
        { k1: "a", k2: 2, v: "Y" },
        { k1: "b", k2: 1, v: "z" },
      ]
    );
    const d = diffResults(a, b, { keyColumns: ["k1", "k2"] });
    expect(d.rows.changed).toHaveLength(1);
    expect(d.rows.changed[0].key).toEqual(["a", 2]);
    expect(d.rows.changed[0].changedColumns).toEqual(["v"]);
    expect(d.rows.added).toEqual([{ k1: "b", k2: 1, v: "z" }]);
  });

  it("does not let composite key parts run together", () => {
    const a = snap(["k1", "k2"], [{ k1: "ab", k2: "c" }]);
    const b = snap(["k1", "k2"], [{ k1: "a", k2: "bc" }]);
    const d = diffResults(a, b, { keyColumns: ["k1", "k2"] });
    expect(d.rows.added).toHaveLength(1);
    expect(d.rows.removed).toHaveLength(1);
  });

  it("matches null keys to null keys", () => {
    const a = snap(["id", "v"], [{ id: null, v: 1 }]);
    const b = snap(["id", "v"], [{ id: null, v: 2 }]);
    const d = diffResults(a, b, { keyColumns: ["id"] });
    expect(d.rows.changed).toHaveLength(1);
    expect(d.rows.changed[0].changedColumns).toEqual(["v"]);
  });

  it("pairs duplicate keys in order and counts them", () => {
    const a = snap(
      ["id", "v"],
      [
        { id: 1, v: "a" },
        { id: 1, v: "b" },
      ]
    );
    const b = snap(
      ["id", "v"],
      [
        { id: 1, v: "a" },
        { id: 1, v: "c" },
        { id: 1, v: "d" },
      ]
    );
    const d = diffResults(a, b, { keyColumns: ["id"] });
    expect(d.rows.duplicateKeys).toEqual({ left: 1, right: 2 });
    expect(d.rows.unchangedCount).toBe(1);
    expect(d.rows.changed).toHaveLength(1);
    expect(d.rows.changed[0].before).toEqual({ id: 1, v: "b" });
    expect(d.rows.changed[0].after).toEqual({ id: 1, v: "c" });
    expect(d.rows.added).toEqual([{ id: 1, v: "d" }]);
    expect(d.rows.removed).toEqual([]);
  });

  it("ignores columns that exist on one side only when comparing cells", () => {
    const a = snap(["id", "v", "old"], [{ id: 1, v: 1, old: "x" }]);
    const b = snap(["id", "v", "new"], [{ id: 1, v: 1, new: "y" }]);
    const d = diffResults(a, b, { keyColumns: ["id"] });
    expect(d.rows.changed).toEqual([]);
    expect(d.rows.unchangedCount).toBe(1);
  });

  it("matches bigint keys against number keys", () => {
    const a = snap(["id", "v"], [{ id: 1n, v: 1 }]);
    const b = snap(["id", "v"], [{ id: 1, v: 1 }]);
    const d = diffResults(a, b, { keyColumns: ["id"] });
    expect(d.rows.unchangedCount).toBe(1);
  });

  it("rejects key columns missing from either side", () => {
    const a = snap(["id", "v"], []);
    const b = snap(["v"], []);
    expect(() => diffResults(a, b, { keyColumns: ["id"] })).toThrow(ResultDiffError);
    expect(() => diffResults(a, b, { keyColumns: ["id"] })).toThrow(/id/);
  });

  it("treats an empty key list as a multiset diff", () => {
    expect(diffResults(before, after, { keyColumns: [] }).rows.mode).toBe("multiset");
  });
});

describe("diffResults — row count and partial results", () => {
  it("uses the source row counts, not the capped snapshot sizes", () => {
    const big = createResultSnapshot(
      { columns: ["i"], data: Array.from({ length: 50 }, (_, i) => ({ i })) },
      10
    );
    const small = snap(["i"], [{ i: 0 }]);
    const d = diffResults(small, big);
    expect(d.rowCount).toEqual({ left: 1, right: 50, delta: 49 });
    expect(d.partial).toBe(true);
  });

  it("is not partial when both sides are complete", () => {
    expect(diffResults(snap(["i"], []), snap(["i"], [])).partial).toBe(false);
  });
});
