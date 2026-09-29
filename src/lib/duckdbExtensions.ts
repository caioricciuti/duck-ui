/**
 * SQL and row handling for the extension manager. The store runs these
 * through the active session; nothing here touches an engine.
 */

export interface ExtensionInfo {
  name: string;
  loaded: boolean;
  installed: boolean;
  description: string;
}

export type ExtensionAction = "install" | "load";

export const LIST_EXTENSIONS_SQL =
  "SELECT extension_name, loaded, installed, description FROM duckdb_extensions() ORDER BY extension_name";

/** DuckDB reports booleans as JS booleans over Arrow, but as strings over JSON transports. */
const toBool = (value: unknown): boolean =>
  value === true || value === 1 || (typeof value === "string" && value.toLowerCase() === "true");

export const parseExtensionRows = (rows: Record<string, unknown>[]): ExtensionInfo[] =>
  rows
    .filter((row) => typeof row.extension_name === "string" && row.extension_name)
    .map((row) => ({
      name: row.extension_name as string,
      loaded: toBool(row.loaded),
      installed: toBool(row.installed),
      description: typeof row.description === "string" ? row.description : "",
    }));

/**
 * Extension names come from `duckdb_extensions()`, but they are still spliced
 * into SQL — accept only the plain identifiers DuckDB itself uses.
 */
export const isValidExtensionName = (name: string): boolean => /^[A-Za-z0-9_]+$/.test(name);

export const buildExtensionSql = (action: ExtensionAction, name: string): string => {
  if (!isValidExtensionName(name)) throw new Error(`Invalid extension name: ${name}`);
  return `${action === "install" ? "INSTALL" : "LOAD"} ${name}`;
};

/**
 * Whether an INSTALL/LOAD error means "this build has no such binary" (a 404
 * from the extension repository, which is how DuckDB-WASM reports an
 * extension that isn't compiled for WASM) rather than a transient failure.
 */
export const isUnavailableExtensionError = (message: string): boolean =>
  /\b404\b|not found|not available|no such file|could not be found|is not a known extension/i.test(
    message
  );
