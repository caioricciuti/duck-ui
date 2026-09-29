import { describe, expect, it } from "vitest";
import { tableFromArrays, tableFromIPC } from "apache-arrow";
import type { CollectedExecution } from "@/services/engine";
import { DEFAULT_PYODIDE_BASE_URL, PYODIDE_VERSION, resolvePyodideBaseUrl } from "../config";
import { packagesForCode } from "../packages";
import {
  appendCapped,
  collectedToPayload,
  pandasDtypeToColumnType,
  queryResultToColumnar,
  splitTableToQueryResult,
  toCellOutput,
  toJsonSafe,
  uniqueColumnNames,
} from "../marshal";

const decoder = new TextDecoder();

const collected = (overrides: Partial<CollectedExecution> = {}): CollectedExecution => ({
  schema: null,
  batches: [],
  rows: [],
  rowCount: 0,
  truncated: false,
  durationMs: 1,
  error: null,
  ...overrides,
});

describe("resolvePyodideBaseUrl", () => {
  const page = "https://duck.example.com/app/index.html";

  it("defaults to the pinned jsDelivr distribution", () => {
    expect(resolvePyodideBaseUrl(undefined, page)).toBe(DEFAULT_PYODIDE_BASE_URL);
    expect(resolvePyodideBaseUrl("  ", page)).toBe(DEFAULT_PYODIDE_BASE_URL);
    expect(DEFAULT_PYODIDE_BASE_URL).toBe(
      `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`
    );
  });

  it("adds the trailing slash an index URL needs", () => {
    expect(resolvePyodideBaseUrl("https://mirror.local/pyodide", page)).toBe(
      "https://mirror.local/pyodide/"
    );
  });

  it("resolves relative paths against the page, for self-hosting", () => {
    expect(resolvePyodideBaseUrl("/pyodide/", page)).toBe("https://duck.example.com/pyodide/");
    expect(resolvePyodideBaseUrl("pyodide", page)).toBe("https://duck.example.com/app/pyodide/");
  });

  it("rejects non-http schemes", () => {
    expect(resolvePyodideBaseUrl("javascript:alert(1)", page)).toBe(DEFAULT_PYODIDE_BASE_URL);
    expect(resolvePyodideBaseUrl("data:text/plain,x", page)).toBe(DEFAULT_PYODIDE_BASE_URL);
  });
});

describe("packagesForCode", () => {
  it("preloads pandas + pyarrow when the cell calls sql()", () => {
    expect(packagesForCode('df = sql("select 1")')).toEqual(["pandas", "pyarrow"]);
    expect(packagesForCode("df = await sql_async('select 1')")).toEqual(["pandas", "pyarrow"]);
    expect(packagesForCode("x = 1\nsql ('select 1')")).toEqual(["pandas", "pyarrow"]);
  });

  it("ignores lookalikes", () => {
    expect(packagesForCode("print(1)")).toEqual([]);
    expect(packagesForCode("mysql('x')")).toEqual([]);
    expect(packagesForCode("conn.sql('x')")).toEqual([]);
    expect(packagesForCode("sql = 3")).toEqual([]);
  });
});

describe("toJsonSafe", () => {
  it("converts values JSON cannot carry", () => {
    expect(toJsonSafe(10n)).toBe(10);
    expect(toJsonSafe(2n ** 64n)).toBe("18446744073709551616");
    expect(toJsonSafe(Number.NaN)).toBeNull();
    expect(toJsonSafe(undefined)).toBeNull();
    expect(toJsonSafe(new Date("2024-01-02T03:04:05Z"))).toBe("2024-01-02T03:04:05.000Z");
    expect(toJsonSafe(new Uint8Array([1, 2]))).toEqual([1, 2]);
    expect(toJsonSafe({ a: 1n, b: [2n] })).toEqual({ a: 1, b: [2] });
  });
});

describe("collectedToPayload", () => {
  const table = tableFromArrays({
    id: Int32Array.from([1, 2, 3]),
    name: ["a", "b", "c"],
  });

  it("sends Arrow IPC when the session produced Arrow", () => {
    const payload = collectedToPayload(
      collected({ batches: table.batches, rowCount: 3, truncated: true }),
      "arrow"
    );
    expect(payload.format).toBe("arrow");
    expect(payload.truncated).toBe(true);
    const decoded = tableFromIPC(payload.bytes);
    expect(decoded.numRows).toBe(3);
    expect(decoded.schema.fields.map((f) => f.name)).toEqual(["id", "name"]);
    expect(decoded.getChild("name")?.toArray()).toEqual(["a", "b", "c"]);
  });

  it("keeps the columns of an empty Arrow result", () => {
    const payload = collectedToPayload(
      collected({ schema: { fields: [], arrow: table.schema } }),
      "arrow"
    );
    expect(payload.format).toBe("arrow");
    const decoded = tableFromIPC(payload.bytes);
    expect(decoded.numRows).toBe(0);
    expect(decoded.schema.fields.map((f) => f.name)).toEqual(["id", "name"]);
  });

  it("falls back to columnar JSON when asked, or for row-only sessions", () => {
    const asJson = collectedToPayload(collected({ batches: table.batches, rowCount: 3 }), "json");
    expect(asJson.format).toBe("json");
    const parsed = JSON.parse(decoder.decode(asJson.bytes));
    expect(parsed.columns).toEqual(["id", "name"]);
    expect(parsed.data).toEqual([
      [1, 2, 3],
      ["a", "b", "c"],
    ]);

    const rowsOnly = collectedToPayload(
      collected({
        schema: {
          fields: [
            { name: "n", type: "BIGINT", nullable: true },
            { name: "s", type: "VARCHAR", nullable: true },
          ],
        },
        rows: [
          { n: 1n, s: "x" },
          { n: 2n, s: null },
        ],
        rowCount: 2,
      }),
      "arrow"
    );
    expect(rowsOnly.format).toBe("json");
    expect(JSON.parse(decoder.decode(rowsOnly.bytes))).toEqual({
      columns: ["n", "s"],
      types: ["BIGINT", "VARCHAR"],
      data: [
        [1, 2],
        ["x", null],
      ],
    });
  });

  it("encodes failures as an error payload", () => {
    const payload = collectedToPayload(
      collected({ error: { message: "Catalog Error: no table t", cancelled: false } }),
      "arrow"
    );
    expect(payload.format).toBe("error");
    expect(decoder.decode(payload.bytes)).toBe("Catalog Error: no table t");
  });
});

describe("queryResultToColumnar", () => {
  it("transposes rows into columns", () => {
    expect(
      queryResultToColumnar({
        columns: ["a", "b"],
        columnTypes: ["INTEGER", "VARCHAR"],
        data: [
          { a: 1, b: "x" },
          { a: 2, b: undefined },
        ],
        rowCount: 2,
      })
    ).toEqual({
      columns: ["a", "b"],
      types: ["INTEGER", "VARCHAR"],
      data: [
        [1, 2],
        ["x", null],
      ],
    });
  });
});

describe("DataFrame → QueryResult", () => {
  it("maps pandas dtypes to engine-style types", () => {
    expect(pandasDtypeToColumnType("int64")).toBe("BIGINT");
    expect(pandasDtypeToColumnType("Int32")).toBe("BIGINT");
    expect(pandasDtypeToColumnType("uint8")).toBe("BIGINT");
    expect(pandasDtypeToColumnType("float64")).toBe("DOUBLE");
    expect(pandasDtypeToColumnType("bool")).toBe("BOOLEAN");
    expect(pandasDtypeToColumnType("datetime64[ns, UTC]")).toBe("TIMESTAMP");
    expect(pandasDtypeToColumnType("object")).toBe("VARCHAR");
    expect(pandasDtypeToColumnType("category")).toBe("VARCHAR");
  });

  it("makes duplicate column names unique", () => {
    expect(uniqueColumnNames(["a", "a", "b", 0, null, "a"])).toEqual([
      "a",
      "a_1",
      "b",
      "0",
      "",
      "a_2",
    ]);
  });

  it("builds rows from split-orient JSON and caps them", () => {
    const result = splitTableToQueryResult(
      {
        json: JSON.stringify({
          columns: ["city", "n", "n"],
          data: [
            ["Oslo", 1, 2],
            ["Rome", null, 4],
            ["Lima", 5, 6],
          ],
        }),
        dtypes: ["object", "float64", "int64"],
        rowCount: 10,
      },
      2
    );
    expect(result.columns).toEqual(["city", "n", "n_1"]);
    expect(result.columnTypes).toEqual(["VARCHAR", "DOUBLE", "BIGINT"]);
    expect(result.data).toEqual([
      { city: "Oslo", n: 1, n_1: 2 },
      { city: "Rome", n: null, n_1: 4 },
    ]);
    expect(result.rowCount).toBe(10);
    expect(result.truncated).toBe(true);
  });
});

describe("appendCapped", () => {
  it("appends until the cap, then marks the cut once", () => {
    expect(appendCapped("ab", "cd", 10)).toBe("abcd");
    const cut = appendCapped("abc", "defgh", 5);
    expect(cut.startsWith("abcde\n")).toBe(true);
    expect(cut).toContain("truncated");
    expect(appendCapped(cut, "more", 5)).toBe(cut);
  });
});

describe("toCellOutput", () => {
  const options = { rowCap: 100, figureCap: 2, durationMs: 42 };
  const streams = { stdout: "hi\n", stderr: "" };

  it("keeps the repr of a plain value", () => {
    expect(
      toCellOutput({ text: "42", table: null, images: [], error: null }, streams, options)
    ).toEqual({ stdout: "hi\n", stderr: "", text: "42", durationMs: 42 });
  });

  it("prefers the table over text and caps figures", () => {
    const output = toCellOutput(
      {
        text: null,
        table: { json: '{"columns":["a"],"data":[[1]]}', dtypes: ["int64"], rowCount: 1 },
        images: ["AAA", "BBB", "CCC", ""],
      },
      streams,
      options
    );
    expect(output.table?.data).toEqual([{ a: 1 }]);
    expect(output.text).toBeUndefined();
    expect(output.images).toEqual(["AAA", "BBB"]);
  });

  it("reports errors and survives a malformed table", () => {
    const output = toCellOutput(
      {
        error: "ZeroDivisionError: division by zero",
        table: { json: "{", dtypes: [], rowCount: 0 },
      },
      streams,
      options
    );
    expect(output.error).toContain("ZeroDivisionError");
    expect(output.error).toContain("Could not render DataFrame");
  });
});
