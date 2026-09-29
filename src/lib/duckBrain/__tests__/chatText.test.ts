import { describe, it, expect } from "vitest";
import { findStableBoundary, splitMentions, stripCodeBlocks, toTableData } from "../chatText";

describe("splitMentions", () => {
  it("separates table and column mentions from plain text", () => {
    expect(splitMentions("top rows of @sales by @sales.region please")).toEqual([
      { type: "text", value: "top rows of ", isColumn: false },
      { type: "mention", value: "sales", isColumn: false },
      { type: "text", value: " by ", isColumn: false },
      { type: "mention", value: "sales.region", isColumn: true },
      { type: "text", value: " please", isColumn: false },
    ]);
  });

  it("returns a single text part when there is no mention", () => {
    expect(splitMentions("hello")).toEqual([{ type: "text", value: "hello", isColumn: false }]);
  });
});

describe("stripCodeBlocks", () => {
  it("removes fenced blocks with and without a language", () => {
    const content = "Here:\n\n```sql\nSELECT 1;\n```\n\nand ```inline fence``` done";
    expect(stripCodeBlocks(content)).toBe("Here:\n\nand  done");
  });
});

describe("findStableBoundary", () => {
  it("has no boundary inside a single paragraph", () => {
    expect(findStableBoundary("one line\nsecond line\nthird")).toBe(0);
  });

  it("cuts where a new paragraph starts after a blank line", () => {
    const text = "first paragraph\n\nsecond paragraph\nstill wri";
    expect(text.slice(findStableBoundary(text))).toBe("second paragraph\nstill wri");
  });

  it("never cuts inside an open code fence", () => {
    const text = "intro\n\n```sql\nSELECT 1\n\nFROM t\n";
    expect(text.slice(findStableBoundary(text))).toBe("```sql\nSELECT 1\n\nFROM t\n");
  });

  it("cuts right after a closing fence", () => {
    const text = "```sql\nSELECT 1\n```\nafter";
    expect(text.slice(findStableBoundary(text))).toBe("after");
  });

  it("keeps a list together across blank lines", () => {
    const text = "- one\n\n- two\n\n  continued\n";
    expect(findStableBoundary(text)).toBe(0);
  });
});

describe("toTableData", () => {
  it("orders row values by column", () => {
    const table = toTableData({
      columns: ["a", "b"],
      columnTypes: ["INTEGER", "VARCHAR"],
      data: [
        { b: "x", a: 1 },
        { a: 2, b: null },
      ],
      rowCount: 2,
    });
    expect(table.meta).toEqual([
      { name: "a", type: "INTEGER" },
      { name: "b", type: "VARCHAR" },
    ]);
    expect(table.data).toEqual([
      [1, "x"],
      [2, null],
    ]);
  });
});
