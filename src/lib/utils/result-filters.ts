// Sorting and filtering of an in-memory result set.

import type { ColumnMeta } from "../types/query";
import { getDisplayType, cellText } from "./column-types";

export type FilterOperator =
  "contains" | "notContains" | "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "isNull" | "isNotNull";

export interface ColumnFilter {
  column: string;
  operator: FilterOperator;
  value: string;
}

export interface ResultSort {
  column: string;
  dir: "asc" | "desc";
}

export const OPERATOR_LABELS: Record<FilterOperator, string> = {
  contains: "contains",
  notContains: "does not contain",
  eq: "=",
  neq: "≠",
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
  isNull: "is NULL",
  isNotNull: "is not NULL",
};

/** True when the operator needs no value input. */
export function isUnaryOperator(op: FilterOperator): boolean {
  return op === "isNull" || op === "isNotNull";
}

/**
 * Validate a filter value for a column type. Numeric columns require a numeric
 * value so a typo cannot silently fall
 * back to string comparison.
 */
export function isValidFilterValue(columnType: string, op: FilterOperator, value: string): boolean {
  if (isUnaryOperator(op)) return true;
  if (getDisplayType(columnType) === "number") return NUM_RE.test(value);
  return true;
}

/** Operators that make sense for a column's type. */
export function operatorsFor(columnType: string): FilterOperator[] {
  switch (getDisplayType(columnType)) {
    case "number":
    case "date":
      return ["eq", "neq", "gt", "gte", "lt", "lte", "isNull", "isNotNull"];
    case "bool":
      return ["eq", "neq", "isNull", "isNotNull"];
    default:
      return [
        "contains",
        "notContains",
        "eq",
        "neq",
        "gt",
        "gte",
        "lt",
        "lte",
        "isNull",
        "isNotNull",
      ];
  }
}

// ── Client-side comparison ───────────────────────────────────────

const INT_RE = /^-?\d+$/;
const NUM_RE = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;

function isNullish(v: unknown): boolean {
  return v === null || v === undefined;
}

/**
 * Type-aware comparison of two non-null cell values from the same column.
 * Integers compare as BigInt, which keeps BIGINT and HUGEINT values exact.
 */
export function compareValues(a: unknown, b: unknown, columnType: string): number {
  switch (getDisplayType(columnType)) {
    case "number": {
      const sa = String(a);
      const sb = String(b);
      if (INT_RE.test(sa) && INT_RE.test(sb)) {
        const ba = BigInt(sa);
        const bb = BigInt(sb);
        return ba < bb ? -1 : ba > bb ? 1 : 0;
      }
      const na = Number(a);
      const nb = Number(b);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na < nb ? -1 : na > nb ? 1 : 0;
      return sa < sb ? -1 : sa > sb ? 1 : 0;
    }
    case "date": {
      // ISO-formatted strings compare correctly lexicographically
      const sa = cellText(a);
      const sb = cellText(b);
      return sa < sb ? -1 : sa > sb ? 1 : 0;
    }
    case "bool": {
      const na = a === true || a === 1 || a === "true" ? 1 : 0;
      const nb = b === true || b === 1 || b === "true" ? 1 : 0;
      return na - nb;
    }
    default: {
      const sa = cellText(a);
      const sb = cellText(b);
      return sa < sb ? -1 : sa > sb ? 1 : 0;
    }
  }
}

/**
 * Return a sorted copy of the rows. NULLs sort last in both directions,
 * matching DuckDB's default NULLS LAST.
 */
export function sortRows(data: unknown[][], meta: ColumnMeta[], sort: ResultSort): unknown[][] {
  const ci = meta.findIndex((c) => c.name === sort.column);
  if (ci < 0) return data;
  const columnType = meta[ci].type;
  const sign = sort.dir === "asc" ? 1 : -1;
  return [...data].sort((ra, rb) => {
    const a = ra[ci];
    const b = rb[ci];
    const aNull = isNullish(a);
    const bNull = isNullish(b);
    if (aNull && bNull) return 0;
    if (aNull) return 1;
    if (bNull) return -1;
    return sign * compareValues(a, b, columnType);
  });
}

// ── Client-side filtering ────────────────────────────────────────

function matchesFilter(value: unknown, filter: ColumnFilter, columnType: string): boolean {
  switch (filter.operator) {
    case "isNull":
      return isNullish(value);
    case "isNotNull":
      return !isNullish(value);
  }
  if (isNullish(value)) return false;

  switch (filter.operator) {
    case "contains":
      return cellText(value).toLowerCase().includes(filter.value.toLowerCase());
    case "notContains":
      return !cellText(value).toLowerCase().includes(filter.value.toLowerCase());
    case "eq":
    case "neq": {
      let equal: boolean;
      if (getDisplayType(columnType) === "number" && NUM_RE.test(filter.value)) {
        equal = compareValues(value, filter.value, columnType) === 0;
      } else if (getDisplayType(columnType) === "bool") {
        const want = /^(true|1)$/i.test(filter.value);
        const got = value === true || value === 1 || value === "true";
        equal = want === got;
      } else {
        equal = cellText(value) === filter.value;
      }
      return filter.operator === "eq" ? equal : !equal;
    }
    case "gt":
      return compareValues(value, filter.value, columnType) > 0;
    case "gte":
      return compareValues(value, filter.value, columnType) >= 0;
    case "lt":
      return compareValues(value, filter.value, columnType) < 0;
    case "lte":
      return compareValues(value, filter.value, columnType) <= 0;
  }
}

/** Apply all filters (AND-combined) to the rows. */
export function filterRows(
  data: unknown[][],
  meta: ColumnMeta[],
  filters: ColumnFilter[]
): unknown[][] {
  if (filters.length === 0) return data;
  const resolved = filters
    .map((f) => ({ f, ci: meta.findIndex((c) => c.name === f.column) }))
    .filter((r) => r.ci >= 0);
  if (resolved.length === 0) return data;
  return data.filter((row) =>
    resolved.every(({ f, ci }) => matchesFilter(row[ci], f, meta[ci].type))
  );
}

/** Cycle a column's sort state: none → asc → desc → none. */
export function cycleSort(current: ResultSort | null, column: string): ResultSort | null {
  if (!current || current.column !== column) return { column, dir: "asc" };
  if (current.dir === "asc") return { column, dir: "desc" };
  return null;
}
