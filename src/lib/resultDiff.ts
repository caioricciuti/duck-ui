/**
 * Pinned query results and the diff between two of them.
 *
 * Pure: no store, no engine. A snapshot is a frozen copy of a result (capped,
 * so pinning a huge result cannot hold the whole thing in memory twice), and
 * `diffResults` compares two snapshots at three levels — schema, row count,
 * rows. Rows are compared on the columns both sides share; a column that
 * exists on one side only is reported by the schema diff instead.
 *
 * Row matching has two modes:
 * - keyed: rows are paired by the value of the key column(s), so an edited
 *   row shows up as "changed" with the differing cells named;
 * - unkeyed: each side is a multiset of whole rows, so a changed row shows up
 *   as one removed plus one added, and duplicates are counted, not collapsed.
 */

export type DiffRow = Record<string, unknown>;

/** Default row cap for a pinned result. */
export const PIN_ROW_LIMIT = 10_000;

export interface ResultSnapshot {
  columns: string[];
  columnTypes: string[];
  rows: DiffRow[];
  /** Rows in the result the snapshot was taken from. */
  sourceRowCount: number;
  /**
   * The snapshot holds fewer rows than the result it came from — either the
   * pin cap cut it, or the result itself was already truncated by the engine.
   */
  truncated: boolean;
}

export interface SnapshotSource {
  columns: string[];
  columnTypes?: string[];
  data: DiffRow[];
  rowCount?: number;
  truncated?: boolean;
}

export const createResultSnapshot = (
  source: SnapshotSource,
  limit: number = PIN_ROW_LIMIT
): ResultSnapshot => {
  const sourceRowCount = source.rowCount ?? source.data.length;
  const rows = source.data.length > limit ? source.data.slice(0, limit) : source.data.slice();
  return {
    columns: [...source.columns],
    columnTypes: source.columns.map((_, i) => source.columnTypes?.[i] ?? ""),
    rows,
    sourceRowCount,
    truncated: !!source.truncated || rows.length < sourceRowCount,
  };
};

// ─── Value identity ──────────────────────────────────────────────────────────

/**
 * A stable string identity for a cell value. Numbers and bigints share a tag
 * so `1` and `1n` compare equal (the same column can come back either way
 * depending on the engine path); strings keep their own tag so `"1"` does not.
 */
export const canonicalValue = (value: unknown): string => {
  if (value === null || value === undefined) return "∅";
  switch (typeof value) {
    case "number":
      return `n:${Object.is(value, -0) ? 0 : value}`;
    case "bigint":
      return `n:${value.toString()}`;
    case "string":
      return `s:${value}`;
    case "boolean":
      return `b:${value}`;
  }
  if (value instanceof Date) {
    return `d:${Number.isNaN(value.getTime()) ? "invalid" : value.toISOString()}`;
  }
  if (value instanceof Uint8Array) return `u:${Array.from(value).join(",")}`;
  try {
    return `o:${JSON.stringify(value, (_, v) => (typeof v === "bigint" ? `${v}n` : v))}`;
  } catch {
    return `o:${String(value)}`;
  }
};

export const valuesEqual = (a: unknown, b: unknown): boolean =>
  canonicalValue(a) === canonicalValue(b);

const rowIdentity = (row: DiffRow, columns: string[]): string =>
  JSON.stringify(columns.map((c) => canonicalValue(row[c])));

// ─── Schema ──────────────────────────────────────────────────────────────────

export interface ColumnTypeChange {
  name: string;
  from: string;
  to: string;
}

export interface SchemaDiff {
  added: { name: string; type: string }[];
  removed: { name: string; type: string }[];
  typeChanged: ColumnTypeChange[];
  /** Columns present on both sides, in the order of the right-hand side. */
  common: string[];
  /** Same columns in a different order. Informational only. */
  reordered: boolean;
}

export const diffSchema = (
  left: Pick<ResultSnapshot, "columns" | "columnTypes">,
  right: Pick<ResultSnapshot, "columns" | "columnTypes">
): SchemaDiff => {
  const leftTypes = new Map(left.columns.map((c, i) => [c, left.columnTypes[i] ?? ""]));
  const rightTypes = new Map(right.columns.map((c, i) => [c, right.columnTypes[i] ?? ""]));

  const added = right.columns
    .filter((c) => !leftTypes.has(c))
    .map((name) => ({ name, type: rightTypes.get(name) ?? "" }));
  const removed = left.columns
    .filter((c) => !rightTypes.has(c))
    .map((name) => ({ name, type: leftTypes.get(name) ?? "" }));
  const common = right.columns.filter((c) => leftTypes.has(c));
  const typeChanged = common
    .filter((c) => (leftTypes.get(c) ?? "") !== (rightTypes.get(c) ?? ""))
    .map((name) => ({ name, from: leftTypes.get(name) ?? "", to: rightTypes.get(name) ?? "" }));

  const leftCommonOrder = left.columns.filter((c) => rightTypes.has(c));
  const reordered = leftCommonOrder.some((c, i) => common[i] !== c);

  return { added, removed, typeChanged, common, reordered };
};

// ─── Rows ────────────────────────────────────────────────────────────────────

export interface ChangedRow {
  /** Key column values, in key order. */
  key: unknown[];
  before: DiffRow;
  after: DiffRow;
  /** Compared columns whose value differs. Never includes key columns. */
  changedColumns: string[];
}

export interface RowDiff {
  mode: "keyed" | "multiset";
  keyColumns: string[];
  /** The columns rows were compared on. */
  comparedColumns: string[];
  added: DiffRow[];
  removed: DiffRow[];
  changed: ChangedRow[];
  unchangedCount: number;
  /**
   * Keyed mode only: key values that occur more than once on a side. Such
   * rows are paired in order of appearance, which may not be what was meant.
   */
  duplicateKeys: { left: number; right: number };
}

export interface ResultDiff {
  schema: SchemaDiff;
  rowCount: { left: number; right: number; delta: number };
  rows: RowDiff;
  /** Either side is a partial result, so row-level findings are partial too. */
  partial: boolean;
}

export interface DiffOptions {
  /** Columns identifying a row. Empty or omitted: multiset diff. */
  keyColumns?: string[];
}

export class ResultDiffError extends Error {}

const diffKeyed = (
  left: DiffRow[],
  right: DiffRow[],
  keyColumns: string[],
  columns: string[]
): RowDiff => {
  const valueColumns = columns.filter((c) => !keyColumns.includes(c));
  const leftByKey = new Map<string, DiffRow[]>();
  let duplicateLeft = 0;
  for (const row of left) {
    const id = rowIdentity(row, keyColumns);
    const bucket = leftByKey.get(id);
    if (bucket) {
      bucket.push(row);
      duplicateLeft++;
    } else {
      leftByKey.set(id, [row]);
    }
  }

  const added: DiffRow[] = [];
  const changed: ChangedRow[] = [];
  let unchangedCount = 0;
  let duplicateRight = 0;
  const seenRight = new Set<string>();

  for (const row of right) {
    const id = rowIdentity(row, keyColumns);
    if (seenRight.has(id)) duplicateRight++;
    else seenRight.add(id);

    const bucket = leftByKey.get(id);
    const match = bucket?.shift();
    if (!match) {
      added.push(row);
      continue;
    }
    const changedColumns = valueColumns.filter((c) => !valuesEqual(match[c], row[c]));
    if (changedColumns.length === 0) {
      unchangedCount++;
    } else {
      changed.push({
        key: keyColumns.map((c) => row[c]),
        before: match,
        after: row,
        changedColumns,
      });
    }
  }

  // Whatever is still queued on the left had no partner on the right. Walk
  // the original order so removed rows read top to bottom.
  const remaining = new Set<DiffRow>();
  for (const bucket of leftByKey.values()) for (const row of bucket) remaining.add(row);
  const removed = left.filter((row) => remaining.has(row));

  return {
    mode: "keyed",
    keyColumns,
    comparedColumns: columns,
    added,
    removed,
    changed,
    unchangedCount,
    duplicateKeys: { left: duplicateLeft, right: duplicateRight },
  };
};

const diffMultiset = (left: DiffRow[], right: DiffRow[], columns: string[]): RowDiff => {
  const counts = new Map<string, number>();
  for (const row of left) {
    const id = rowIdentity(row, columns);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const added: DiffRow[] = [];
  let unchangedCount = 0;
  for (const row of right) {
    const id = rowIdentity(row, columns);
    const n = counts.get(id) ?? 0;
    if (n > 0) {
      counts.set(id, n - 1);
      unchangedCount++;
    } else {
      added.push(row);
    }
  }

  // Remove the surplus left rows, the last occurrences of each identity being
  // the ones considered unmatched (so the earliest duplicates count as kept).
  const removed: DiffRow[] = [];
  for (let i = left.length - 1; i >= 0; i--) {
    const id = rowIdentity(left[i], columns);
    const n = counts.get(id) ?? 0;
    if (n > 0) {
      counts.set(id, n - 1);
      removed.push(left[i]);
    }
  }
  removed.reverse();

  return {
    mode: "multiset",
    keyColumns: [],
    comparedColumns: columns,
    added,
    removed,
    changed: [],
    unchangedCount,
    duplicateKeys: { left: 0, right: 0 },
  };
};

/**
 * Diff `right` against `left` ("before" → "after").
 *
 * Throws `ResultDiffError` when a key column is not present on both sides.
 */
export const diffResults = (
  left: ResultSnapshot,
  right: ResultSnapshot,
  options: DiffOptions = {}
): ResultDiff => {
  const schema = diffSchema(left, right);
  const keyColumns = options.keyColumns ?? [];
  const missing = keyColumns.filter((c) => !schema.common.includes(c));
  if (missing.length > 0) {
    throw new ResultDiffError(
      `Key column${missing.length > 1 ? "s" : ""} not present in both results: ${missing.join(", ")}`
    );
  }

  const rows =
    keyColumns.length > 0
      ? diffKeyed(left.rows, right.rows, keyColumns, schema.common)
      : diffMultiset(left.rows, right.rows, schema.common);

  return {
    schema,
    rowCount: {
      left: left.sourceRowCount,
      right: right.sourceRowCount,
      delta: right.sourceRowCount - left.sourceRowCount,
    },
    rows,
    partial: left.truncated || right.truncated,
  };
};

/** True when nothing at all differs. */
export const isIdentical = (diff: ResultDiff): boolean =>
  diff.schema.added.length === 0 &&
  diff.schema.removed.length === 0 &&
  diff.schema.typeChanged.length === 0 &&
  diff.rowCount.delta === 0 &&
  diff.rows.added.length === 0 &&
  diff.rows.removed.length === 0 &&
  diff.rows.changed.length === 0;
