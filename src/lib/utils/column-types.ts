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

const INTEGER_TYPE = /^(U?INT(8|16|32|64)?|U?(TINY|SMALL|BIG|HUGE)INT|INTEGER)\b/;
const IDENTIFIER_WORDS = new Set(["id", "uid", "pk", "year", "yr", "zip", "zipcode", "postcode"]);

/**
 * Whether the grid may print a column's numbers with thousands separators.
 * Integer columns named like an id, a year or a postal code are labels, not
 * quantities: `4,999` for an id or `2,024` for a year reads wrong. The name
 * is split on snake_case, kebab-case, spaces and camelCase, so `user_id`,
 * `userId`, `ID` and `year_built` all count.
 */
export function groupsDigits(columnName: string, columnType: string): boolean {
  if (!INTEGER_TYPE.test(columnType.trim().toUpperCase())) return true;
  const words = columnName
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/);
  return !words.some((word) => IDENTIFIER_WORDS.has(word));
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
