import type * as duckdb from "@duckdb/duckdb-wasm";
import { getSetting } from "@/services/persistence/repositories/settingsRepository";

/**
 * Remote files read in ranges, through the httpfs extension.
 *
 * DuckDB-WASM's built-in HTTP layer misreads the one-byte probe it sends to
 * check for range support, decides the server has none, and downloads every
 * remote file whole (duckdb/duckdb-wasm#2228). The httpfs extension reads
 * only the byte ranges a query needs: a query on a database of parquet views
 * went from 27 MB to 2 MB (#75). It costs a 500 kB extension download, which
 * the browser caches.
 *
 * Preferred unless the profile turned it off. A local engine applies the
 * preference to its statement connection before the next query runs.
 */
let preferred = true;

export const setRangeReadsPreferred = (value: boolean): void => {
  preferred = value;
};

export const rangeReadsPreferred = (): boolean => preferred;

/** Settings key, under the "duckdb" category. */
export const RANGE_READS_SETTING = "range_reads";

/** Reads a profile's preference. On unless it was turned off. */
export async function loadRangeReadsPreference(profileId: string): Promise<void> {
  try {
    const raw = await getSetting(profileId, "duckdb", RANGE_READS_SETTING);
    setRangeReadsPreferred(raw === null || JSON.parse(raw) !== false);
  } catch {
    setRangeReadsPreferred(true);
  }
}

/**
 * Switches a connection between httpfs and the built-in HTTP layer. Returns
 * what is in effect afterwards: false when httpfs could not be loaded
 * (offline, blocked), in which case the built-in layer stays and still works.
 */
export async function applyRangeReads(
  connection: duckdb.AsyncDuckDBConnection,
  enabled: boolean
): Promise<boolean> {
  if (!enabled) {
    try {
      await connection.query("SET builtin_httpfs = true");
    } catch {
      // Nothing was switched on this connection.
    }
    return false;
  }
  try {
    // Loaded before the switch, so a failed load never leaves the engine
    // with no HTTP layer at all.
    await connection.query("INSTALL httpfs");
    await connection.query("LOAD httpfs");
    await connection.query("SET builtin_httpfs = false");
    return true;
  } catch (error) {
    console.warn("[DuckDB] httpfs unavailable, remote files are downloaded whole:", error);
    await connection.query("SET builtin_httpfs = true").catch(() => {});
    return false;
  }
}

/**
 * The error httpfs raises when a server ignores the Range header and sends
 * the whole file. Such a server works with `force_download`.
 */
export const isRangeUnsupportedError = (message: string): boolean =>
  /Server sent back more data than expected/i.test(message);

/**
 * Whether `sql` is one statement, so re-running it cannot repeat an earlier
 * one: a `;` outside quotes and comments, other than a trailing one, means
 * more. Not the editor's splitter, whose import pulls the editor chunk into
 * the startup bundle.
 */
export function isSingleStatement(sql: string): boolean {
  let quote: string | null = null;
  let seenEnd = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (quote) {
      if (sql.startsWith(quote, i)) {
        i += quote.length - 1;
        quote = null;
      }
      continue;
    }
    if (ch === "'" || ch === '"') quote = ch;
    else if (sql.startsWith("$$", i)) {
      quote = "$$";
      i++;
    } else if (sql.startsWith("--", i)) quote = "\n";
    else if (sql.startsWith("/*", i)) {
      quote = "*/";
      i++;
    } else if (ch === ";") seenEnd = true;
    else if (seenEnd && !/\s/.test(ch)) return false;
  }
  return true;
}
