import { describe, it, expect } from "vitest";
import {
  computeColumnStats,
  sampleRows,
  DISTINCT_LIMIT,
  HISTOGRAM_BINS,
  TOP_VALUES,
} from "./stats";

const column = (type: string, values: unknown[]) =>
  computeColumnStats(
    [{ name: "c", type }],
    values.map((value) => [value])
  )[0];

const total = (bins: number[] | undefined) => (bins ?? []).reduce((sum, n) => sum + n, 0);

describe("computeColumnStats: numbers", () => {
  it("spreads the values over equal-width bins, the largest in the last one", () => {
    const stats = column(
      "INTEGER",
      Array.from({ length: 120 }, (_, i) => i)
    );

    expect(stats.bins).toHaveLength(HISTOGRAM_BINS);
    expect(stats.bins).toEqual(new Array(HISTOGRAM_BINS).fill(10));
    expect(stats.min).toBe(0);
    expect(stats.max).toBe(119);
  });

  it("leaves nulls out of the bins and counts them", () => {
    const stats = column("DOUBLE", [1, null, 2, undefined, 3, ""]);

    expect(stats.nulls).toBe(3);
    expect(stats.nullPct).toBe(50);
    expect(total(stats.bins)).toBe(3);
  });

  it("reads bigint and decimal text as numbers", () => {
    const stats = column("BIGINT", [10n, "20.5", 30]);

    expect(stats.min).toBe(10);
    expect(stats.max).toBe(30);
    expect(total(stats.bins)).toBe(3);
  });

  it("has no histogram for a constant column, where there is no range to cut", () => {
    const stats = column("INTEGER", [7, 7, 7]);

    expect(stats.bins).toBeUndefined();
    expect(stats.min).toBe(7);
    expect(stats.max).toBe(7);
  });

  it("has no histogram and no numbers for a column of nulls", () => {
    const stats = column("INTEGER", [null, null]);

    expect(stats.bins).toBeUndefined();
    expect(stats.min).toBeUndefined();
    expect(stats.nulls).toBe(2);
  });

  it("has no histogram when a value is infinite", () => {
    expect(column("DOUBLE", [1, 2, Infinity]).bins).toBeUndefined();
  });
});

describe("computeColumnStats: dates", () => {
  it("bins Date objects and ISO text over time", () => {
    const stats = column("TIMESTAMP", [
      new Date("2024-01-01T00:00:00Z"),
      new Date("2024-01-02T00:00:00Z"),
      "2024-12-31",
    ]);

    expect(stats.bins).toHaveLength(HISTOGRAM_BINS);
    expect(stats.bins?.[0]).toBe(2);
    expect(stats.bins?.[HISTOGRAM_BINS - 1]).toBe(1);
  });

  it("keeps earliest and latest but draws nothing for values that are not points in time", () => {
    const stats = column("TIME", ["08:00:00", "17:30:00"]);

    expect(stats.bins).toBeUndefined();
    expect(stats.earliest).toBe("08:00:00");
    expect(stats.latest).toBe("17:30:00");
  });
});

describe("computeColumnStats: text", () => {
  it("lists every value with its count when there are only a few", () => {
    const stats = column("VARCHAR", ["north", "south", "south", null, "east", "south", "east"]);

    expect(stats.distinct).toBe(3);
    expect(stats.distinctCapped).toBeUndefined();
    expect(stats.top).toEqual([
      { value: "south", count: 3 },
      { value: "east", count: 2 },
      { value: "north", count: 1 },
    ]);
  });

  it("does not list values once there are more than fit in a header", () => {
    const stats = column(
      "VARCHAR",
      Array.from({ length: TOP_VALUES + 1 }, (_, i) => `v${i}`)
    );

    expect(stats.distinct).toBe(TOP_VALUES + 1);
    expect(stats.top).toBeUndefined();
  });

  it("counts distinct values over every row, not over a prefix", () => {
    const rows = [...Array.from({ length: 20_000 }, () => "same"), "late arrival"];
    expect(column("VARCHAR", rows).distinct).toBe(2);
  });

  it("stops counting distinct values at the limit and says so", () => {
    const stats = column(
      "VARCHAR",
      Array.from({ length: DISTINCT_LIMIT + 5 }, (_, i) => `id-${i}`)
    );

    expect(stats.distinct).toBe(DISTINCT_LIMIT);
    expect(stats.distinctCapped).toBe(true);
  });
});

describe("computeColumnStats: booleans", () => {
  it("counts true, false and null apart", () => {
    const stats = column("BOOLEAN", [true, false, true, null, true]);

    expect(stats.trueCount).toBe(3);
    expect(stats.falseCount).toBe(1);
    expect(stats.nulls).toBe(1);
  });
});

describe("sampleRows", () => {
  it("returns the rows themselves when there are no more than the limit", () => {
    const rows = [1, 2, 3];
    expect(sampleRows(rows, 3)).toBe(rows);
  });

  it("takes evenly spaced rows across the whole set", () => {
    const rows = Array.from({ length: 1000 }, (_, i) => i);
    const sample = sampleRows(rows, 10);

    expect(sample).toEqual([0, 100, 200, 300, 400, 500, 600, 700, 800, 900]);
  });
});
