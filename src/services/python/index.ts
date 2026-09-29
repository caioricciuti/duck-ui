/**
 * Python cells — app-facing entry point.
 *
 * Nothing here loads Pyodide: `kernelForNotebook` only builds a kernel
 * object. The worker (and with it the Pyodide download) starts on the first
 * `run()`.
 */

import type { QueryExecution, QueryRequest } from "@/services/engine";
import { resolvePyodideBaseUrl } from "./config";
import { getPythonKernel, PythonKernel } from "./kernel";
import { runSqlForPython } from "./marshal";

export { disposePythonKernel, peekPythonKernel, PythonKernel } from "./kernel";
export { PYODIDE_VERSION } from "./config";

interface KernelDeps {
  /** The session `sql()` runs on — read at call time, so it follows connection switches. */
  getSession: () => { execute: (request: QueryRequest) => QueryExecution } | null | undefined;
  getMaxRows: () => number | undefined;
}

const createPyodideWorker = () =>
  new Worker(new URL("./pyodide.worker.ts", import.meta.url), { type: "module" });

export const kernelForNotebook = (tabId: string, deps: KernelDeps): PythonKernel =>
  getPythonKernel(
    tabId,
    () =>
      new PythonKernel({
        createWorker: createPyodideWorker,
        baseUrl: resolvePyodideBaseUrl(window.env?.DUCK_UI_PYODIDE_BASE_URL, document.baseURI),
        runSql: (sql, prefer) => runSqlForPython(deps.getSession(), sql, prefer, deps.getMaxRows()),
      })
  );
