import { describe, it, expect } from "vitest";
import { HEATMAP_MAX_CATEGORIES, heatLevel, heatmapData } from "../heatmap";

describe("heatmapData", () => {
  it("sums rows that share a pair and leaves missing pairs empty", () => {
    const grid = heatmapData(
      [
        { day: "Mon", hour: 9, n: 2 },
        { day: "Mon", hour: 9, n: 3 },
        { day: "Tue", hour: 10, n: 1n },
        { day: "Tue", hour: 9, n: "x" },
      ],
      "hour",
      "day",
      "n"
    );
    expect(grid.xLabels).toEqual(["9", "10"]);
    expect(grid.yLabels).toEqual(["Mon", "Tue"]);
    expect(grid.cells).toEqual([
      [5, null],
      [null, 1],
    ]);
    expect(grid.min).toBe(1);
    expect(grid.max).toBe(5);
    expect(grid.cut).toBe(false);
  });

  it("keeps the first categories and says it cut the rest", () => {
    const rows = Array.from({ length: HEATMAP_MAX_CATEGORIES + 5 }, (_, i) => ({
      x: `c${i}`,
      y: "r",
      v: i,
    }));
    const grid = heatmapData(rows, "x", "y", "v");
    expect(grid.xLabels).toHaveLength(HEATMAP_MAX_CATEGORIES);
    expect(grid.cut).toBe(true);
    expect(grid.max).toBe(HEATMAP_MAX_CATEGORIES - 1);
  });

  it("handles no rows", () => {
    const grid = heatmapData([], "x", "y", "v");
    expect(grid.cells).toEqual([]);
    expect([grid.min, grid.max]).toEqual([0, 0]);
  });
});

describe("heatLevel", () => {
  it("scales between min and max", () => {
    expect(heatLevel(5, 0, 10)).toBe(0.5);
    expect(heatLevel(3, 3, 3)).toBe(1);
  });
});
