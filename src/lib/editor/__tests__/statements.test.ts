import { describe, it, expect } from "vitest";
import { splitStatements, statementAt } from "../statements";

const texts = (sql: string) => splitStatements(sql).map((s) => s.text);

describe("splitStatements", () => {
  it("splits on semicolons and drops empty statements", () => {
    expect(texts("select 1; select 2;;\n  ")).toEqual(["select 1", "select 2"]);
  });

  it("reports offsets of the trimmed statement", () => {
    const sql = "  select 1 ;\n\n select 2";
    const [first, second] = splitStatements(sql);
    expect(sql.slice(first.from, first.to)).toBe("select 1");
    expect(sql.slice(second.from, second.to)).toBe("select 2");
  });

  it("ignores semicolons inside strings and quoted identifiers", () => {
    expect(texts(`select 'a;b', "c;d" from t; select 2`)).toEqual([
      `select 'a;b', "c;d" from t`,
      "select 2",
    ]);
  });

  it("treats a doubled quote as an escaped quote", () => {
    expect(texts("select 'it''s; fine'; select 2")).toEqual(["select 'it''s; fine'", "select 2"]);
  });

  it("ignores semicolons inside comments", () => {
    expect(texts("select 1 -- not; here\n; /* nor; here */ select 2")).toEqual([
      "select 1 -- not; here",
      "/* nor; here */ select 2",
    ]);
  });

  it("ignores semicolons inside dollar quoted bodies", () => {
    expect(texts("select $$a;b$$; select $tag$c;d$tag$")).toEqual([
      "select $$a;b$$",
      "select $tag$c;d$tag$",
    ]);
  });

  it("does not mistake a parameter for a dollar quote", () => {
    expect(texts("select $name; select 2")).toEqual(["select $name", "select 2"]);
  });

  it("survives an unterminated string", () => {
    expect(texts("select 'open; select 2")).toEqual(["select 'open; select 2"]);
  });
});

describe("statementAt", () => {
  const sql = "select 1;\n\nselect 2;\nselect 3";

  it("returns the statement under the cursor", () => {
    expect(statementAt(sql, sql.indexOf("2"))?.text).toBe("select 2");
  });

  it("gives the gap after a statement to that statement", () => {
    expect(statementAt(sql, sql.indexOf(";") + 1)?.text).toBe("select 1");
    expect(statementAt(sql, sql.indexOf("\n\n") + 1)?.text).toBe("select 1");
  });

  it("returns the first statement for a cursor before any text", () => {
    expect(statementAt("   select 1", 0)?.text).toBe("select 1");
  });

  it("returns the last statement at the end of the document", () => {
    expect(statementAt(sql, sql.length)?.text).toBe("select 3");
  });

  it("returns null for an empty document", () => {
    expect(statementAt("  \n ", 1)).toBeNull();
  });
});
