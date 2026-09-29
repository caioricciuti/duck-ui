import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CONTROL_STATE,
  STATE_PENDING,
  STATE_READY,
  STATE_SIZED,
  copyPayloadOut,
  createControlBuffer,
  isWorkerMessage,
  publishPayloadBody,
  publishPayloadHeader,
  readPayloadHeader,
  type MainToWorkerMessage,
  type SqlPayload,
  type WorkerToMainMessage,
} from "../protocol";
import {
  INTERRUPTED_MESSAGE,
  PythonKernel,
  disposePythonKernel,
  getPythonKernel,
  peekPythonKernel,
  timeoutMessage,
  type WorkerLike,
} from "../kernel";

const utf8 = new TextEncoder();

/** A worker stand-in the test drives by hand. */
class FakeWorker implements WorkerLike {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  sent: MainToWorkerMessage[] = [];
  terminated = false;

  postMessage(message: unknown): void {
    this.sent.push(message as MainToWorkerMessage);
  }
  terminate(): void {
    this.terminated = true;
  }
  emit(message: WorkerToMainMessage): void {
    this.onmessage?.({ data: message } as MessageEvent);
  }
  lastRun(): Extract<MainToWorkerMessage, { type: "run" }> {
    const run = [...this.sent].reverse().find((m) => m.type === "run");
    if (!run || run.type !== "run") throw new Error("no run sent");
    return run;
  }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const makeKernel = (
  overrides: Partial<ConstructorParameters<typeof PythonKernel>[0]> = {}
): { kernel: PythonKernel; workers: FakeWorker[] } => {
  const workers: FakeWorker[] = [];
  const kernel = new PythonKernel({
    createWorker: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    },
    runSql: async () => ({ format: "json", bytes: utf8.encode("{}"), truncated: false }),
    baseUrl: "https://cdn.example/pyodide/",
    timeoutMs: 0,
    ...overrides,
  });
  return { kernel, workers };
};

/** Starts a run and brings the fake worker to "ready". */
const startRun = async (kernel: PythonKernel, workers: FakeWorker[], code = "1 + 1") => {
  const streams: string[] = [];
  const statuses: string[] = [];
  const promise = kernel.run(code, {
    onStream: (s) => streams.push(s.stdout),
    onStatus: (s) => statuses.push(s),
  });
  await flush();
  const worker = workers[workers.length - 1];
  if (!worker.sent.some((m) => m.type === "run")) {
    worker.emit({ type: "ready", version: "0.29.5", syncSql: true });
    await flush();
  }
  return { promise, worker, streams, statuses };
};

describe("protocol guards", () => {
  it("accepts known worker messages only", () => {
    expect(isWorkerMessage({ type: "ready", version: "x", syncSql: true })).toBe(true);
    expect(isWorkerMessage({ type: "stream", runId: "r", name: "stdout", text: "" })).toBe(true);
    expect(isWorkerMessage({ type: "bogus" })).toBe(false);
    expect(isWorkerMessage(null)).toBe(false);
    expect(isWorkerMessage("ready")).toBe(false);
  });
});

describe("synchronous sql() bridge", () => {
  const payload: SqlPayload = {
    format: "arrow",
    bytes: new Uint8Array([1, 2, 3, 4, 5]),
    truncated: true,
  };

  it("hands a payload over in two steps", () => {
    const control = createControlBuffer();
    const view = new Int32Array(control);
    expect(Atomics.load(view, CONTROL_STATE)).toBe(STATE_PENDING);

    expect(publishPayloadHeader(control, payload)).toBe(true);
    expect(Atomics.load(view, CONTROL_STATE)).toBe(STATE_SIZED);
    const header = readPayloadHeader(control);
    expect(header).toEqual({ length: 5, format: "arrow", truncated: true, ready: false });

    const buffer = new SharedArrayBuffer(header.length);
    publishPayloadBody(control, buffer, payload);
    expect(Atomics.load(view, CONTROL_STATE)).toBe(STATE_READY);
    const out = copyPayloadOut(buffer);
    expect(Array.from(out)).toEqual([1, 2, 3, 4, 5]);
    expect(out.buffer instanceof SharedArrayBuffer).toBe(false);
  });

  it("completes an empty payload in one step", () => {
    const control = createControlBuffer();
    const empty: SqlPayload = { format: "json", bytes: new Uint8Array(0), truncated: false };
    expect(publishPayloadHeader(control, empty)).toBe(false);
    expect(readPayloadHeader(control)).toMatchObject({ ready: true, format: "json", length: 0 });
  });
});

describe("PythonKernel", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts nothing until the first run, then inits once", async () => {
    const { kernel, workers } = makeKernel();
    expect(workers).toHaveLength(0);
    expect(kernel.isStarted).toBe(false);

    const { promise, worker, streams, statuses } = await startRun(kernel, workers);
    expect(worker.sent[0]).toEqual({
      type: "init",
      baseUrl: "https://cdn.example/pyodide/",
      figureCap: 10,
    });
    const { runId, code } = worker.lastRun();
    expect(code).toBe("1 + 1");

    worker.emit({ type: "status", runId, message: "Loading pandas" });
    worker.emit({ type: "stream", runId, name: "stdout", text: "hello\n" });
    worker.emit({ type: "stream", runId: "other-run", name: "stdout", text: "ignored\n" });
    worker.emit({ type: "result", runId, output: { text: "2", images: [], error: null } });

    const output = await promise;
    expect(output).toMatchObject({ stdout: "hello\n", stderr: "", text: "2" });
    expect(streams).toEqual(["hello\n"]);
    expect(statuses).toContain("Loading pandas");

    // Second run reuses the worker: no new init.
    const second = await startRun(kernel, workers, "3");
    expect(workers).toHaveLength(1);
    expect(second.worker.sent.filter((m) => m.type === "init")).toHaveLength(1);
    second.worker.emit({
      type: "result",
      runId: second.worker.lastRun().runId,
      output: { text: "3" },
    });
    expect((await second.promise).text).toBe("3");
  });

  it("serializes runs", async () => {
    const { kernel, workers } = makeKernel();
    const first = kernel.run("a");
    const second = kernel.run("b");
    expect(kernel.isBusy).toBe(true);
    await flush();
    workers[0].emit({ type: "ready", version: "x", syncSql: true });
    await flush();
    expect(workers[0].sent.filter((m) => m.type === "run")).toHaveLength(1);

    workers[0].emit({ type: "result", runId: workers[0].lastRun().runId, output: { text: "A" } });
    expect((await first).text).toBe("A");
    await flush();
    expect(workers[0].lastRun().code).toBe("b");
    workers[0].emit({ type: "result", runId: workers[0].lastRun().runId, output: { text: "B" } });
    expect((await second).text).toBe("B");
    expect(kernel.isBusy).toBe(false);
  });

  it("interrupt terminates the worker and the next run starts a fresh one", async () => {
    const { kernel, workers } = makeKernel();
    const { promise, worker } = await startRun(kernel, workers, "while True: pass");
    kernel.interrupt();
    expect(worker.terminated).toBe(true);
    expect((await promise).error).toBe(INTERRUPTED_MESSAGE);
    expect(kernel.isStarted).toBe(false);

    const next = await startRun(kernel, workers, "1");
    expect(workers).toHaveLength(2);
    next.worker.emit({ type: "result", runId: next.worker.lastRun().runId, output: { text: "1" } });
    expect((await next.promise).text).toBe("1");
  });

  it("interrupt during startup ends the run too", async () => {
    const { kernel, workers } = makeKernel();
    const promise = kernel.run("1");
    await flush();
    kernel.interrupt();
    expect((await promise).error).toBe(INTERRUPTED_MESSAGE);
    expect(workers[0].terminated).toBe(true);
  });

  it("times out and restarts", async () => {
    vi.useFakeTimers();
    const { kernel, workers } = makeKernel({ timeoutMs: 1000 });
    const promise = kernel.run("import time; time.sleep(99)");
    await vi.advanceTimersByTimeAsync(0);
    workers[0].emit({ type: "ready", version: "x", syncSql: true });
    await vi.advanceTimersByTimeAsync(1000);
    const output = await promise;
    expect(output.error).toBe(timeoutMessage(1000));
    expect(workers[0].terminated).toBe(true);
  });

  it("reports init failures and retries on the next run", async () => {
    const { kernel, workers } = makeKernel();
    const promise = kernel.run("1");
    await flush();
    workers[0].emit({ type: "init-error", message: "Failed to fetch pyodide.js" });
    const output = await promise;
    expect(output.error).toContain("Could not start Python");
    expect(output.error).toContain("Failed to fetch pyodide.js");
    expect(workers[0].terminated).toBe(true);

    void kernel.run("1");
    await flush();
    expect(workers).toHaveLength(2);
    kernel.dispose();
  });

  it("answers synchronous sql() through the shared buffer", async () => {
    const runSql = vi.fn(async (): Promise<SqlPayload> => ({
      format: "arrow",
      bytes: new Uint8Array([9, 8, 7]),
      truncated: false,
    }));
    const { kernel, workers } = makeKernel({ runSql });
    const { promise, worker } = await startRun(kernel, workers, 'sql("select 1")');
    const control = createControlBuffer();
    worker.emit({ type: "sql", requestId: "q1", sql: "select 1", prefer: "arrow", control });
    await flush();
    expect(runSql).toHaveBeenCalledWith("select 1", "arrow");

    const header = readPayloadHeader(control);
    expect(header).toMatchObject({ length: 3, format: "arrow", ready: false });
    const buffer = new SharedArrayBuffer(header.length);
    worker.emit({ type: "sql-fetch", requestId: "q1", buffer });
    expect(readPayloadHeader(control).ready).toBe(true);
    expect(Array.from(copyPayloadOut(buffer))).toEqual([9, 8, 7]);

    worker.emit({ type: "result", runId: worker.lastRun().runId, output: { text: "ok" } });
    await promise;
  });

  it("answers sql_async() with a reply message, and turns throws into error payloads", async () => {
    const runSql = vi.fn(async (): Promise<SqlPayload> => {
      throw new Error("No active connection");
    });
    const { kernel, workers } = makeKernel({ runSql });
    const { promise, worker } = await startRun(kernel, workers);
    worker.emit({ type: "sql", requestId: "q2", sql: "select 1", prefer: "json" });
    await flush();
    const reply = worker.sent.find((m) => m.type === "sql-result");
    expect(reply).toBeDefined();
    if (reply?.type !== "sql-result") throw new Error("unreachable");
    expect(reply.requestId).toBe("q2");
    expect(reply.payload.format).toBe("error");
    expect(new TextDecoder().decode(reply.payload.bytes)).toBe("No active connection");

    worker.emit({ type: "result", runId: worker.lastRun().runId, output: {} });
    await promise;
  });

  it("drops a SQL answer that arrives after the worker was replaced", async () => {
    let release: (payload: SqlPayload) => void = () => {};
    const runSql = vi.fn(
      () =>
        new Promise<SqlPayload>((resolve) => {
          release = resolve;
        })
    );
    const { kernel, workers } = makeKernel({ runSql });
    const { promise, worker } = await startRun(kernel, workers);
    const control = createControlBuffer();
    worker.emit({ type: "sql", requestId: "q3", sql: "select 1", prefer: "arrow", control });
    kernel.interrupt();
    await promise;
    release({ format: "arrow", bytes: new Uint8Array([1]), truncated: false });
    await flush();
    expect(Atomics.load(new Int32Array(control), CONTROL_STATE)).toBe(STATE_PENDING);
  });
});

describe("kernel registry", () => {
  it("creates one kernel per notebook and disposes it with the tab", async () => {
    const { kernel, workers } = makeKernel();
    const create = vi.fn(() => kernel);
    expect(getPythonKernel("tab-1", create)).toBe(kernel);
    expect(getPythonKernel("tab-1", create)).toBe(kernel);
    expect(create).toHaveBeenCalledTimes(1);
    expect(peekPythonKernel("tab-1")).toBe(kernel);

    const run = kernel.run("1");
    await flush();
    disposePythonKernel("tab-1");
    expect(workers[0].terminated).toBe(true);
    expect((await run).error).toBe(INTERRUPTED_MESSAGE);
    expect(peekPythonKernel("tab-1")).toBeUndefined();
  });
});
