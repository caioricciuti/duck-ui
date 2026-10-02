import { describe, it, expect } from "vitest";
import { boxPlotData, boxStats, niceTicks, quantileSorted } from "../boxPlot";

describe("quantileSorted", () => {
  it("interpolates like DuckDB quantile_cont", () => {
    // SELECT quantile_cont(v, [0.25, 0.5, 0.75]) FROM (VALUES (1),(2),(3),(4)) t(v)
    expect(quantileSorted([1, 2, 3, 4], 0.25)).toBe(1.75);
    expect(quantileSorted([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantileSorted([1, 2, 3, 4], 0.75)).toBe(3.25);
    expect(quantileSorted([7], 0.5)).toBe(7);
  });
});

describe("boxStats", () => {
  it("puts values past 1.5 IQR outside the whiskers", () => {
    const box = boxStats("a", [1, 2, 3, 4, 5, 6, 7, 8, 9, 100])!;
    expect(box.median).toBe(5.5);
    expect(box.q1).toBe(3.25);
    expect(box.q3).toBe(7.75);
    expect(box.highWhisker).toBe(9);
    expect(box.lowWhisker).toBe(1);
    expect(box.outliers).toEqual([100]);
    expect(box.max).toBe(100);
  });

  it("keeps zero as a real value", () => {
    const box = boxStats("z", [0, 0, 0])!;
    expect(box.min).toBe(0);
    expect(box.lowWhisker).toBe(0);
    expect(box.highWhisker).toBe(0);
    expect(box.outliers).toEqual([]);
  });

  it("returns null without numbers", () => {
    expect(boxStats("none", [])).toBeNull();
  });
});

describe("boxPlotData", () => {
  const rows = [
    { g: "b", v: 1 },
    { g: "a", v: 2n },
    { g: "b", v: "3" },
    { g: "a", v: null },
    { g: null, v: 4 },
  ];

  it("groups by x in order of first appearance and skips non-numbers", () => {
    const boxes = boxPlotData(rows, "v", "g");
    expect(boxes.map((b) => [b.label, b.n])).toEqual([
      ["b", 2],
      ["a", 1],
      ["NULL", 1],
    ]);
  });

  it("draws one box without x", () => {
    const boxes = boxPlotData(rows, "v", undefined);
    expect(boxes).toHaveLength(1);
    expect(boxes[0].label).toBe("v");
    expect(boxes[0].n).toBe(4);
  });
});

describe("niceTicks", () => {
  it("encloses the data on round steps", () => {
    expect(niceTicks(3, 97)).toEqual([0, 20, 40, 60, 80, 100]);
    expect(niceTicks(0.1, 0.35, 5)).toEqual([0.1, 0.15, 0.2, 0.25, 0.3, 0.35]);
    expect(niceTicks(0, 101)).toEqual([0, 50, 100, 150]);
  });

  it("widens a flat range", () => {
    const ticks = niceTicks(5, 5);
    expect(ticks[0]).toBeLessThan(5);
    expect(ticks[ticks.length - 1]).toBeGreaterThan(5);
  });
});
