import { formatTimestampUTC } from "@/lib/datetime";
import {
  DEFAULT_COLUMN_WIDTH,
  DEFAULT_MAX_AUTO_WIDTH,
  DEFAULT_MIN_AUTO_WIDTH,
  DEFAULT_SAMPLE_SIZE,
} from "./constants";
import type { DataRow, FilterRow } from "./types";

export const globalFilterFn = (row: FilterRow, columnId: string, value: unknown): boolean => {
  const cellValue = row.getValue(columnId);
  if (cellValue === null || cellValue === undefined) return false;
  const searchStr = String(cellValue).toLowerCase();
  const filterValue = String(value).toLowerCase();
  return searchStr.includes(filterValue);
};

// Safe JSON stringify that handles BigInt and Date
export const safeStringify = (value: unknown): string => {
  if (value === null || value === undefined) return "null";
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return formatTimestampUTC(value);
  if (typeof value === "object") {
    try {
      return JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v));
    } catch {
      return String(value);
    }
  }
  return String(value);
};

// Calculate optimal column width based on content
export const calculateOptimalWidth = (
  data: DataRow[],
  columnKey: string,
  minWidth: number = DEFAULT_MIN_AUTO_WIDTH,
  maxWidth: number = DEFAULT_MAX_AUTO_WIDTH,
  sampleSize: number = DEFAULT_SAMPLE_SIZE
): number => {
  if (!data.length) return DEFAULT_COLUMN_WIDTH;

  // Sample data for performance
  const sample = data.slice(0, Math.min(sampleSize, data.length));

  // Calculate based on content length
  let maxLength = columnKey.length; // Start with header length

  sample.forEach((row) => {
    const value = row[columnKey];
    const strValue = safeStringify(value);
    maxLength = Math.max(maxLength, strValue.length);
  });

  // Rough estimation: 8px per character + padding
  const estimatedWidth = Math.max(minWidth, Math.min(maxWidth, maxLength * 8 + 20));

  return estimatedWidth;
};
