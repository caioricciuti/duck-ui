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

// Verbatim from the DuckDB 2.0.0 CLI (d54cbbe3df, the commit the 2.0
// duckdb-wasm build ships), so a change in the engine's format shows up here.
describe("locateError with DuckDB 2.0 messages", () => {
  it("reads a single caret", () => {
    const sql = "select * FORM t";
    const msg = [
      'Parser Error: syntax error at or near "t"',
      "",
      "LINE 1: select * FORM t",
      "                      ^",
    ].join("\n");
    const at = locateError(msg, sql);
    expect(at && sql.slice(at.from, at.to)).toBe("t");
  });

  it("underlines the span of a caret run on a later line", () => {
    const sql = "SELECT 1,\n  2 FROM range(3) WHERE\n  range ==== 3;";
    const msg = [
      "Catalog Error: Scalar Function with name ==== does not exist!",
      'Did you mean "="?',
      "",
      "LINE 3:   range ==== 3;",
      "          ^^^^^^^^^^^^",
    ].join("\n");
    const at = locateError(msg, sql);
    expect(at && sql.slice(at.from, at.to)).toBe("range ==== 3");
  });

  it("places a caret run inside a shortened excerpt", () => {
    const sql = `SELECT ${"a".repeat(84)}, ${"b".repeat(37)} FROM range(1) WHERE zzz`;
    const msg = [
      'Binder Error: Referenced column "zzz" not found in FROM clause!',
      'Candidate bindings: "range"',
      "",
      `LINE 1: ..., ${"b".repeat(37)} FROM range(1) WHERE zzz`,
      `${" ".repeat(71)}^^^`,
    ].join("\n");
    const at = locateError(msg, sql);
    expect(at && sql.slice(at.from, at.to)).toBe("zzz");
  });

  it("finds the caret under a message with blank lines in it", () => {
    const sql = "SELECT 1 FROM range(3) WHERE range = 'x' + 1";
    const msg = [
      'Binder Error: Could not choose a best candidate function for the function call "+(STRING_LITERAL, INTEGER_LITERAL)". In order to select one, please add explicit type casts.',
      "\tCandidate functions:",
      '\t"+"("left" DATE, "right" INTEGER, /) -> DATE',
      "",
      "",
      "LINE 1: SELECT 1 FROM range(3) WHERE range = 'x' + 1",
      "                                                 ^",
    ].join("\n");
    const at = locateError(msg, sql);
    expect(at && sql.slice(at.from, at.to)).toBe("+");
  });
});
