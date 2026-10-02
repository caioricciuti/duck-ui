import { sqlEscapeIdentifier, sqlEscapeString } from "@/lib/sqlSanitize";
import type { SharedParam } from "./index";

/** What a viewer typed or picked for one embed filter. */
export type FilterValue =
  | { kind: "select"; value: string }
  | { kind: "search"; value: string }
  | { kind: "range"; min: string; max: string };

/** Filter values by result column. Columns with no entry are not filtered. */
export type FilterValues = Record<string, FilterValue>;

/** How many distinct values a dropdown offers before it stops listing. */
export const SELECT_OPTION_LIMIT = 500;

/** The shared SQL as a subquery body: no trailing semicolons. */
function subqueryBody(sql: string): string {
  return sql.trim().replace(/;+\s*$/, "");
}

/** A LIKE pattern fragment where `%` and `_` in the text match themselves. */
function likeFragment(text: string): string {
  return sqlEscapeString(text.replace(/[\\%_]/g, (c) => `\\${c}`));
}

/** A numeric literal for the SQL text, or null when the input is not a number. */
function numericLiteral(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? String(n) : null;
}

/** The WHERE conditions a set of filter values adds, one per active filter. */
export function filterConditions(params: SharedParam[], values: FilterValues): string[] {
  const conditions: string[] = [];
  for (const param of params) {
    const value = values[param.column];
    if (!value) continue;
    const column = sqlEscapeIdentifier(param.column);
    if (value.kind === "select" && value.value !== "") {
      conditions.push(`CAST(${column} AS VARCHAR) = '${sqlEscapeString(value.value)}'`);
    } else if (value.kind === "search" && value.value.trim() !== "") {
      conditions.push(
        `CAST(${column} AS VARCHAR) ILIKE '%${likeFragment(value.value.trim())}%' ESCAPE '\\'`
      );
    } else if (value.kind === "range") {
      const min = numericLiteral(value.min);
      const max = numericLiteral(value.max);
      if (min !== null) conditions.push(`${column} >= ${min}`);
      if (max !== null) conditions.push(`${column} <= ${max}`);
    }
  }
  return conditions;
}

/**
 * The shared query with the viewer's filters wrapped around it, so they
 * apply to the result's columns whatever the query does inside (JOINs,
 * CTEs, GROUP BY). Without active filters the query runs as shared.
 */
export function buildFilteredSql(sql: string, params: SharedParam[], values: FilterValues): string {
  const conditions = filterConditions(params, values);
  if (conditions.length === 0) return sql;
  return `SELECT * FROM (\n${subqueryBody(sql)}\n) AS _embed WHERE ${conditions.join(" AND ")}`;
}

/** The query behind a dropdown: the column's distinct values, as text, sorted. */
export function distinctValuesSql(
  sql: string,
  column: string,
  limit = SELECT_OPTION_LIMIT
): string {
  const ident = sqlEscapeIdentifier(column);
  return (
    `SELECT DISTINCT CAST(${ident} AS VARCHAR) AS value FROM (\n${subqueryBody(sql)}\n) AS _embed ` +
    `WHERE ${ident} IS NOT NULL ORDER BY 1 LIMIT ${Math.max(1, Math.floor(limit))}`
  );
}
