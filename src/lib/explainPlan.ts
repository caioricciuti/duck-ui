/**
 * Pulls the plan text out of DuckDB's EXPLAIN / EXPLAIN ANALYZE result rows,
 * which come back as explain_key / explain_value pairs.
 */
export function extractPlanText(rows: Record<string, unknown>[]): string {
  const preferred =
    rows.find((row) => row["explain_key"] === "analyzed_plan") ??
    rows.find((row) => row["explain_key"] === "physical_plan");
  if (preferred) return String(preferred["explain_value"] ?? "");
  return rows.map((row) => String(row["explain_value"] ?? "")).join("\n");
}
