import { describe, it, expect } from "vitest";
import { groupByColumn, reconcileChartConfig, transformData } from "@/lib/chartDataTransform";
import type { ChartConfig, QueryResult } from "@/store";

const result = (data: Record<string, unknown>[]): QueryResult => ({
  columns: Object.keys(data[0] ?? {}),
  columnTypes: [],
  data,
  rowCount: data.length,
});

const sales = result([
  { region: "north", revenue: 10, cost: 4 },
  { region: "south", revenue: 5, cost: 1 },
  { region: "north", revenue: 30, cost: 6 },
  { region: "south", revenue: 15, cost: 3 },
]);

describe("transformData aggregation", () => {
  it("aggregates when grouping by the x axis, as the chart settings do", () => {
    const rows = transformData(
      sales,
      { groupBy: "region", aggregation: "sum" },
      "region",
      "revenue"
    );
    expect(rows).toEqual([
      { region: "north", revenue: 40 },
      { region: "south", revenue: 20 },
    ]);
  });

  it("keeps every series of a multi series chart", () => {
    const rows = transformData(sales, { groupBy: "region", aggregation: "avg" }, "region", [
      { column: "revenue" },
      { column: "cost" },
    ]);
    expect(rows).toEqual([
      { region: "north", revenue: 20, cost: 5 },
      { region: "south", revenue: 10, cost: 2 },
    ]);
  });

  it("lets a series override the aggregation", () => {
    const rows = transformData(sales, { groupBy: "region", aggregation: "sum" }, "region", [
      { column: "revenue" },
      { column: "cost", aggregation: "max" },
    ]);
    expect(rows).toEqual([
      { region: "north", revenue: 40, cost: 6 },
      { region: "south", revenue: 20, cost: 3 },
    ]);
  });

  it("leaves the rows alone without a group", () => {
    expect(transformData(sales, { aggregation: "sum" }, "region", "revenue")).toEqual(sales.data);
    expect(transformData(sales, undefined, "region", "revenue")).toEqual(sales.data);
  });

  it("sorts and limits the aggregated rows", () => {
    const rows = transformData(
      sales,
      { groupBy: "region", aggregation: "sum", sortBy: "revenue", sortOrder: "asc", limit: 1 },
      "region",
      "revenue"
    );
    expect(rows).toEqual([{ region: "south", revenue: 20 }]);
  });
});

describe("groupByColumn", () => {
  it("still accepts a single value column", () => {
    expect(groupByColumn(sales.data, "region", "revenue", "count")).toEqual([
      { region: "north", revenue: 2 },
      { region: "south", revenue: 2 },
    ]);
  });

  it("groups equal dates together", () => {
    const rows = groupByColumn(
      [
        { day: new Date("2024-01-01"), n: 1 },
        { day: new Date("2024-01-01"), n: 2 },
        { day: new Date("2024-01-02"), n: 4 },
      ],
      "day",
      ["n"],
      "sum"
    );
    expect(rows).toEqual([
      { day: new Date("2024-01-01"), n: 3 },
      { day: new Date("2024-01-02"), n: 4 },
    ]);
  });

  it("skips rows without a group value and never aggregates the key", () => {
    const rows = groupByColumn(
      [
        { k: "a", v: 1 },
        { k: null, v: 5 },
        { k: "a", v: 2 },
      ],
      "k",
      ["k", "v"],
      "sum"
    );
    expect(rows).toEqual([{ k: "a", v: 3 }]);
  });
});

describe("reconcileChartConfig", () => {
  const grouped: ChartConfig = {
    type: "bar",
    xAxis: "region",
    series: [{ column: "revenue" }, { column: "cost" }],
    transform: { groupBy: "region", aggregation: "sum", sortBy: "cost", sortOrder: "desc" },
  };

  it("leaves an ungrouped config alone", () => {
    const config: ChartConfig = {
      type: "bar",
      xAxis: "region",
      yAxis: "year",
      transform: { sortBy: "year" },
    };
    expect(reconcileChartConfig(config)).toBe(config);
  });

  it("moves the group column with the x axis", () => {
    const next = reconcileChartConfig({ ...grouped, xAxis: "year" });
    expect(next.transform?.groupBy).toBe("year");
  });

  it("drops a sort on a column that grouping removes", () => {
    const next = reconcileChartConfig({ ...grouped, series: [{ column: "revenue" }] });
    expect(next.transform?.sortBy).toBeUndefined();
    expect(next.transform?.sortOrder).toBeUndefined();
    expect(next.transform?.aggregation).toBe("sum");
  });

  it("keeps a sort on the x axis or on a value column", () => {
    expect(reconcileChartConfig(grouped).transform?.sortBy).toBe("cost");
    const byX = reconcileChartConfig({
      ...grouped,
      transform: { ...grouped.transform, sortBy: "region" },
    });
    expect(byX.transform?.sortBy).toBe("region");
  });

  it("removes the x column from the value columns", () => {
    const next = reconcileChartConfig({ ...grouped, xAxis: "cost" });
    expect(next.series).toEqual([{ column: "revenue" }]);
    expect(next.transform?.groupBy).toBe("cost");
    // The sort column is now the x axis, which grouped rows still hold.
    expect(next.transform?.sortBy).toBe("cost");

    const single = reconcileChartConfig({
      type: "bar",
      xAxis: "year",
      yAxis: "year",
      transform: { groupBy: "year", aggregation: "count" },
    });
    expect(single.yAxis).toBeUndefined();
    expect(single.series).toBeUndefined();
  });
});
