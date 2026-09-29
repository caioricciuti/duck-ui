import { describe, it, expect } from "vitest";
import {
  findPlaceholders,
  listParameterNames,
  looksNumeric,
  missingParamsMessage,
  resolveQueryParams,
  toParamLiteral,
} from "../sqlParams";

describe("findPlaceholders", () => {
  it("finds $name and ${name} with offsets", () => {
    const sql = "SELECT * FROM t WHERE a = $min AND b = ${max}";
    expect(findPlaceholders(sql)).toEqual([
      { name: "min", start: 26, end: 30 },
      { name: "max", start: 39, end: 45 },
    ]);
  });

  it("lists distinct names in first-appearance order", () => {
    expect(listParameterNames("select $b, $a, ${b}, $a_2")).toEqual(["b", "a", "a_2"]);
  });

  it("ignores string literals, including doubled quotes", () => {
    expect(listParameterNames("select '$x', 'it''s $y', $z")).toEqual(["z"]);
  });

  it("ignores E-strings with backslash-escaped quotes", () => {
    expect(listParameterNames("select E'a\\'$x', $y")).toEqual(["y"]);
  });

  it("ignores quoted identifiers", () => {
    expect(listParameterNames('select "$col", "we""ird $x" from t where v = $v')).toEqual(["v"]);
  });

  it("ignores line and (nested) block comments", () => {
    const sql = `-- $a\nselect /* $b /* $c */ $d */ $e -- $f\n, $g`;
    expect(listParameterNames(sql)).toEqual(["e", "g"]);
  });

  it("leaves positional $1-style parameters alone", () => {
    expect(listParameterNames("select $1, $2 + $name")).toEqual(["name"]);
  });

  it("leaves $$ and $tag$ dollar-quoted bodies alone", () => {
    expect(listParameterNames("select $$ $inside $$, $out")).toEqual(["out"]);
    expect(listParameterNames("select $fn$ $inside $fn$, $out")).toEqual(["out"]);
    expect(listParameterNames("select $$ unterminated $x")).toEqual([]);
  });

  it("treats $tag$ without a closing tag as a placeholder", () => {
    expect(listParameterNames("select $a$")).toEqual(["a"]);
  });

  it("ignores $ inside identifiers and malformed braces", () => {
    expect(listParameterNames("select a$b, ${1x}, ${inputs.x}, ${}")).toEqual([]);
  });

  it("returns nothing for plain SQL", () => {
    expect(findPlaceholders("SELECT 1")).toEqual([]);
    expect(findPlaceholders("")).toEqual([]);
  });
});

describe("literal rendering", () => {
  it("infers numbers, but not ones with leading zeros", () => {
    expect(looksNumeric("42")).toBe(true);
    expect(looksNumeric(" 3.14 ")).toBe(true);
    expect(looksNumeric("1e3")).toBe(true);
    expect(looksNumeric("-7")).toBe(true);
    expect(looksNumeric("0.5")).toBe(true);
    expect(looksNumeric("0")).toBe(true);
    expect(looksNumeric("007")).toBe(false);
    expect(looksNumeric("12abc")).toBe(false);
    expect(looksNumeric("")).toBe(false);
    expect(looksNumeric("Infinity")).toBe(false);
  });

  it("inlines numbers and parenthesises negatives", () => {
    expect(toParamLiteral("42")).toBe("42");
    expect(toParamLiteral("+5")).toBe("5");
    expect(toParamLiteral("-5")).toBe("(-5)");
  });

  it("quotes strings with doubled single quotes", () => {
    expect(toParamLiteral("O'Brien")).toBe("'O''Brien'");
    expect(toParamLiteral("'; DROP TABLE t; --")).toBe("'''; DROP TABLE t; --'");
  });

  it("keeps numeric-looking values as text when forced", () => {
    expect(toParamLiteral("42", true)).toBe("'42'");
  });
});

describe("resolveQueryParams", () => {
  it("substitutes every occurrence", () => {
    const result = resolveQueryParams("select * from t where a > $n and b = ${who} or c = $n", {
      values: { n: "10", who: "it's" },
    });
    expect(result).toEqual({
      sql: "select * from t where a > 10 and b = 'it''s' or c = 10",
      missing: [],
    });
  });

  it("does not touch placeholders inside literals or comments", () => {
    const result = resolveQueryParams("select '$n' -- $n\n, $n", { values: { n: "1" } });
    expect(result.sql).toBe("select '$n' -- $n\n, 1");
  });

  it("reports missing and empty values instead of guessing", () => {
    expect(resolveQueryParams("select $a, $b, $a", { values: { b: "" } })).toEqual({
      sql: null,
      missing: ["a", "b"],
    });
  });

  it("passes SQL through untouched when disabled or placeholder-free", () => {
    expect(resolveQueryParams("select $a", { values: {}, disabled: true }).sql).toBe("select $a");
    expect(resolveQueryParams("select $1, $$x$$").sql).toBe("select $1, $$x$$");
  });

  it("guards against `x-$n` turning into a comment", () => {
    expect(resolveQueryParams("select 1-$n", { values: { n: "-1" } }).sql).toBe("select 1-(-1)");
  });

  it("honours forceText", () => {
    expect(
      resolveQueryParams("select $code", { values: { code: "42" }, forceText: ["code"] }).sql
    ).toBe("select '42'");
  });

  it("names missing parameters in the message", () => {
    expect(missingParamsMessage(["a", "b"])).toContain("$a, $b");
  });
});
