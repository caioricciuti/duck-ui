import { sqlEscapeIdentifier, sqlEscapeString } from "@/lib/sqlSanitize";
import type { CsvImportOptions, SchemaColumn } from "./types";

/**
 * SQL text for the import flows, kept free of state so every piece that goes
 * into a statement is escaped in one place and can be tested as plain text.
 */

const quoted = (value: string): string => `'${sqlEscapeString(value)}'`;

const textOption = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

const countOption = (value: unknown, min: number): number | null => {
  const count = typeof value === "string" ? Number(value) : value;
  return typeof count === "number" && Number.isInteger(count) && count >= min ? count : null;
};

/**
 * The option list of a `read_csv` call, from what the importer collected.
 *
 * Anything left empty is left out, so DuckDB's own default or its sniffer
 * decides, exactly as before these options were passed through.
 */
export function buildCsvReadOptions(csv: Partial<CsvImportOptions> = {}): string {
  // The options arrive untyped from the store, so a flag is only ever
  // written as the literal true or false.
  const flag = (value: unknown, fallback: boolean): boolean =>
    typeof value === "boolean" ? value : fallback;
  const delimiter = textOption(csv.delimiter) ?? ",";

  const options = [
    `header=${flag(csv.header, true)}`,
    `auto_detect=${flag(csv.autoDetect, true)}`,
    `all_varchar=${flag(csv.allVarchar, false)}`,
    `ignore_errors=${flag(csv.ignoreErrors, true)}`,
    `null_padding=${flag(csv.nullPadding, true)}`,
    `delim=${quoted(delimiter)}`,
  ];

  const quote = textOption(csv.quote);
  if (quote) options.push(`quote=${quoted(quote)}`);
  const escape = textOption(csv.escape);
  if (escape) options.push(`escape=${quoted(escape)}`);
  const skip = countOption(csv.skip, 1);
  if (skip !== null) options.push(`skip=${skip}`);
  const sampleSize = countOption(csv.sampleSize, 1);
  if (sampleSize !== null) options.push(`sample_size=${sampleSize}`);
  const nullStr = textOption(csv.nullStr);
  if (nullStr) options.push(`nullstr=${quoted(nullStr)}`);
  const dateFormat = textOption(csv.dateFormat);
  if (dateFormat) options.push(`dateformat=${quoted(dateFormat)}`);
  const timestampFormat = textOption(csv.timestampFormat);
  if (timestampFormat) options.push(`timestampformat=${quoted(timestampFormat)}`);

  return options.join(", ");
}

/**
 * The table function reading a remote or staged file, or null when the
 * extension is not one the URL import handles.
 */
export function buildReadExpression(
  source: string,
  extension: string | undefined,
  options: { ignoreErrors?: boolean } = {}
): string | null {
  const file = quoted(source);
  const ignore = options.ignoreErrors ? ", ignore_errors=true" : "";
  switch (extension) {
    case "csv":
      return `read_csv(${file}, auto_detect=true${ignore}, header=true)`;
    case "json":
      return `read_json(${file}, auto_detect=true${ignore})`;
    case "parquet":
      return `read_parquet(${file})`;
    default:
      return null;
  }
}

/** Type names as DuckDB writes them: `BIGINT`, `DECIMAL(18, 3)`, `VARCHAR[]`. */
const TYPE_PATTERN = /^[A-Za-z][A-Za-z0-9_ ]*(\(\s*\d+(\s*,\s*\d+)?\s*\))?(\[\d*\])*$/;

const castType = (type: string): string => {
  const trimmed = type.trim();
  if (!TYPE_PATTERN.test(trimmed)) throw new Error(`Unsupported column type: ${type}`);
  return trimmed;
};

/**
 * The select list for the schema editor's choices: excluded columns are left
 * out, renamed ones aliased, and a changed type becomes a CAST.
 *
 * Returns `*` when nothing was customized, so an untouched import reads the
 * file exactly as the sniffer saw it.
 */
export function buildColumnSelection(columns: SchemaColumn[]): string {
  const typeChanged = (column: SchemaColumn): boolean =>
    column.originalType !== undefined && column.type !== column.originalType;
  const nameOf = (column: SchemaColumn): string => column.newName.trim() || column.originalName;

  const included = columns.filter((column) => column.included);
  const customized = columns.some(
    (column) => !column.included || nameOf(column) !== column.originalName || typeChanged(column)
  );
  if (!customized || included.length === 0) return "*";

  return included
    .map((column) => {
      const source = sqlEscapeIdentifier(column.originalName);
      const name = nameOf(column);
      if (typeChanged(column)) {
        return `CAST(${source} AS ${castType(column.type)}) AS ${sqlEscapeIdentifier(name)}`;
      }
      return name !== column.originalName ? `${source} AS ${sqlEscapeIdentifier(name)}` : source;
    })
    .join(", ");
}

/** `CREATE OR REPLACE TABLE|VIEW "name" AS <query>`. */
export function buildCreateAs(
  createType: "TABLE" | "VIEW",
  tableName: string,
  query: string
): string {
  return `CREATE OR REPLACE ${createType} ${sqlEscapeIdentifier(tableName.trim())} AS ${query}`;
}
