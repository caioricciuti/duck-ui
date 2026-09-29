/**
 * Cell selection for the result grid, as rectangles of row and column
 * indexes. Rectangles, not one entry per cell: selecting a column of a
 * million rows is one object, and the virtualized grid only ever asks about
 * the few cells on screen.
 */
export interface CellRange {
  row0: number;
  row1: number;
  col0: number;
  col1: number;
}

export interface CellPoint {
  row: number;
  col: number;
}

export const rangeBetween = (a: CellPoint, b: CellPoint): CellRange => ({
  row0: Math.min(a.row, b.row),
  row1: Math.max(a.row, b.row),
  col0: Math.min(a.col, b.col),
  col1: Math.max(a.col, b.col),
});

export const singleCell = (point: CellPoint): CellRange => rangeBetween(point, point);

const inRange = (range: CellRange, row: number, col: number): boolean =>
  row >= range.row0 && row <= range.row1 && col >= range.col0 && col <= range.col1;

export const isSelected = (ranges: CellRange[], row: number, col: number): boolean =>
  ranges.some((range) => inRange(range, row, col));

/** Adds the cell, or removes it when it is selected on its own already. */
export function toggleCell(ranges: CellRange[], point: CellPoint): CellRange[] {
  const own = ranges.findIndex(
    (r) =>
      r.row0 === point.row && r.row1 === point.row && r.col0 === point.col && r.col1 === point.col
  );
  if (own !== -1) return ranges.filter((_, i) => i !== own);
  return isSelected(ranges, point.row, point.col) ? ranges : [...ranges, singleCell(point)];
}

/**
 * Number of selected cells, counting a cell covered by two rectangles once.
 * Uses the grid formed by the rectangle edges, so the cost depends on how
 * many rectangles there are, not on how many cells they cover.
 */
export function countCells(ranges: CellRange[]): number {
  if (ranges.length === 0) return 0;
  if (ranges.length === 1) {
    const [r] = ranges;
    return (r.row1 - r.row0 + 1) * (r.col1 - r.col0 + 1);
  }
  const rowEdges = [...new Set(ranges.flatMap((r) => [r.row0, r.row1 + 1]))].sort((a, b) => a - b);
  const colEdges = [...new Set(ranges.flatMap((r) => [r.col0, r.col1 + 1]))].sort((a, b) => a - b);
  let total = 0;
  for (let i = 0; i < rowEdges.length - 1; i++) {
    for (let j = 0; j < colEdges.length - 1; j++) {
      if (isSelected(ranges, rowEdges[i], colEdges[j])) {
        total += (rowEdges[i + 1] - rowEdges[i]) * (colEdges[j + 1] - colEdges[j]);
      }
    }
  }
  return total;
}

/**
 * Tab separated text for the clipboard, which spreadsheets paste as cells.
 * Rows and columns that hold a selected cell are kept, in grid order. A cell
 * inside that block that is not selected is left empty, so columns line up.
 */
export function selectionToTsv(
  ranges: CellRange[],
  data: unknown[][],
  columnCount: number,
  text: (value: unknown) => string
): string {
  if (ranges.length === 0) return "";
  const cols: number[] = [];
  for (let col = 0; col < columnCount; col++) {
    if (ranges.some((r) => col >= r.col0 && col <= r.col1)) cols.push(col);
  }
  const first = Math.max(0, Math.min(...ranges.map((r) => r.row0)));
  const last = Math.min(data.length - 1, Math.max(...ranges.map((r) => r.row1)));

  const lines: string[] = [];
  for (let row = first; row <= last; row++) {
    if (!ranges.some((r) => row >= r.row0 && row <= r.row1)) continue;
    lines.push(
      cols
        .map((col) => (isSelected(ranges, row, col) ? clean(text(data[row]?.[col])) : ""))
        .join("\t")
    );
  }
  return lines.join("\n");
}

/** A tab or a line break inside a value would shift every cell after it. */
const clean = (value: string): string => value.replace(/[\t\r\n]+/g, " ");
