/**
 * Where the Python runtime comes from.
 *
 * Pyodide is never bundled: it is ~10 MB of WASM plus a wheel per package,
 * fetched only when the first Python cell runs. By default it comes from the
 * official jsDelivr distribution at a pinned version (the lockfile, and so
 * every package version, is tied to the Pyodide release). Air-gapped
 * deployments point `DUCK_UI_PYODIDE_BASE_URL` at a self-hosted copy of the
 * same release's "full" distribution folder.
 */

/** Pinned Pyodide release. 0.29.x ships pandas 2.3, pyarrow 22 and matplotlib 3.8. */
export const PYODIDE_VERSION = "0.29.5";

export const DEFAULT_PYODIDE_BASE_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

/**
 * Resolves the configured base URL to an absolute folder URL ending in `/`.
 *
 * Relative values (`/pyodide/`) are resolved against the page, not the
 * worker: the worker lives under `assets/`, so resolving there would point
 * somewhere else entirely. Anything unparsable falls back to the default
 * rather than failing the first run with an opaque load error.
 */
export const resolvePyodideBaseUrl = (configured: string | undefined, pageUrl: string): string => {
  const value = configured?.trim();
  if (!value) return DEFAULT_PYODIDE_BASE_URL;
  try {
    const url = new URL(value, pageUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return DEFAULT_PYODIDE_BASE_URL;
    return url.href.endsWith("/") ? url.href : `${url.href}/`;
  } catch {
    return DEFAULT_PYODIDE_BASE_URL;
  }
};

/** Rows of a DataFrame result kept for the results table. */
export const PYTHON_TABLE_ROW_CAP = 1_000;

/** Characters of stdout/stderr kept per run; the rest is elided. */
export const PYTHON_STREAM_CHAR_CAP = 100_000;

/** Figures rendered per run. */
export const PYTHON_FIGURE_CAP = 10;

/** Wall-clock limit for one run: starts after Pyodide is up, includes package loading. */
export const PYTHON_RUN_TIMEOUT_MS = 5 * 60_000;
