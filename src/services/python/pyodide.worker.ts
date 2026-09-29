/**
 * Pyodide worker — hosts one Python interpreter for one notebook.
 *
 * Loaded lazily by `PythonKernel` on the first Python run. Pyodide itself is
 * fetched from the configured base URL at that point, never bundled. See
 * `protocol.ts` for the message flow and the synchronous `sql()` bridge.
 */

import { packagesForCode } from "./packages";
import { PYTHON_PRELUDE } from "./prelude";
import {
  CONTROL_STATE,
  STATE_PENDING,
  STATE_SIZED,
  copyPayloadOut,
  createControlBuffer,
  readPayloadHeader,
  type MainToWorkerMessage,
  type SqlPayload,
  type WorkerToMainMessage,
} from "./protocol";

interface PyCallable {
  (...args: unknown[]): unknown;
  destroy?: () => void;
}

interface PackageLoadOptions {
  messageCallback?: (message: string) => void;
  errorCallback?: (message: string) => void;
}

interface Pyodide {
  version: string;
  runPython(code: string): unknown;
  loadPackage(names: string | string[], options?: PackageLoadOptions): Promise<unknown>;
  loadPackagesFromImports(code: string, options?: PackageLoadOptions): Promise<unknown>;
  registerJsModule(name: string, module: object): void;
  setStdout(options: { batched: (text: string) => void }): void;
  setStderr(options: { batched: (text: string) => void }): void;
  globals: { get(name: string): PyCallable };
}

type LoadPyodide = (options: { indexURL: string }) => Promise<Pyodide>;

interface WorkerScope {
  postMessage(message: WorkerToMainMessage): void;
  onmessage: ((event: MessageEvent<MainToWorkerMessage>) => void) | null;
  importScripts?: (...urls: string[]) => void;
  loadPyodide?: LoadPyodide;
  crossOriginIsolated?: boolean;
}

const scope = self as unknown as WorkerScope;
const post = (message: WorkerToMainMessage) => scope.postMessage(message);

let pyodide: Pyodide | null = null;
let initializing: Promise<Pyodide> | null = null;
let currentRunId: string | null = null;
let figureCap = 10;
let arrowAvailable = false;
let requestCounter = 0;
const asyncSqlReplies = new Map<string, (payload: SqlPayload) => void>();

const syncAvailable =
  typeof SharedArrayBuffer !== "undefined" && scope.crossOriginIsolated === true;

/**
 * Classic workers (production build) use importScripts on `pyodide.js`;
 * module workers (dev server) cannot, and throw TypeError, so they import
 * `pyodide.mjs` instead. A network failure is not a TypeError and surfaces.
 */
const loadRuntime = async (baseUrl: string): Promise<LoadPyodide> => {
  try {
    if (!scope.importScripts) throw new TypeError("importScripts unavailable");
    scope.importScripts(`${baseUrl}pyodide.js`);
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    // A runtime URL: the bundler must leave this import alone.
    const moduleUrl: string = `${baseUrl}pyodide.mjs`;
    const module = (await import(/* @vite-ignore */ moduleUrl)) as {
      loadPyodide: LoadPyodide;
    };
    return module.loadPyodide;
  }
  if (!scope.loadPyodide) throw new Error(`${baseUrl}pyodide.js did not define loadPyodide`);
  return scope.loadPyodide;
};

const sqlSync = (query: string, prefer: "arrow" | "json"): SqlPayload => {
  const control = createControlBuffer();
  const view = new Int32Array(control);
  const requestId = `sql-${++requestCounter}`;
  post({ type: "sql", requestId, sql: query, prefer, control });
  Atomics.wait(view, CONTROL_STATE, STATE_PENDING);

  const header = readPayloadHeader(control);
  if (header.ready) return { format: header.format, bytes: new Uint8Array(0), truncated: false };

  const buffer = new SharedArrayBuffer(header.length);
  post({ type: "sql-fetch", requestId, buffer });
  Atomics.wait(view, CONTROL_STATE, STATE_SIZED);
  return { format: header.format, bytes: copyPayloadOut(buffer), truncated: header.truncated };
};

const sqlAsync = (query: string, prefer: "arrow" | "json"): Promise<SqlPayload> =>
  new Promise((resolve) => {
    const requestId = `sql-${++requestCounter}`;
    asyncSqlReplies.set(requestId, resolve);
    post({ type: "sql", requestId, sql: query, prefer });
  });

const init = (baseUrl: string): Promise<Pyodide> => {
  if (!initializing) {
    initializing = (async () => {
      const loadPyodide = await loadRuntime(baseUrl);
      const py = await loadPyodide({ indexURL: baseUrl });
      const stream = (name: "stdout" | "stderr") => (text: string) => {
        if (currentRunId) post({ type: "stream", runId: currentRunId, name, text: `${text}\n` });
      };
      py.setStdout({ batched: stream("stdout") });
      py.setStderr({ batched: stream("stderr") });
      py.registerJsModule("_duckui_bridge", {
        sql_sync: sqlSync,
        sql_async: sqlAsync,
        sync_available: syncAvailable,
        arrow_available: () => arrowAvailable,
      });
      py.runPython(PYTHON_PRELUDE);
      pyodide = py;
      return py;
    })();
  }
  return initializing;
};

/** pandas + pyarrow for `sql()`. pyarrow is optional: without it, results travel as JSON. */
const ensureDataPackages = async (py: Pyodide, status: (message: string) => void) => {
  await py.loadPackage(["pandas"], { messageCallback: status, errorCallback: status });
  if (!arrowAvailable) {
    try {
      await py.loadPackage(["pyarrow"], { messageCallback: status, errorCallback: status });
    } catch {
      // Checked below either way.
    }
    arrowAvailable =
      py.runPython("import importlib.util as _u; _u.find_spec('pyarrow') is not None") === true;
  }
};

const run = async (runId: string, code: string, rowCap: number) => {
  currentRunId = runId;
  const status = (message: string) => post({ type: "status", runId, message });
  try {
    const py = pyodide;
    if (!py) throw new Error("Python runtime is not initialized");
    await py.loadPackagesFromImports(code, { messageCallback: status, errorCallback: status });
    if (packagesForCode(code).length > 0) await ensureDataPackages(py, status);
    status("Running…");
    const runner = py.globals.get("_duckui_run");
    try {
      const json = (await runner(code, rowCap, figureCap)) as string;
      post({ type: "result", runId, output: JSON.parse(json) });
    } finally {
      runner.destroy?.();
    }
  } catch (error) {
    post({
      type: "result",
      runId,
      output: { error: error instanceof Error ? error.message : String(error) },
    });
  } finally {
    currentRunId = null;
  }
};

scope.onmessage = (event) => {
  const message = event.data;
  switch (message.type) {
    case "init":
      figureCap = message.figureCap;
      init(message.baseUrl).then(
        (py) => post({ type: "ready", version: py.version, syncSql: syncAvailable }),
        (error: unknown) =>
          post({
            type: "init-error",
            message: error instanceof Error ? error.message : String(error),
          })
      );
      break;
    case "run":
      void run(message.runId, message.code, message.rowCap);
      break;
    case "sql-result": {
      const reply = asyncSqlReplies.get(message.requestId);
      asyncSqlReplies.delete(message.requestId);
      reply?.(message.payload);
      break;
    }
  }
};
