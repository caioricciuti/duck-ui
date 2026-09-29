import { format } from "sql-formatter";

/**
 * Formats with the DuckDB dialect. Returns the input unchanged when the
 * formatter cannot parse it, so a half-written query is never mangled.
 */
export function formatSql(sql: string): string {
  try {
    return format(sql, {
      language: "duckdb",
      keywordCase: "upper",
      indentStyle: "standard",
      linesBetweenQueries: 2,
    });
  } catch {
    return sql;
  }
}
