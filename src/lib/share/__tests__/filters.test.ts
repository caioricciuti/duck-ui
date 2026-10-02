import { describe, it, expect } from "vitest";
import { buildFilteredSql, distinctValuesSql, filterConditions } from "../filters";
import type { SharedParam } from "../index";

const params: SharedParam[] = [
  { column: "region", type: "select" },
  { column: "name", type: "search" },
  { column: "amount", type: "range" },
];

describe("buildFilteredSql", () => {
  it("runs the query as shared when no filter is set", () => {
    const sql = "SELECT * FROM t;";
    expect(buildFilteredSql(sql, params, {})).toBe(sql);
    expect(
      buildFilteredSql(sql, params, {
        region: { kind: "select", value: "" },
        name: { kind: "search", value: "  " },
        amount: { kind: "range", min: "", max: "abc" },
      })
    ).toBe(sql);
  });

  it("wraps the query, without its trailing semicolon, and ANDs the conditions", () => {
    const out = buildFilteredSql("WITH c AS (SELECT 1) SELECT * FROM c;  ", params, {
      region: { kind: "select", value: "south" },
      amount: { kind: "range", min: "10", max: "20.5" },
    });
    expect(out).toBe(
      'SELECT * FROM (\nWITH c AS (SELECT 1) SELECT * FROM c\n) AS _embed WHERE CAST("region" AS VARCHAR) = \'south\' AND "amount" >= 10 AND "amount" <= 20.5'
    );
  });

  it("escapes quotes in values and identifiers, and LIKE wildcards in a search", () => {
    const tricky: SharedParam[] = [
      { column: 'we"ird', type: "select" },
      { column: "name", type: "search" },
    ];
    const conditions = filterConditions(tricky, {
      'we"ird': { kind: "select", value: "O'Brien" },
      name: { kind: "search", value: "100%_a'b" },
    });
    expect(conditions).toEqual([
      `CAST("we""ird" AS VARCHAR) = 'O''Brien'`,
      `CAST("name" AS VARCHAR) ILIKE '%100\\%\\_a''b%' ESCAPE '\\'`,
    ]);
  });

  it("ignores a range bound that is not a number", () => {
    expect(
      filterConditions(params, { amount: { kind: "range", min: "1e3", max: "DROP" } })
    ).toEqual(['"amount" >= 1000']);
  });

  it("skips values for columns that are not exposed as filters", () => {
    expect(filterConditions(params, { secret: { kind: "select", value: "x" } })).toEqual([]);
  });
});

describe("distinctValuesSql", () => {
  it("lists the column's non-null values as text, sorted and capped", () => {
    expect(distinctValuesSql("SELECT * FROM t;", "region", 3)).toBe(
      'SELECT DISTINCT CAST("region" AS VARCHAR) AS value FROM (\nSELECT * FROM t\n) AS _embed WHERE "region" IS NOT NULL ORDER BY 1 LIMIT 3'
    );
  });
});
