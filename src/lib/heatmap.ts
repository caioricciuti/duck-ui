import { cellText } from "@/lib/utils/column-types";

/** More categories than this on an axis would draw cells too small to read. */
export const HEATMAP_MAX_CATEGORIES = 50;

export interface HeatmapData {
  xLabels: string[];
  yLabels: string[];
  /** `cells[yi][xi]`, null where no row has that pair. */
  cells: (number | null)[][];
  min: number;
  max: number;
  /** Categories past the cap on either axis were left out. */
  cut: boolean;
}

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

/**
 * A grid of `value` by the categories of `x` and `y`, in order of first
 * appearance. Rows sharing a pair are summed, so a query that is not yet
 * grouped still draws the totals. Only the first HEATMAP_MAX_CATEGORIES
 * categories of each axis are kept.
 */
export function heatmapData(
  rows: Record<string, unknown>[],
  x: string,
  y: string,
  value: string
): HeatmapData {
  const xIndex = new Map<string, number>();
  const yIndex = new Map<string, number>();
  const sums = new Map<string, number>();
  let cut = false;

  const indexOf = (index: Map<string, number>, label: string): number | null => {
    const known = index.get(label);
    if (known !== undefined) return known;
    if (index.size >= HEATMAP_MAX_CATEGORIES) {
      cut = true;
      return null;
    }
    index.set(label, index.size);
    return index.size - 1;
  };

  for (const row of rows) {
    const v = toNumber(row[value]);
    if (v === null) continue;
    const xi = indexOf(xIndex, cellText(row[x]) || "NULL");
    const yi = indexOf(yIndex, cellText(row[y]) || "NULL");
    if (xi === null || yi === null) continue;
    const key = `${yi}:${xi}`;
    sums.set(key, (sums.get(key) ?? 0) + v);
  }

  const cells: (number | null)[][] = Array.from({ length: yIndex.size }, () =>
    Array<number | null>(xIndex.size).fill(null)
  );
  let min = Infinity;
  let max = -Infinity;
  for (const [key, sum] of sums) {
    const [yi, xi] = key.split(":").map(Number);
    cells[yi][xi] = sum;
    if (sum < min) min = sum;
    if (sum > max) max = sum;
  }

  return {
    xLabels: [...xIndex.keys()],
    yLabels: [...yIndex.keys()],
    cells,
    min: sums.size ? min : 0,
    max: sums.size ? max : 0,
    cut,
  };
}

/** Position of `value` between min and max, 0 to 1. A flat grid sits at the top. */
export function heatLevel(value: number, min: number, max: number): number {
  return max === min ? 1 : (value - min) / (max - min);
}
