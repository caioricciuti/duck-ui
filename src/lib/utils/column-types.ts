import { formatTimestampUTC } from "@/lib/datetime";

/** Display categories for cell rendering. */
export type DisplayType = "number" | "string" | "date" | "bool" | "json" | "null" | "unknown";

/**
 * Maps a column type label to a display category. Labels come in two
 * dialects: Arrow type strings from the WASM engine (`Int32`, `Utf8`,
 * `Timestamp<MICROSECOND>`, `Decimal[18e+2]`) and DuckDB SQL names from HTTP
 * connections (`BIGINT`, `VARCHAR`, `TIMESTAMP WITH TIME ZONE`).
 */
export function getDisplayType(columnType: string): DisplayType {
  const t = columnType.trim().toUpperCase();

  if (/^(LIST|LARGELIST|FIXEDSIZELIST|STRUCT|MAP|UNION|ARRAY|JSON)\b/.test(t) || /\[\]$/.test(t)) {
    return "json";
  }
  if (
    /^(U?INT(8|16|32|64)?|U?(TINY|SMALL|BIG|HUGE)INT|INTEGER|FLOAT(16|32|64|4|8)?|DOUBLE|REAL|DECIMAL|NUMERIC|VARINT|BIGNUM)\b/.test(
      t
    )
  ) {
    return "number";
  }
  if (/^(DATE|DATETIME|TIMESTAMP|TIMESTAMPTZ|TIME|TIMETZ|INTERVAL)/.test(t)) return "date";
  if (/^(BOOL|BOOLEAN)\b/.test(t)) return "bool";
  if (
    /^(UTF8|LARGEUTF8|VARCHAR|CHAR|BPCHAR|TEXT|STRING|UUID|ENUM|DICTIONARY|BLOB|BINARY|LARGEBINARY|BIT|GEOMETRY)\b/.test(
      t
    )
  ) {
    return "string";
  }
  return "unknown";
}

/** Numbers are right-aligned so digits line up. */
export function isRightAligned(columnType: string): boolean {
  return getDisplayType(columnType) === "number";
}

/**
 * Text form of a cell, as shown in the grid and used for comparison, copy and
 * export. Timestamps print in UTC the way DuckDB prints them.
 */
export function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return formatTimestampUTC(value);
  if (typeof value === "object") {
    try {
      return JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v)) ?? "";
    } catch {
      return String(value);
    }
  }
  return String(value);
}
