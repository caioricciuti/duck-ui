/**
 * Worker-side run preparation. Kept separate from `marshal.ts` so the worker
 * bundle does not pull in the query engine.
 */

const SQL_CALL = /(^|[^\w.])sql(_async)?\s*\(/m;

/**
 * Packages a run needs beyond what `loadPackagesFromImports` finds. The `sql`
 * helper imports pandas/pyarrow inside a function, which import scanning
 * cannot see — so a cell that only calls `sql(...)` must have them loaded up
 * front.
 */
export const packagesForCode = (code: string): string[] =>
  SQL_CALL.test(code) ? ["pandas", "pyarrow"] : [];
