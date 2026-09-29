/**
 * Data marshalling for Python cells — everything that converts between the
 * app's shapes and what crosses the worker boundary. Pure: no worker, no
 * Pyodide, no store.
 *
 * Query results go to Python as Arrow IPC whenever the session produced Arrow
 * (pyarrow ships in the pinned Pyodide, so `pa.ipc.open_stream(...)
 * .read_pandas()` keeps decimals, timestamps and nulls intact). Row-only
 * sessions (a remote DuckDB over HTTP), or a worker whose pyarrow failed to
 * load, get a columnar JSON object instead.
 *
 * DataFrames come back as `to_json(orient="split")` and are turned into the
 * legacy `QueryResult` so the existing results table and charts render them.
 */

import { Table, tableToIPC } from "apache-arrow";
import {
  collectExecution,
  materializeCollected,
  type CollectedExecution,
  type QueryExecution,
  type QueryRequest,
} from "@/services/engine";
import { encodeSchema } from "@/services/arrow/ipc";
import type { PythonCellOutput, QueryResult } from "@/store/types";
import type { RawRunOutput, SqlPayload } from "./protocol";

const utf8 = new TextEncoder();

// ─── main thread: query result → Python ──────────────────────────────────────

/** Values JSON.stringify cannot carry faithfully. */
export const toJsonSafe = (value: unknown): unknown => {
  if (value === undefined) return null;
  if (typeof value === "bigint") {
    return value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= BigInt(Number.MIN_SAFE_INTEGER)
      ? Number(value)
      : value.toString();
  }
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (value instanceof Uint8Array) return Array.from(value);
  if (Array.isArray(value)) return value.map(toJsonSafe);
  if (typeof value === "object" && value !== null) {
    // Structs and maps from the engine: plain objects, converted field by field.
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toJsonSafe(v)]));
  }
  return value;
};

/** Columnar JSON: `{columns: [...], data: [[col0 values], [col1 values], ...]}`. */
export const queryResultToColumnar = (
  result: QueryResult
): { columns: string[]; types: string[]; data: unknown[][] } => ({
  columns: result.columns,
  types: result.columnTypes,
  data: result.columns.map((column) => result.data.map((row) => toJsonSafe(row[column]))),
});

export const errorPayload = (message: string): SqlPayload => ({
  format: "error",
  bytes: utf8.encode(message || "Query failed"),
  truncated: false,
});

/** Encodes a drained execution for Python in the preferred format. */
export const collectedToPayload = (
  collected: CollectedExecution,
  prefer: "arrow" | "json"
): SqlPayload => {
  if (collected.error) return errorPayload(collected.error.message);
  const truncated = collected.truncated;

  if (prefer === "arrow" && collected.rows.length === 0) {
    if (collected.batches.length > 0) {
      return {
        format: "arrow",
        bytes: tableToIPC(new Table(collected.batches), "stream"),
        truncated,
      };
    }
    if (collected.schema?.arrow) {
      return { format: "arrow", bytes: encodeSchema(collected.schema.arrow), truncated };
    }
  }

  const result = materializeCollected(collected);
  if (result.error) return errorPayload(result.error);
  return {
    format: "json",
    bytes: utf8.encode(JSON.stringify(queryResultToColumnar(result))),
    truncated,
  };
};

/** Runs `sql` on a session and encodes the result for Python. Never throws. */
export const runSqlForPython = async (
  session: { execute: (request: QueryRequest) => QueryExecution } | null | undefined,
  sql: string,
  prefer: "arrow" | "json",
  maxRows?: number
): Promise<SqlPayload> => {
  if (!session) return errorPayload("No active connection");
  try {
    const execution = session.execute({ sql, label: "python:sql", maxRows });
    return collectedToPayload(await collectExecution(execution), prefer);
  } catch (error) {
    return errorPayload(error instanceof Error ? error.message : String(error));
  }
};

// ─── Python → main thread: run output ────────────────────────────────────────

/** pandas dtype → the DuckDB-style type names the table and charts expect. */
export const pandasDtypeToColumnType = (dtype: string): string => {
  const d = dtype.toLowerCase();
  if (/^u?int(8|16|32|64)?$/.test(d)) return "BIGINT";
  if (/^float(16|32|64)?$/.test(d)) return "DOUBLE";
  if (d === "bool" || d === "boolean") return "BOOLEAN";
  if (d.startsWith("datetime64")) return "TIMESTAMP";
  if (d.startsWith("timedelta")) return "INTERVAL";
  return "VARCHAR";
};

/** Column names must be unique keys in row objects; duplicates get a suffix. */
export const uniqueColumnNames = (names: unknown[]): string[] => {
  const seen = new Map<string, number>();
  return names.map((raw) => {
    const name = raw === null || raw === undefined ? "" : String(raw);
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    if (count === 0) return name;
    let candidate = `${name}_${count}`;
    while (seen.has(candidate)) candidate = `${candidate}_`;
    seen.set(candidate, 1);
    return candidate;
  });
};

/** A DataFrame's split-orient JSON as the legacy result shape. */
export const splitTableToQueryResult = (
  table: NonNullable<RawRunOutput["table"]>,
  rowCap: number
): QueryResult => {
  const parsed = JSON.parse(table.json) as { columns?: unknown[]; data?: unknown[][] };
  const columns = uniqueColumnNames(Array.isArray(parsed.columns) ? parsed.columns : []);
  const rows = (Array.isArray(parsed.data) ? parsed.data : []).slice(0, rowCap);
  const data = rows.map((row) => {
    const record: Record<string, unknown> = {};
    columns.forEach((column, index) => {
      record[column] = Array.isArray(row) ? (row[index] ?? null) : null;
    });
    return record;
  });
  const rowCount = Number.isFinite(table.rowCount) ? table.rowCount : data.length;
  return {
    columns,
    columnTypes: columns.map((_, index) => pandasDtypeToColumnType(table.dtypes[index] ?? "")),
    data,
    rowCount,
    truncated: rowCount > data.length || undefined,
  };
};

/** Appends stream text up to `cap` characters; a runaway log keeps its beginning. */
export const appendCapped = (current: string, text: string, cap: number): string => {
  if (current.length >= cap) return current;
  const next = current + text;
  if (next.length <= cap) return next;
  return `${next.slice(0, cap)}\n… output truncated at ${cap.toLocaleString()} characters`;
};

/** Combines streamed text with the worker's final output into what a cell stores. */
export const toCellOutput = (
  raw: RawRunOutput,
  streams: { stdout: string; stderr: string },
  options: { rowCap: number; figureCap: number; durationMs?: number }
): PythonCellOutput => {
  const output: PythonCellOutput = { stdout: streams.stdout, stderr: streams.stderr };
  if (raw.error) output.error = raw.error;
  if (raw.table) {
    try {
      output.table = splitTableToQueryResult(raw.table, options.rowCap);
    } catch (error) {
      output.error =
        (output.error ? `${output.error}\n` : "") +
        `Could not render DataFrame: ${error instanceof Error ? error.message : String(error)}`;
    }
  } else if (typeof raw.text === "string") {
    output.text = raw.text;
  }
  const images = Array.isArray(raw.images)
    ? raw.images.filter((image): image is string => typeof image === "string" && image.length > 0)
    : [];
  if (images.length > 0) output.images = images.slice(0, options.figureCap);
  if (options.durationMs !== undefined) output.durationMs = options.durationMs;
  return output;
};
