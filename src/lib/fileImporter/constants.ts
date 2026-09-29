import type { CsvImportOptions } from "./types";

// Constants
export const ACCEPTED_FILE_TYPES = {
  "text/csv": [".csv"],
  "application/json": [".json"],
  "application/octet-stream": [".parquet", ".arrow", ".db", ".ddb"],
  "application/vnd.duckdb": [".duckdb", ".db", ".ddb"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
} as const;

export const MAX_FILE_SIZE = 3 * 1024 * 1024 * 1024; // 3GB
export const SUPPORTED_FILE_EXTENSIONS = [
  "csv",
  "json",
  "parquet",
  "arrow",
  "duckdb",
  "db",
  "ddb",
  "xlsx",
] as const;
export const MAX_CONCURRENT_UPLOADS = 3;
export const PREVIEW_ROW_LIMIT = 20;

// DuckDB types for schema customization
export const DUCKDB_TYPES = [
  "VARCHAR",
  "INTEGER",
  "BIGINT",
  "DOUBLE",
  "DECIMAL",
  "DATE",
  "TIMESTAMP",
  "BOOLEAN",
  "JSON",
  "BLOB",
] as const;

// Default CSV import options
export const DEFAULT_CSV_OPTIONS: CsvImportOptions = {
  ignoreErrors: true,
  nullPadding: true,
  allVarchar: false,
  header: true,
  delimiter: ",",
  autoDetect: true,
};
