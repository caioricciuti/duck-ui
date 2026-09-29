import type { QueryResult } from "@/store/types";
import type { ColumnMeta } from "@/lib/types/query";
import type { DataRow } from "./types";

export interface GridData {
  meta: ColumnMeta[];
  data: unknown[][];
}

/** Positional rows for the grid, in the result's column order. */
export function resultToGrid(result: QueryResult): GridData {
  const meta = result.columns.map((name, i) => ({ name, type: result.columnTypes[i] ?? "" }));
  const data = result.data.map((row) => result.columns.map((name) => row[name]));
  return { meta, data };
}

/** Grid data for plain row objects that carry no type information. */
export function rowsToGrid(rows: DataRow[], columns?: string[]): GridData {
  const names = columns ?? (rows[0] ? Object.keys(rows[0]) : []);
  return {
    meta: names.map((name) => ({ name, type: inferType(rows, name) })),
    data: rows.map((row) => names.map((name) => row[name])),
  };
}

/** Back from positional rows to row objects, for the exporters. */
export function gridToRows(meta: ColumnMeta[], data: unknown[][]): DataRow[] {
  return data.map((row) => {
    const out: DataRow = {};
    meta.forEach((column, i) => {
      out[column.name] = row[i];
    });
    return out;
  });
}

function inferType(rows: DataRow[], name: string): string {
  for (const row of rows) {
    const value = row[name];
    if (value === null || value === undefined) continue;
    if (typeof value === "number" || typeof value === "bigint") return "DOUBLE";
    if (typeof value === "boolean") return "BOOLEAN";
    if (value instanceof Date) return "TIMESTAMP";
    if (typeof value === "object") return "JSON";
    return "VARCHAR";
  }
  return "VARCHAR";
}
