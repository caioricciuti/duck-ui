import { sqlEscapeIdentifier, sqlEscapeString } from "@/lib/sqlSanitize";
import { splitStatements } from "@/lib/editor/statements";
import { getDisplayType } from "@/lib/utils/column-types";
import type { ColumnFilter, ResultSort } from "@/lib/utils/result-filters";
import type { ColumnMeta } from "@/lib/types/query";

/**
 * Sorting and filtering in the engine.
 *
 * A result that hit the row cap holds only the first rows of the answer.
 * Sorting or filtering those in memory gives a wrong answer that looks right:
 * "the largest order" would be the largest among the first rows only. For
 * such a result the query is wrapped and run again, so DuckDB sorts and
 * filters the whole answer.
 */

const NUMBER = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;
const COMPARISON = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" } as const;

const literal = (value: string): string => `'${sqlEscapeString(value)}'`;

function filterToSql(filter: ColumnFilter, columnType: string): string {
  const column = sqlEscapeIdentifier(filter.column);
  const asText = `CAST(${column} AS VARCHAR)`;

  switch (filter.operator) {
    case "isNull":
      return `${column} IS NULL`;
    case "isNotNull":
      return `${column} IS NOT NULL`;
    case "contains":
      return `contains(lower(${asText}), lower(${literal(filter.value)}))`;
    case "notContains":
      // A NULL contains nothing, so it passes, the way it does in memory.
      return `(${column} IS NULL OR NOT contains(lower(${asText}), lower(${literal(filter.value)})))`;
  }

  const operator = COMPARISON[filter.operator];
  const display = getDisplayType(columnType);
  if (display === "number" && NUMBER.test(filter.value)) {
    return `${column} ${operator} ${filter.value}`;
  }
  if (display === "bool" && (filter.operator === "eq" || filter.operator === "neq")) {
    return `${column} ${operator} ${/^(true|1)$/i.test(filter.value) ? "true" : "false"}`;
  }
  // Text comparison for everything else. A date compared as text works
  // because DuckDB prints dates in ISO order.
  return `${asText} ${operator} ${literal(filter.value)}`;
}

/**
 * True when the SQL can be used as a subquery: one statement that starts
 * with SELECT, WITH, FROM, VALUES or TABLE. Anything else, such as a PRAGMA
 * or a statement that changes data, is left to in-memory filtering.
 */
export function isWrappableQuery(sql: string): boolean {
  const statements = splitStatements(sql);
  if (statements.length !== 1) return false;
  const body = statements[0].text.replace(/^(\s*(--[^\n]*\n|\/\*[\s\S]*?\*\/))*\s*/, "");
  return /^(SELECT|WITH|FROM|VALUES|TABLE)\b/i.test(body);
}

export function buildFilteredQuery(
  sql: string,
  meta: ColumnMeta[],
  filters: ColumnFilter[],
  sort: ResultSort | null
): string {
  const typeOf = (column: string) => meta.find((c) => c.name === column)?.type ?? "VARCHAR";
  const source = splitStatements(sql)[0]?.text ?? sql;
  const where = filters.map((filter) => filterToSql(filter, typeOf(filter.column)));

  let wrapped = `SELECT * FROM (\n${source}\n) AS __duck_ui_result`;
  if (where.length > 0) wrapped += `\nWHERE ${where.join("\n  AND ")}`;
  if (sort) {
    wrapped += `\nORDER BY ${sqlEscapeIdentifier(sort.column)} ${sort.dir === "asc" ? "ASC" : "DESC"} NULLS LAST`;
  }
  return wrapped;
}
