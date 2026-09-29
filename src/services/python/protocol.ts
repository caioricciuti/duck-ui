/**
 * Message protocol between the notebook (main thread) and the Pyodide worker.
 *
 * The worker owns the Python interpreter; the main thread owns the database
 * session. Python's `sql()` therefore has to cross the boundary twice: the
 * worker asks, the main thread runs the query on the active connection and
 * sends the result back.
 *
 * `sql()` is synchronous in Python, which a plain postMessage round-trip
 * cannot be — the worker's event loop is blocked while Python runs. When the
 * page is cross-origin isolated (Duck-UI always serves COOP/COEP), the worker
 * blocks on `Atomics.wait` over a small SharedArrayBuffer instead:
 *
 *   worker                                main
 *   sql {control} ───────────────────────▶ runs query, keeps payload
 *   wait(control[STATE] == PENDING)        writes length/format, STATE=SIZED
 *   ◀──────────────────────────────────── notify
 *   sql-fetch {buffer(length)} ──────────▶ copies payload, STATE=READY
 *   wait(control[STATE] == SIZED)
 *   ◀──────────────────────────────────── notify
 *
 * Two hops because the payload size is unknown until the query finishes and a
 * blocked worker cannot receive a message carrying a new buffer. Without
 * isolation only `await sql_async(...)` works, over a normal reply message.
 */

/** How query results are encoded for Python. */
export type SqlPayloadFormat = "arrow" | "json" | "error";

export interface SqlPayload {
  format: SqlPayloadFormat;
  /** Arrow IPC stream, UTF-8 JSON (columnar), or a UTF-8 error message. */
  bytes: Uint8Array;
  /** The engine's row cap cut the result short. */
  truncated: boolean;
}

/** Raw output of one run, as produced by the Python side (JSON-decoded). */
export interface RawRunOutput {
  /** repr() of the last expression, when it was not a DataFrame. */
  text?: string | null;
  /** A DataFrame result: `to_json(orient="split")` plus its dtypes. */
  table?: { json: string; dtypes: string[]; rowCount: number } | null;
  /** Base64 PNGs of open matplotlib figures. */
  images?: string[];
  /** Formatted traceback. */
  error?: string | null;
}

// ─── main → worker ───────────────────────────────────────────────────────────

export type MainToWorkerMessage =
  | { type: "init"; baseUrl: string; figureCap: number }
  | { type: "run"; runId: string; code: string; rowCap: number }
  /** Reply for the async (non-isolated) `sql_async` path. */
  | { type: "sql-result"; requestId: string; payload: SqlPayload };

// ─── worker → main ───────────────────────────────────────────────────────────

export type WorkerToMainMessage =
  | { type: "ready"; version: string; syncSql: boolean }
  | { type: "init-error"; message: string }
  | { type: "status"; runId: string | null; message: string }
  | { type: "stream"; runId: string; name: "stdout" | "stderr"; text: string }
  | { type: "result"; runId: string; output: RawRunOutput }
  | {
      type: "sql";
      requestId: string;
      sql: string;
      prefer: "arrow" | "json";
      /** Present for the synchronous path; absent for `sql_async`. */
      control?: SharedArrayBuffer;
    }
  | { type: "sql-fetch"; requestId: string; buffer: SharedArrayBuffer };

const WORKER_MESSAGE_TYPES = new Set([
  "ready",
  "init-error",
  "status",
  "stream",
  "result",
  "sql",
  "sql-fetch",
]);

/** Structural guard for anything arriving on the worker's message port. */
export const isWorkerMessage = (value: unknown): value is WorkerToMainMessage =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { type?: unknown }).type === "string" &&
  WORKER_MESSAGE_TYPES.has((value as { type: string }).type);

// ─── synchronous bridge over SharedArrayBuffer ───────────────────────────────

/** Int32 slots in the control buffer. */
export const CONTROL_STATE = 0;
export const CONTROL_LENGTH = 1;
export const CONTROL_FORMAT = 2;
export const CONTROL_TRUNCATED = 3;
export const CONTROL_SLOTS = 4;

export const STATE_PENDING = 0;
export const STATE_SIZED = 1;
export const STATE_READY = 2;

const FORMAT_CODES: Record<SqlPayloadFormat, number> = { arrow: 0, json: 1, error: 2 };
const FORMAT_NAMES: SqlPayloadFormat[] = ["arrow", "json", "error"];

export const createControlBuffer = (): SharedArrayBuffer =>
  new SharedArrayBuffer(CONTROL_SLOTS * Int32Array.BYTES_PER_ELEMENT);

/**
 * Main side, step one: announce the payload's size and format.
 * Returns true when the worker will follow up with `sql-fetch`; an empty
 * payload is complete as soon as it is announced.
 */
export const publishPayloadHeader = (control: SharedArrayBuffer, payload: SqlPayload): boolean => {
  const view = new Int32Array(control);
  const needsFetch = payload.bytes.byteLength > 0;
  view[CONTROL_LENGTH] = payload.bytes.byteLength;
  view[CONTROL_FORMAT] = FORMAT_CODES[payload.format];
  view[CONTROL_TRUNCATED] = payload.truncated ? 1 : 0;
  Atomics.store(view, CONTROL_STATE, needsFetch ? STATE_SIZED : STATE_READY);
  Atomics.notify(view, CONTROL_STATE);
  return needsFetch;
};

/** Main side, step two: copy the payload into the worker's buffer. */
export const publishPayloadBody = (
  control: SharedArrayBuffer,
  buffer: SharedArrayBuffer,
  payload: SqlPayload
): void => {
  new Uint8Array(buffer).set(payload.bytes);
  const view = new Int32Array(control);
  Atomics.store(view, CONTROL_STATE, STATE_READY);
  Atomics.notify(view, CONTROL_STATE);
};

/** Worker side: the announced header. */
export const readPayloadHeader = (
  control: SharedArrayBuffer
): { length: number; format: SqlPayloadFormat; truncated: boolean; ready: boolean } => {
  const view = new Int32Array(control);
  return {
    length: view[CONTROL_LENGTH],
    format: FORMAT_NAMES[view[CONTROL_FORMAT]] ?? "error",
    truncated: view[CONTROL_TRUNCATED] === 1,
    ready: Atomics.load(view, CONTROL_STATE) === STATE_READY,
  };
};

/**
 * Worker side: copies the shared payload into ordinary memory. TextDecoder and
 * Pyodide's buffer conversion refuse views over shared memory.
 */
export const copyPayloadOut = (buffer: SharedArrayBuffer): Uint8Array =>
  new Uint8Array(buffer).slice();
