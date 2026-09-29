/** Human-readable engine time: "12 ms" under a second, "1.25 s" above. */
export function formatQueryTime(durationMs: number): string {
  return durationMs < 1000
    ? `${Math.max(0, Math.round(durationMs))} ms`
    : `${(durationMs / 1000).toFixed(2)} s`;
}

/** Message for a query that succeeded but returned no rows. */
export function zeroRowsMessage(durationMs?: number): string {
  const took = durationMs === undefined ? "" : ` (took ${formatQueryTime(durationMs)})`;
  return `Query ran fine, 0 rows returned${took}.`;
}
