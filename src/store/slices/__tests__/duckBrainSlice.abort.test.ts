import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Stop used to reach only the in-browser model. With a cloud provider the
 * request kept streaming into the chat and appended its answer afterwards.
 */

interface Callbacks {
  onToken: (token: string) => void;
  onComplete: (text: string) => void;
  onError: (error: Error) => void;
}

const { provider, serviceAbort, toastError } = vi.hoisted(() => ({
  provider: {
    initialize: vi.fn(),
    generateStreaming: vi.fn(),
    cleanup: vi.fn(),
  },
  serviceAbort: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("svelte-sonner", () => ({
  toast: { warning: vi.fn(), success: vi.fn(), error: toastError, info: vi.fn() },
}));

vi.mock("@/services/engine", () => ({ runQuery: vi.fn() }));

vi.mock("@/lib/duckBrain", () => ({
  duckBrainService: { abort: serviceAbort, generateStreaming: vi.fn() },
  buildTextToSQLMessages: vi.fn().mockReturnValue([{ role: "user", content: "q" }]),
  formatSchemaForContext: vi.fn().mockReturnValue({ formatted: "" }),
  extractSQLFromResponse: vi.fn((text: string) => ({ sql: text || null })),
}));

vi.mock("@/lib/duckBrain/providers", () => ({
  createProvider: vi.fn(() => provider),
}));

import { createDuckBrainSlice } from "../duckBrainSlice";
import type { DuckBrainSlice } from "../../types";

const setup = () => {
  let state = {} as DuckBrainSlice & { databases: unknown[] };
  const get = () => state as never;
  const set = (partial: unknown) => {
    const next = typeof partial === "function" ? partial(state) : partial;
    state = { ...state, ...(next as object) };
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const slice = createDuckBrainSlice(set as any, get as any, undefined as any);
  state = {
    ...slice,
    databases: [],
    duckBrain: {
      ...slice.duckBrain,
      aiProvider: "openai",
      providerConfigs: { openai: { apiKey: "k", modelId: "m" } },
    },
  };
  return { brain: () => state.duckBrain, actions: () => state };
};

/** A provider that streams until the test lets it finish. */
const holdGeneration = () => {
  let callbacks!: Callbacks;
  let signal: AbortSignal | undefined;
  let finish!: () => void;
  let fail!: (error: Error) => void;
  const started = new Promise<void>((resolve) => {
    provider.generateStreaming.mockImplementation(
      (_messages: unknown, cbs: Callbacks, options?: { signal?: AbortSignal }) => {
        callbacks = cbs;
        signal = options?.signal;
        resolve();
        return new Promise<void>((done, reject) => {
          finish = done;
          fail = reject;
        });
      }
    );
  });
  return {
    started,
    callbacks: () => callbacks,
    signal: () => signal,
    finish: () => finish(),
    fail: (error: Error) => fail(error),
  };
};

describe("Duck Brain stop with a cloud provider", () => {
  beforeEach(() => {
    provider.initialize.mockReset().mockResolvedValue(undefined);
    provider.generateStreaming.mockReset();
    provider.cleanup.mockReset().mockResolvedValue(undefined);
    serviceAbort.mockReset();
    toastError.mockReset();
  });

  it("cancels the request, and nothing reaches the chat afterwards", async () => {
    const { brain, actions } = setup();
    const generation = holdGeneration();

    const pending = actions().generateSQL("top customers");
    await generation.started;

    generation.callbacks().onToken("SELECT");
    expect(brain().streamingContent).toBe("SELECT");
    expect(generation.signal()?.aborted).toBe(false);

    await actions().abortGeneration();

    expect(generation.signal()?.aborted).toBe(true);
    expect(brain().isGenerating).toBe(false);
    expect(brain().streamingContent).toBe("");

    // A provider that was slow to notice the stop.
    generation.callbacks().onToken(" 1");
    generation.callbacks().onComplete("SELECT 1");
    generation.finish();

    expect(await pending).toBeNull();
    expect(brain().streamingContent).toBe("");
    expect(brain().isGenerating).toBe(false);
    expect(brain().messages.map((message) => message.role)).toEqual(["user"]);
    expect(toastError).not.toHaveBeenCalled();
    // The in-browser model is not the one answering.
    expect(serviceAbort).not.toHaveBeenCalled();
  });

  it("stays quiet when the stopped request fails", async () => {
    const { brain, actions } = setup();
    const generation = holdGeneration();

    const pending = actions().generateSQL("top customers");
    await generation.started;
    await actions().abortGeneration();

    generation.callbacks().onError(new Error("network lost"));
    generation.fail(new Error("network lost"));

    expect(await pending).toBeNull();
    expect(brain().error).toBeNull();
    expect(toastError).not.toHaveBeenCalled();
  });

  it("appends the answer of a request that was not stopped", async () => {
    const { brain, actions } = setup();
    const generation = holdGeneration();

    const pending = actions().generateSQL("top customers");
    await generation.started;
    generation.callbacks().onToken("SELECT 1");
    generation.callbacks().onComplete("SELECT 1");
    generation.finish();

    expect(await pending).toBe("SELECT 1");
    expect(brain().messages.map((message) => message.role)).toEqual(["user", "assistant"]);
  });
});

describe("Duck Brain failures with a cloud provider", () => {
  beforeEach(() => {
    provider.initialize.mockReset().mockResolvedValue(undefined);
    provider.generateStreaming.mockReset();
    provider.cleanup.mockReset().mockResolvedValue(undefined);
    toastError.mockReset();
  });

  it("shows a failure once and clears it on the next request", async () => {
    const { brain, actions } = setup();

    const failing = holdGeneration();
    const first = actions().generateSQL("first");
    await failing.started;
    failing.callbacks().onError(new Error("rate limited"));
    failing.fail(new Error("rate limited"));

    expect(await first).toBeNull();
    expect(brain().error).toBe("rate limited");
    expect(brain().isGenerating).toBe(false);
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError).toHaveBeenCalledWith("Generation failed: rate limited");

    const next = holdGeneration();
    const second = actions().generateSQL("second");
    await next.started;
    expect(brain().error).toBeNull();

    next.callbacks().onComplete("SELECT 2");
    next.finish();
    await second;
    expect(brain().error).toBeNull();
  });

  it("reports a provider that cannot connect", async () => {
    const { actions } = setup();
    provider.initialize.mockRejectedValue(new Error("Connection failed: 401"));

    expect(await actions().generateSQL("anything")).toBeNull();
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError).toHaveBeenCalledWith("Failed to generate SQL: Connection failed: 401");
  });
});
