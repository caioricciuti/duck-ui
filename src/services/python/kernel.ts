/**
 * Main-thread side of a Python kernel: owns one Pyodide worker, queues runs,
 * answers the worker's `sql()` requests, and restarts the worker on interrupt.
 *
 * A running Python program cannot be cancelled cooperatively — it may be deep
 * in a C extension or blocked on `sql()`. Interrupt therefore terminates the
 * worker outright; the next run creates a fresh one. Variables defined by
 * earlier cells are lost, which the error message says plainly.
 *
 * The worker is injected (`createWorker`), so this whole module is testable
 * with a fake — no Pyodide, no real Worker.
 */

import {
  PYTHON_FIGURE_CAP,
  PYTHON_RUN_TIMEOUT_MS,
  PYTHON_STREAM_CHAR_CAP,
  PYTHON_TABLE_ROW_CAP,
} from "./config";
import { appendCapped, errorPayload, toCellOutput } from "./marshal";
import {
  isWorkerMessage,
  publishPayloadBody,
  publishPayloadHeader,
  type MainToWorkerMessage,
  type RawRunOutput,
  type SqlPayload,
  type WorkerToMainMessage,
} from "./protocol";
import type { PythonCellOutput } from "@/store/types";

/** The subset of `Worker` the kernel uses. */
export interface WorkerLike {
  postMessage(message: unknown): void;
  terminate(): void;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
}

export interface PythonKernelOptions {
  createWorker: () => WorkerLike;
  runSql: (sql: string, prefer: "arrow" | "json") => Promise<SqlPayload>;
  baseUrl: string;
  timeoutMs?: number;
  rowCap?: number;
  figureCap?: number;
  streamCap?: number;
  now?: () => number;
}

export interface RunCallbacks {
  /** Loading/progress messages ("Loading pandas…"). */
  onStatus?: (message: string) => void;
  /** Called as stdout/stderr arrive, with the accumulated text so far. */
  onStream?: (streams: { stdout: string; stderr: string }) => void;
}

export const INTERRUPTED_MESSAGE =
  "Interrupted. The Python kernel was restarted; variables from earlier cells are gone.";

export const timeoutMessage = (ms: number): string =>
  `Timed out after ${Math.round(ms / 1000)}s. The Python kernel was restarted; variables from earlier cells are gone.`;

class KernelStopped extends Error {}

interface ActiveRun {
  runId: string;
  callbacks: RunCallbacks;
  streams: { stdout: string; stderr: string };
  resolve: (output: RawRunOutput) => void;
  reject: (error: Error) => void;
}

let runCounter = 0;

export class PythonKernel {
  private readonly options: Required<Omit<PythonKernelOptions, "now">> & { now: () => number };
  private worker: WorkerLike | null = null;
  private ready: Promise<void> | null = null;
  private rejectReady: ((error: Error) => void) | null = null;
  private active: ActiveRun | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private pendingSync = new Map<string, { control: SharedArrayBuffer; payload: SqlPayload }>();
  /** Bumped on every restart; late SQL completions from a dead worker are dropped. */
  private generation = 0;
  private busyRuns = 0;

  constructor(options: PythonKernelOptions) {
    this.options = {
      timeoutMs: PYTHON_RUN_TIMEOUT_MS,
      rowCap: PYTHON_TABLE_ROW_CAP,
      figureCap: PYTHON_FIGURE_CAP,
      streamCap: PYTHON_STREAM_CHAR_CAP,
      now: () => performance.now(),
      ...options,
    };
  }

  /** True while a run is executing or queued. */
  get isBusy(): boolean {
    return this.busyRuns > 0;
  }

  /** Whether a worker (and so interpreter state) currently exists. */
  get isStarted(): boolean {
    return this.worker !== null;
  }

  /**
   * Runs one cell. Runs are serialized — a second call waits for the first.
   * Never rejects: failures, interrupts and timeouts come back as `error`.
   */
  run(code: string, callbacks: RunCallbacks = {}): Promise<PythonCellOutput> {
    this.busyRuns++;
    const next = this.queue.then(() => this.execute(code, callbacks));
    this.queue = next.catch(() => undefined);
    return next.finally(() => {
      this.busyRuns--;
    });
  }

  /** Terminates the worker. The current run ends with `reason`; queued runs start a fresh kernel. */
  interrupt(reason: string = INTERRUPTED_MESSAGE): void {
    this.teardown(reason);
  }

  dispose(): void {
    this.teardown(INTERRUPTED_MESSAGE);
  }

  // ─── internals ─────────────────────────────────────────────────────────────

  private async execute(code: string, callbacks: RunCallbacks): Promise<PythonCellOutput> {
    const startedAt = this.options.now();
    const streams = { stdout: "", stderr: "" };
    const finish = (raw: RawRunOutput): PythonCellOutput =>
      toCellOutput(raw, streams, {
        rowCap: this.options.rowCap,
        figureCap: this.options.figureCap,
        durationMs: Math.round(this.options.now() - startedAt),
      });

    try {
      if (!this.worker) callbacks.onStatus?.("Starting Python (first run downloads Pyodide)…");
      await this.ensureReady();
    } catch (error) {
      return finish({ error: error instanceof Error ? error.message : String(error) });
    }

    const runId = `run-${++runCounter}`;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const raw = await new Promise<RawRunOutput>((resolve, reject) => {
        this.active = { runId, callbacks, streams, resolve, reject };
        if (this.options.timeoutMs > 0) {
          timer = setTimeout(
            () => this.teardown(timeoutMessage(this.options.timeoutMs)),
            this.options.timeoutMs
          );
        }
        this.post({ type: "run", runId, code, rowCap: this.options.rowCap });
      });
      return finish(raw);
    } catch (error) {
      return finish({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      clearTimeout(timer);
      if (this.active?.runId === runId) this.active = null;
    }
  }

  private ensureReady(): Promise<void> {
    if (this.worker && this.ready) return this.ready;

    const worker = this.options.createWorker();
    this.worker = worker;
    this.ready = new Promise<void>((resolve, reject) => {
      this.rejectReady = reject;
      worker.onmessage = (event) => {
        if (this.worker !== worker) return;
        const message: unknown = event.data;
        if (!isWorkerMessage(message)) return;
        if (message.type === "ready") {
          this.rejectReady = null;
          resolve();
          return;
        }
        if (message.type === "init-error") {
          this.teardown(`Could not start Python: ${message.message}`);
          return;
        }
        this.handleMessage(message);
      };
      worker.onerror = (event) => {
        if (this.worker !== worker) return;
        event.preventDefault?.();
        this.teardown(`Python worker failed: ${event.message || "unknown error"}`);
      };
    });
    // A rejection nobody awaits yet (teardown before the first run awaits it)
    // must not surface as an unhandled rejection.
    this.ready.catch(() => undefined);
    this.post({ type: "init", baseUrl: this.options.baseUrl, figureCap: this.options.figureCap });
    return this.ready;
  }

  private handleMessage(message: WorkerToMainMessage): void {
    const active = this.active;
    switch (message.type) {
      case "status":
        if (active && (message.runId === null || message.runId === active.runId)) {
          active.callbacks.onStatus?.(message.message);
        }
        break;
      case "stream":
        if (active && message.runId === active.runId) {
          active.streams[message.name] = appendCapped(
            active.streams[message.name],
            message.text,
            this.options.streamCap
          );
          active.callbacks.onStream?.({ ...active.streams });
        }
        break;
      case "result":
        if (active && message.runId === active.runId) active.resolve(message.output);
        break;
      case "sql":
        void this.answerSql(message);
        break;
      case "sql-fetch": {
        const pending = this.pendingSync.get(message.requestId);
        if (!pending) break;
        this.pendingSync.delete(message.requestId);
        publishPayloadBody(pending.control, message.buffer, pending.payload);
        break;
      }
    }
  }

  private async answerSql(message: Extract<WorkerToMainMessage, { type: "sql" }>): Promise<void> {
    const generation = this.generation;
    let payload: SqlPayload;
    try {
      payload = await this.options.runSql(message.sql, message.prefer);
    } catch (error) {
      payload = errorPayload(error instanceof Error ? error.message : String(error));
    }
    if (generation !== this.generation || !this.worker) return;

    if (message.control) {
      if (publishPayloadHeader(message.control, payload)) {
        this.pendingSync.set(message.requestId, { control: message.control, payload });
      }
    } else {
      this.post({ type: "sql-result", requestId: message.requestId, payload });
    }
  }

  private post(message: MainToWorkerMessage): void {
    this.worker?.postMessage(message);
  }

  private teardown(reason: string): void {
    const worker = this.worker;
    this.worker = null;
    this.ready = null;
    this.generation++;
    this.pendingSync.clear();
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
    }
    const rejectReady = this.rejectReady;
    this.rejectReady = null;
    rejectReady?.(new KernelStopped(reason));
    const active = this.active;
    this.active = null;
    active?.reject(new KernelStopped(reason));
  }
}

// ─── per-notebook registry ───────────────────────────────────────────────────

const kernels = new Map<string, PythonKernel>();

/** The kernel for a notebook, created on first use. Creating one starts nothing. */
export const getPythonKernel = (key: string, create: () => PythonKernel): PythonKernel => {
  let kernel = kernels.get(key);
  if (!kernel) {
    kernel = create();
    kernels.set(key, kernel);
  }
  return kernel;
};

export const peekPythonKernel = (key: string): PythonKernel | undefined => kernels.get(key);

/** Terminates and forgets a notebook's kernel (tab closed). */
export const disposePythonKernel = (key: string): void => {
  kernels.get(key)?.dispose();
  kernels.delete(key);
};
