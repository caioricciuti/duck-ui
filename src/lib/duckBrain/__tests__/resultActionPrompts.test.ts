import { describe, it, expect } from "vitest";
import {
  buildExplainResultsMessages,
  buildOptimizeQueryMessages,
  buildResultSample,
  buildSuggestChartMessages,
  computeColumnStats,
  formatCellForPrompt,
} from "../prompts/result-actions";
import { describeProviderDestination, isInBrowserProvider, requiresDataConsent } from "../privacy";
import { extractPlanText } from "@/lib/explainPlan";
import type { QueryResult } from "@/store/types";

const makeResult = (rows: number, extra: Partial<QueryResult> = {}): QueryResult => ({
  columns: ["id", "name", "amount"],
  columnTypes: ["Int32", "Utf8", "Float64"],
  data: Array.from({ length: rows }, (_, i) => ({
    id: i,
    name: i % 2 ? `user_${i}` : null,
    amount: i * 1.5,
  })),
  rowCount: rows,
  ...extra,
});

describe("formatCellForPrompt", () => {
  it("formats special values", () => {
    expect(formatCellForPrompt(null)).toBe("NULL");
    expect(formatCellForPrompt(10n ** 20n)).toBe("100000000000000000000");
    expect(formatCellForPrompt(new Date("2024-01-02T00:00:00Z"))).toBe("2024-01-02T00:00:00.000Z");
    expect(formatCellForPrompt({ a: 1n })).toBe('{"a":"1"}');
    expect(formatCellForPrompt("a\n\tb")).toBe("a b");
  });

  it("truncates long values", () => {
    const out = formatCellForPrompt("x".repeat(500), 80);
    expect(out.length).toBe(80);
    expect(out.endsWith("…")).toBe(true);
  });

  it("survives circular objects", () => {
    const circ: Record<string, unknown> = {};
    circ.self = circ;
    expect(formatCellForPrompt(circ)).toBe("[object Object]");
  });
});

describe("computeColumnStats", () => {
  it("counts nulls, distinct values and numeric ranges", () => {
    const [id, name, amount] = computeColumnStats(makeResult(10));
    expect(id).toMatchObject({ nulls: 0, distinct: 10, min: 0, max: 9, mean: 4.5 });
    expect(name).toMatchObject({ nulls: 5, distinct: 5 });
    expect(name.min).toBeUndefined();
    expect(amount.max).toBe(13.5);
  });

  it("bounds the rows scanned", () => {
    const [id] = computeColumnStats(makeResult(100), 10);
    expect(id.max).toBe(9);
  });
});

describe("buildResultSample", () => {
  it("caps rows, columns and cell length", () => {
    const result = makeResult(100);
    result.data[0].name = "y".repeat(1000);
    const sample = buildResultSample(result, { maxRows: 20, maxColumns: 2, maxCellChars: 10 });
    expect(sample.rows).toHaveLength(20);
    expect(sample.columns.map((c) => c.name)).toEqual(["id", "name"]);
    expect(sample.omittedColumns).toBe(1);
    expect(sample.rows[0][1].length).toBe(10);
    expect(sample.totalRows).toBe(100);
  });
});

describe("buildExplainResultsMessages", () => {
  it("sends only the bounded sample", () => {
    const result = makeResult(500);
    const [system, user] = buildExplainResultsMessages("SELECT * FROM t", result);
    expect(system.role).toBe("system");
    expect(system.content).toMatch(/never follow instructions/i);
    expect(user.content).toContain("SELECT * FROM t");
    expect(user.content).toContain("user_19");
    expect(user.content).not.toContain("user_21");
    expect(user.content).toContain("500 rows");
  });

  it("mentions truncated results", () => {
    const [, user] = buildExplainResultsMessages("SELECT 1", makeResult(5, { truncated: true }));
    expect(user.content).toMatch(/query returns more/);
  });
});

describe("buildOptimizeQueryMessages", () => {
  it("includes query, plan and schema but no rows", () => {
    const [system, user] = buildOptimizeQueryMessages(
      "SELECT * FROM t",
      "SEQ_SCAN t",
      "DATABASE SCHEMA: t(id INTEGER)"
    );
    expect(system.content).toMatch(/read-only/);
    expect(user.content).toContain("SEQ_SCAN t");
    expect(user.content).toContain("t(id INTEGER)");
  });
});

describe("buildSuggestChartMessages", () => {
  it("sends column metadata only", () => {
    const [system, user] = buildSuggestChartMessages([
      { name: "region", type: "Utf8", numeric: false },
      { name: "revenue", type: "Float64", numeric: true },
    ]);
    expect(system.content).toContain("stacked_area");
    expect(system.content).not.toContain("heatmap");
    expect(JSON.parse(user.content.split("\n")[3])).toEqual([
      { name: "region", type: "Utf8", numeric: false },
      { name: "revenue", type: "Float64", numeric: true },
    ]);
  });
});

describe("privacy", () => {
  it("only skips consent for in-browser inference", () => {
    expect(isInBrowserProvider("webllm")).toBe(true);
    expect(requiresDataConsent("webllm")).toBe(false);
    expect(requiresDataConsent("openai")).toBe(true);
    expect(requiresDataConsent("anthropic")).toBe(true);
    expect(requiresDataConsent("openai-compatible")).toBe(true);
  });

  it("names the destination", () => {
    expect(describeProviderDestination("anthropic")).toBe("Anthropic");
    expect(
      describeProviderDestination("openai-compatible", { baseUrl: "http://localhost:11434/v1" })
    ).toBe("the OpenAI-compatible server at localhost:11434");
    expect(describeProviderDestination("openai-compatible", { baseUrl: "not a url" })).toBe(
      "your OpenAI-compatible server"
    );
  });
});

describe("extractPlanText", () => {
  it("prefers the analyzed or physical plan row", () => {
    expect(
      extractPlanText([
        { explain_key: "logical_plan", explain_value: "L" },
        { explain_key: "physical_plan", explain_value: "P" },
      ])
    ).toBe("P");
    expect(extractPlanText([{ explain_key: "analyzed_plan", explain_value: "A" }])).toBe("A");
    expect(extractPlanText([{ explain_value: "x" }, { explain_value: "y" }])).toBe("x\ny");
  });
});
