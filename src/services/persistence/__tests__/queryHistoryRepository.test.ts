import { describe, it, expect } from "vitest";
import { filterHistory, type HistoryEntry } from "../repositories/queryHistoryRepository";

const entry = (id: string, sql: string, at: string, error: string | null = null): HistoryEntry => ({
  id,
  profile_id: "p1",
  connection_id: null,
  sql_text: sql,
  error,
  duration_ms: null,
  row_count: null,
  executed_at: at,
});

const entries = [
  entry("a", "SELECT * FROM orders", "2026-09-01T10:00:00Z"),
  entry("b", "select * from users", "2026-09-03T10:00:00Z"),
  entry("c", "SELECT * FORM orders", "2026-09-02T10:00:00Z", 'syntax error at or near "FORM"'),
];

const ids = (list: HistoryEntry[]) => list.map((e) => e.id);

describe("filterHistory", () => {
  it("returns everything newest first by default", () => {
    expect(ids(filterHistory(entries, {}))).toEqual(["b", "c", "a"]);
  });

  it("matches the SQL without regard to case", () => {
    expect(ids(filterHistory(entries, { text: "ORDERS" }))).toEqual(["c", "a"]);
  });

  it("matches the error text too", () => {
    expect(ids(filterHistory(entries, { text: "syntax" }))).toEqual(["c"]);
  });

  it("keeps only failed or only succeeded runs", () => {
    expect(ids(filterHistory(entries, { status: "failed" }))).toEqual(["c"]);
    expect(ids(filterHistory(entries, { status: "succeeded" }))).toEqual(["b", "a"]);
  });

  it("combines text and status", () => {
    expect(ids(filterHistory(entries, { text: "orders", status: "succeeded" }))).toEqual(["a"]);
  });

  it("ignores surrounding whitespace in the search", () => {
    expect(ids(filterHistory(entries, { text: "  users " }))).toEqual(["b"]);
  });
});
