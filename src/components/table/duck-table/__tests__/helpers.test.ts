import { describe, expect, it } from "vitest";
import type { Row } from "@tanstack/react-table";
import { formatTimestampUTC } from "@/lib/datetime";
import { DEFAULT_COLUMN_WIDTH, DEFAULT_MAX_AUTO_WIDTH, DEFAULT_MIN_AUTO_WIDTH } from "../constants";
import {
  buildCsvContent,
  buildSqlValuesClause,
  stringifyRowsAsJson,
  toXlsxRows,
} from "../exportHelpers";
import type { DataRow } from "../types";
import { calculateOptimalWidth, globalFilterFn, safeStringify } from "../utils";

describe("safeStringify", () => {
  it("handles nullish, bigint and primitives", () => {
    expect(safeStringify(null)).toBe("null");
    expect(safeStringify(undefined)).toBe("null");
    expect(safeStringify(12n)).toBe("12");
    expect(safeStringify(1.5)).toBe("1.5");
    expect(safeStringify("x")).toBe("x");
  });

  it("formats dates as UTC timestamps", () => {
    const d = new Date(Date.UTC(2024, 0, 2, 3, 4, 5));
    expect(safeStringify(d)).toBe(formatTimestampUTC(d));
  });

  it("serializes objects, including nested bigints", () => {
    expect(safeStringify({ a: 1n, b: [1, "x"] })).toBe('{"a":"1","b":[1,"x"]}');
  });

  it("falls back to String() for unserializable objects", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(safeStringify(cyclic)).toBe("[object Object]");
  });
});

describe("calculateOptimalWidth", () => {
  it("uses the default width for empty data", () => {
    expect(calculateOptimalWidth([], "col")).toBe(DEFAULT_COLUMN_WIDTH);
  });

  it("estimates 8px per character plus padding, clamped", () => {
    expect(calculateOptimalWidth([{ col: "a".repeat(10) }], "col")).toBe(10 * 8 + 20);
    expect(calculateOptimalWidth([{ c: 1 }], "c")).toBe(DEFAULT_MIN_AUTO_WIDTH);
    expect(calculateOptimalWidth([{ c: "a".repeat(500) }], "c")).toBe(DEFAULT_MAX_AUTO_WIDTH);
  });

  it("counts the header length and only samples the first rows", () => {
    const header = "h".repeat(15);
    expect(calculateOptimalWidth([{ [header]: 1 }], header)).toBe(15 * 8 + 20);
    const data = [{ c: "ab" }, { c: "a".repeat(20) }];
    expect(calculateOptimalWidth(data, "c", 0, 1000, 1)).toBe(2 * 8 + 20);
  });
});

describe("globalFilterFn", () => {
  const rowWith = (value: unknown) => ({ getValue: () => value }) as unknown as Row<DataRow>;
  const noop = () => {};

  it("matches case-insensitive substrings", () => {
    expect(globalFilterFn(rowWith("Hello World"), "c", "world", noop)).toBe(true);
    expect(globalFilterFn(rowWith(12345), "c", "234", noop)).toBe(true);
    expect(globalFilterFn(rowWith("abc"), "c", "z", noop)).toBe(false);
  });

  it("never matches null or undefined cells", () => {
    expect(globalFilterFn(rowWith(null), "c", "", noop)).toBe(false);
    expect(globalFilterFn(rowWith(undefined), "c", "", noop)).toBe(false);
  });
});

describe("buildCsvContent", () => {
  it("writes a header line and quotes values that need it", () => {
    const rows: DataRow[] = [
      { a: "plain", b: "x,y", c: null },
      { a: 1, b: 2n, c: { k: 'q"v' } },
    ];
    expect(buildCsvContent(["a", "b", "c"], rows)).toBe(
      ["a,b,c", 'plain,"x,y",', '1,"2","{""k"":""q\\""v""}"'].join("\n")
    );
  });

  it("only includes the requested headers", () => {
    expect(buildCsvContent(["b"], [{ a: 1, b: 2 }])).toBe("b\n2");
  });
});

describe("stringifyRowsAsJson", () => {
  it("pretty-prints with bigints as strings", () => {
    expect(stringifyRowsAsJson([{ a: 1n }])).toBe('[\n  {\n    "a": "1"\n  }\n]');
  });
});

describe("buildSqlValuesClause", () => {
  it("returns an empty string for no rows", () => {
    expect(buildSqlValuesClause([])).toBe("");
  });

  it("renders SQL literals for each type", () => {
    const d = new Date(Date.UTC(2024, 0, 2, 3, 4, 5));
    const rows: DataRow[] = [
      { s: "it's", n: 1.5, b: 9n, d, o: { k: "v'" }, z: null, t: true },
      { s: "x", n: 2, b: 1n, d, o: [1], z: undefined, t: false },
    ];
    expect(buildSqlValuesClause(rows)).toBe(
      `('it''s', 1.5, 9, TIMESTAMP '${formatTimestampUTC(d)}', '{"k":"v''"}', NULL, true), ` +
        `('x', 2, 1, TIMESTAMP '${formatTimestampUTC(d)}', '[1]', NULL, false)`
    );
  });
});

describe("toXlsxRows", () => {
  it("converts bigints to strings and leaves other values alone", () => {
    const d = new Date(0);
    expect(toXlsxRows([{ a: 1n, b: "x", c: d, e: null }])).toEqual([
      { a: "1", b: "x", c: d, e: null },
    ]);
  });
});
