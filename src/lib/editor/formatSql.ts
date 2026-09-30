/**
 * Formats with the DuckDB dialect. Returns the input unchanged when the
 * formatter cannot parse it, so a half-written query is never mangled.
 *
 * The formatter is fetched on first use: it is large, and most queries are
 * run without ever being formatted.
 */
export async function formatSql(sql: string): Promise<string> {
  try {
    const { format } = await import("sql-formatter");
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
