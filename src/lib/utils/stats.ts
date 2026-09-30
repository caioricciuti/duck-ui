import type { ColumnMeta } from "../types/query";
import { getDisplayType, cellText, type DisplayType } from "./column-types";

export interface ColumnStats {
  name: string;
  type: string;
  displayType: DisplayType;
  count: number;
  nulls: number;
  nullPct: number;
  // numeric
  min?: number;
  max?: number;
  avg?: number;
  sum?: number;
  // string
  minLen?: number;
  maxLen?: number;
  avgLen?: number;
  distinct?: number;
  /** `distinct` stopped counting at DISTINCT_LIMIT: there are at least that many. */
  distinctCapped?: boolean;
  /** Every value with its count, most frequent first. Only for a handful of distinct values. */
  top?: { value: string; count: number }[];
  // date
  earliest?: string;
  latest?: string;
  // bool
  trueCount?: number;
  falseCount?: number;
  /** Equal-width histogram between the smallest and largest value, for numbers and dates. */
  bins?: number[];
}

/** Distinct values tracked per text column before counting stops. */
export const DISTINCT_LIMIT = 10000;
export const HISTOGRAM_BINS = 12;
/** A text column with at most this many distinct values lists them all in `top`. */
export const TOP_VALUES = 12;

/** At most `limit` rows, evenly spaced over the whole set. */
export function sampleRows<T>(rows: T[], limit: number): T[] {
  if (rows.length <= limit) return rows;
  const sampled: T[] = [];
  const step = rows.length / limit;
  for (let i = 0; i < limit; i++) {
    sampled.push(rows[Math.floor(i * step)] ?? rows[rows.length - 1]);
  }
  return sampled;
}

/** Counts per bin. Undefined when the values do not span a range. */
function histogram(values: Float64Array, used: number, min: number, max: number) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return undefined;
  const bins = new Array<number>(HISTOGRAM_BINS).fill(0);
  const scale = HISTOGRAM_BINS / (max - min);
  for (let i = 0; i < used; i++) {
    bins[Math.min(HISTOGRAM_BINS - 1, Math.floor((values[i] - min) * scale))]++;
  }
  return bins;
}

/** A date cell as a point in time, or NaN when it is not one (a TIME, an INTERVAL). */
function toTime(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Date.parse(value);
  return NaN;
}

/** Per-column statistics of the rows at hand. */
export function computeColumnStats(meta: ColumnMeta[], data: unknown[][]): ColumnStats[] {
  return meta.map((col, ci) => {
    const dt = getDisplayType(col.type);
    const total = data.length;
    let nulls = 0;
    const base = () => ({
      name: col.name,
      type: col.type,
      displayType: dt,
      count: total,
      nulls,
      nullPct: total > 0 ? (nulls / total) * 100 : 0,
    });

    if (dt === "number") {
      let min = Infinity;
      let max = -Infinity;
      let sum = 0;
      let numCount = 0;
      // Parsed once here, read again for the histogram.
      const values = new Float64Array(total);

      for (let r = 0; r < total; r++) {
        const v = data[r][ci];
        if (v === null || v === undefined || v === "") {
          nulls++;
          continue;
        }
        const n = Number(v);
        if (Number.isNaN(n)) {
          nulls++;
          continue;
        }
        values[numCount++] = n;
        sum += n;
        if (n < min) min = n;
        if (n > max) max = n;
      }

      return {
        ...base(),
        min: numCount > 0 ? min : undefined,
        max: numCount > 0 ? max : undefined,
        avg: numCount > 0 ? sum / numCount : undefined,
        sum: numCount > 0 ? sum : undefined,
        bins: histogram(values, numCount, min, max),
      };
    }

    if (dt === "string") {
      let minLen = Infinity;
      let maxLen = 0;
      let totalLen = 0;
      let strCount = 0;
      const counts = new Map<string, number>();
      let capped = false;

      for (let r = 0; r < total; r++) {
        const v = data[r][ci];
        if (v === null || v === undefined) {
          nulls++;
          continue;
        }
        const s = cellText(v);
        strCount++;
        totalLen += s.length;
        if (s.length < minLen) minLen = s.length;
        if (s.length > maxLen) maxLen = s.length;
        const seen = counts.get(s);
        if (seen !== undefined) counts.set(s, seen + 1);
        else if (counts.size < DISTINCT_LIMIT) counts.set(s, 1);
        else capped = true;
      }

      return {
        ...base(),
        minLen: strCount > 0 ? minLen : undefined,
        maxLen: strCount > 0 ? maxLen : undefined,
        avgLen: strCount > 0 ? totalLen / strCount : undefined,
        distinct: strCount > 0 ? counts.size : undefined,
        distinctCapped: capped || undefined,
        top:
          counts.size > 0 && counts.size <= TOP_VALUES
            ? [...counts]
                .map(([value, count]) => ({ value, count }))
                .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
            : undefined,
      };
    }

    if (dt === "date") {
      let earliest = "";
      let latest = "";
      let min = Infinity;
      let max = -Infinity;
      let timeCount = 0;
      const times = new Float64Array(total);

      for (let r = 0; r < total; r++) {
        const v = data[r][ci];
        if (v === null || v === undefined || v === "") {
          nulls++;
          continue;
        }
        const s = cellText(v);
        if (!earliest || s < earliest) earliest = s;
        if (!latest || s > latest) latest = s;
        const time = toTime(v);
        if (Number.isNaN(time)) continue;
        times[timeCount++] = time;
        if (time < min) min = time;
        if (time > max) max = time;
      }

      return {
        ...base(),
        earliest: earliest || undefined,
        latest: latest || undefined,
        bins: histogram(times, timeCount, min, max),
      };
    }

    if (dt === "bool") {
      let trueCount = 0;
      let falseCount = 0;
      for (let r = 0; r < total; r++) {
        const v = data[r][ci];
        if (v === null || v === undefined) nulls++;
        else if (v === true || v === "true") trueCount++;
        else falseCount++;
      }
      return { ...base(), trueCount, falseCount };
    }

    // json / unknown: just count + nulls
    for (let r = 0; r < total; r++) {
      const v = data[r][ci];
      if (v === null || v === undefined) nulls++;
    }

    return base();
  });
}
