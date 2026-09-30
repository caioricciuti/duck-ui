import { describe, it, expect } from "vitest";
import { locateError } from "../sqlError";

const message = (line: number, excerpt: string, column: number, head = "Parser Error: boom") => {
  const prefix = `LINE ${line}: `;
  return `${head}\n\n${prefix}${excerpt}\n${" ".repeat(prefix.length + column)}^`;
};

describe("locateError", () => {
  it("underlines the token at the caret", () => {
    const sql = "select * FORM t";
    const at = locateError(message(1, sql, 9), sql);
    expect(at && sql.slice(at.from, at.to)).toBe("FORM");
  });

  it("counts earlier lines into the offset", () => {
    const sql = "select a,\n  b,\n  nope\nfrom t";
    const at = locateError(message(3, "  nope", 2, "Binder Error: no column"), sql);
    expect(at && sql.slice(at.from, at.to)).toBe("nope");
  });

  it("places a shortened excerpt inside the real line", () => {
    const sql = `select ${"x, ".repeat(40)}oops from t`;
    const excerpt = "...x, x, oops from t";
    const at = locateError(message(1, excerpt, excerpt.indexOf("oops")), sql);
    expect(at && sql.slice(at.from, at.to)).toBe("oops");
  });

  it("underlines a whole quoted identifier", () => {
    const sql = 'select "my col" from t';
    const at = locateError(message(1, sql, 7), sql);
    expect(at && sql.slice(at.from, at.to)).toBe('"my col"');
  });

  it("marks one character at the end of the line", () => {
    const sql = "select (1";
    const at = locateError(message(1, sql, sql.length - 1), sql);
    expect(at).toEqual({ from: sql.length - 1, to: sql.length });
  });

  it("returns null when the message has no position", () => {
    expect(locateError("IO Error: file not found", "select 1")).toBeNull();
  });

  it("returns null when the excerpt is not the line that ran", () => {
    // Parameters were substituted, so the text DuckDB saw differs.
    expect(
      locateError(message(1, "select * from t where a = 42", 7), "select * from t where a = $x")
    ).toBeNull();
  });

  it("returns null when a shortened excerpt matches twice", () => {
    const sql = "select ab, ab from t";
    expect(locateError(message(1, "...ab...", 3), sql)).toBeNull();
  });

  it("returns null for a line beyond the document", () => {
    expect(locateError(message(5, "select 1", 0), "select 1")).toBeNull();
  });
});
