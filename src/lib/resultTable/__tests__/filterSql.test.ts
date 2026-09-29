import { describe, it, expect } from "vitest";
import { buildFilteredQuery, isWrappableQuery } from "../filterSql";
import type { ColumnMeta } from "@/lib/types/query";

const meta: ColumnMeta[] = [
  { name: "id", type: "BIGINT" },
  { name: "name", type: "VARCHAR" },
  { name: "active", type: "BOOLEAN" },
  { name: "odd name", type: "VARCHAR" },
];

describe("isWrappableQuery", () => {
  it("accepts a single read statement", () => {
    for (const sql of [
      "select 1",
      "  WITH t AS (select 1) select * from t;",
      "FROM orders",
      "values (1), (2)",
      "-- leading comment\nselect 1",
    ]) {
      expect(isWrappableQuery(sql), sql).toBe(true);
    }
  });

  it("refuses anything that is not one read statement", () => {
    for (const sql of [
      "select 1; select 2",
      "create table t as select 1",
      "PRAGMA database_list",
      "describe orders",
      "",
    ]) {
      expect(isWrappableQuery(sql), sql).toBe(false);
    }
  });

  it("is not fooled by a semicolon inside a string", () => {
    expect(isWrappableQuery("select 'a;b'")).toBe(true);
  });
});

describe("buildFilteredQuery", () => {
  it("wraps the query and drops its trailing semicolon", () => {
    expect(buildFilteredQuery("select * from t;", meta, [], null)).toBe(
      "SELECT * FROM (\nselect * from t\n) AS __duck_ui_result"
    );
  });

  it("sorts with nulls last in both directions", () => {
    expect(buildFilteredQuery("select 1", meta, [], { column: "id", dir: "desc" })).toContain(
      'ORDER BY "id" DESC NULLS LAST'
    );
  });

  it("compares numbers as numbers", () => {
    const sql = buildFilteredQuery(
      "select 1",
      meta,
      [{ column: "id", operator: "gte", value: "10" }],
      null
    );
    expect(sql).toContain('WHERE "id" >= 10');
  });

  it("never puts a non-numeric value into the statement unquoted", () => {
    const sql = buildFilteredQuery(
      "select 1",
      meta,
      [{ column: "id", operator: "eq", value: "1 OR 1=1" }],
      null
    );
    expect(sql).toContain(`CAST("id" AS VARCHAR) = '1 OR 1=1'`);
  });

  it("escapes quotes in values and identifiers", () => {
    const sql = buildFilteredQuery(
      "select 1",
      [{ name: 'we"ird', type: "VARCHAR" }],
      [{ column: 'we"ird', operator: "contains", value: "it's" }],
      null
    );
    expect(sql).toContain(`contains(lower(CAST("we""ird" AS VARCHAR)), lower('it''s'))`);
  });

  it("lets a NULL pass a does-not-contain filter", () => {
    const sql = buildFilteredQuery(
      "select 1",
      meta,
      [{ column: "name", operator: "notContains", value: "x" }],
      null
    );
    expect(sql).toContain('("name" IS NULL OR NOT contains(');
  });

  it("turns a boolean filter into a boolean literal", () => {
    const sql = buildFilteredQuery(
      "select 1",
      meta,
      [{ column: "active", operator: "eq", value: "TRUE" }],
      null
    );
    expect(sql).toContain('"active" = true');
  });

  it("combines filters with AND", () => {
    const sql = buildFilteredQuery(
      "select 1",
      meta,
      [
        { column: "id", operator: "gt", value: "1" },
        { column: "odd name", operator: "isNotNull", value: "" },
      ],
      null
    );
    expect(sql).toContain('WHERE "id" > 1\n  AND "odd name" IS NOT NULL');
  });
});
