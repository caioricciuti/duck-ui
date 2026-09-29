import { describe, it, expect } from "vitest";
import {
  countCells,
  isSelected,
  rangeBetween,
  selectionToTsv,
  singleCell,
  toggleCell,
} from "../cellSelection";

const text = (value: unknown) => (value === null || value === undefined ? "" : String(value));

describe("rangeBetween", () => {
  it("orders the corners whichever way the drag went", () => {
    expect(rangeBetween({ row: 5, col: 3 }, { row: 2, col: 1 })).toEqual({
      row0: 2,
      row1: 5,
      col0: 1,
      col1: 3,
    });
  });
});

describe("toggleCell", () => {
  it("adds a cell and removes it again", () => {
    const one = toggleCell([], { row: 1, col: 1 });
    expect(isSelected(one, 1, 1)).toBe(true);
    expect(toggleCell(one, { row: 1, col: 1 })).toEqual([]);
  });

  it("leaves a cell inside a larger range selected", () => {
    const block = [rangeBetween({ row: 0, col: 0 }, { row: 3, col: 3 })];
    expect(toggleCell(block, { row: 1, col: 1 })).toBe(block);
  });
});

describe("countCells", () => {
  it("counts a rectangle by its area", () => {
    expect(countCells([rangeBetween({ row: 0, col: 1 }, { row: 24, col: 1 })])).toBe(25);
  });

  it("counts overlapping rectangles once", () => {
    const a = rangeBetween({ row: 0, col: 0 }, { row: 1, col: 1 });
    const b = rangeBetween({ row: 1, col: 1 }, { row: 2, col: 2 });
    expect(countCells([a, b])).toBe(7);
  });

  it("counts separate cells", () => {
    expect(countCells([singleCell({ row: 0, col: 0 }), singleCell({ row: 9, col: 4 })])).toBe(2);
  });

  it("handles a column of a million rows without visiting them", () => {
    expect(countCells([rangeBetween({ row: 0, col: 2 }, { row: 999_999, col: 2 })])).toBe(
      1_000_000
    );
  });
});

describe("selectionToTsv", () => {
  const data = [
    [1, "a", true],
    [2, "b", false],
    [3, "c", null],
  ];

  it("writes a block as rows of tab separated cells", () => {
    const tsv = selectionToTsv(
      [rangeBetween({ row: 0, col: 0 }, { row: 1, col: 1 })],
      data,
      3,
      text
    );
    expect(tsv).toBe("1\ta\n2\tb");
  });

  it("keeps columns aligned when the selection has holes", () => {
    const ranges = [singleCell({ row: 0, col: 0 }), singleCell({ row: 2, col: 1 })];
    expect(selectionToTsv(ranges, data, 3, text)).toBe("1\t\n\tc");
  });

  it("flattens tabs and line breaks inside a value", () => {
    const tsv = selectionToTsv([singleCell({ row: 0, col: 0 })], [["a\tb\nc"]], 1, text);
    expect(tsv).toBe("a b c");
  });

  it("ignores rows past the end of the data", () => {
    const tsv = selectionToTsv(
      [rangeBetween({ row: 2, col: 0 }, { row: 9, col: 0 })],
      data,
      3,
      text
    );
    expect(tsv).toBe("3");
  });
});
