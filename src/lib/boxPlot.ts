import { cellText } from "@/lib/utils/column-types";

export interface BoxStats {
  label: string;
  n: number;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  /** Ends of the whiskers: the furthest values within 1.5 IQR of the box. */
  lowWhisker: number;
  highWhisker: number;
  outliers: number[];
}

/**
 * Quantile of sorted values with linear interpolation between the two
 * nearest ranks, the way DuckDB's `quantile_cont` computes it, so a box
 * agrees with the same query run in SQL.
 */
export function quantileSorted(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function boxStats(label: string, values: number[]): BoxStats | null {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const q1 = quantileSorted(sorted, 0.25);
  const q3 = quantileSorted(sorted, 0.75);
  const iqr = q3 - q1;
  const lowFence = q1 - 1.5 * iqr;
  const highFence = q3 + 1.5 * iqr;
  const inside = sorted.filter((v) => v >= lowFence && v <= highFence);
  return {
    label,
    n: sorted.length,
    min: sorted[0],
    q1,
    median: quantileSorted(sorted, 0.5),
    q3,
    max: sorted[sorted.length - 1],
    lowWhisker: inside[0],
    highWhisker: inside[inside.length - 1],
    outliers: sorted.filter((v) => v < lowFence || v > highFence),
  };
}

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

/**
 * One box per distinct value of `x`, in order of first appearance, from the
 * raw values of `y`. Without `x` every row goes into a single box labelled
 * with the column name. Rows whose value is not a number are skipped.
 */
export function boxPlotData(
  rows: Record<string, unknown>[],
  y: string,
  x: string | undefined
): BoxStats[] {
  const groups = new Map<string, number[]>();
  for (const row of rows) {
    const value = toNumber(row[y]);
    if (value === null) continue;
    const key = x ? cellText(row[x]) || "NULL" : y;
    const bucket = groups.get(key);
    if (bucket) bucket.push(value);
    else groups.set(key, [value]);
  }
  const boxes: BoxStats[] = [];
  for (const [label, values] of groups) {
    const box = boxStats(label, values);
    if (box) boxes.push(box);
  }
  return boxes;
}

/**
 * Round tick values covering min to max, about `count` of them, on steps of
 * 1, 2 or 5 times a power of ten. The first and last tick enclose the data.
 */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) {
    const pad = Math.abs(min) || 1;
    return niceTicks(min - pad, max + pad, count);
  }
  const rough = (max - min) / Math.max(1, count);
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((m) => m * power).find((s) => s >= rough) ?? 10 * power;
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  const first = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let i = 0; ; i++) {
    // Rounded to the step's decimals so 0.1 + 0.2 prints as 0.3.
    const tick = Number((first + i * step).toFixed(decimals));
    ticks.push(tick);
    if (tick >= max) break;
  }
  return ticks;
}
