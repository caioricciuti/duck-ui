import { describe, it, expect, vi, afterEach } from "vitest";
import { OpenAIProvider } from "../openai.provider";
import { AnthropicProvider } from "../anthropic.provider";
import type { AIProvider } from "../types";

/**
 * Stop must reach the cloud providers: the request is cancelled and nothing
 * is reported afterwards, not even the partial text as a completed answer.
 */

const encoder = new TextEncoder();

const openAiChunk = (text: string) =>
  `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;
const anthropicChunk = (text: string) =>
  `data: ${JSON.stringify({ type: "content_block_delta", delta: { text } })}\n\n`;

/** A streaming response the test feeds by hand, which fails like fetch when aborted. */
const streamingFetch = () => {
  let push: (text: string) => void = () => {};
  let close: () => void = () => {};
  const signals: (AbortSignal | undefined)[] = [];

  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    const signal = init?.signal ?? undefined;
    signals.push(signal);
    // The connection test of `initialize` gets a plain ok.
    if (!String(init?.body ?? "").includes('"stream":true')) {
      return new Response("{}", { status: 200 });
    }
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        push = (text) => controller.enqueue(encoder.encode(text));
        close = () => controller.close();
        signal?.addEventListener("abort", () =>
          controller.error(new DOMException("The operation was aborted.", "AbortError"))
        );
      },
    });
    return new Response(body, { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);

  return {
    push: (text: string) => push(text),
    close: () => close(),
    lastSignal: () => signals[signals.length - 1],
  };
};

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

const cases: {
  name: string;
  create: () => Promise<AIProvider>;
  chunk: (text: string) => string;
}[] = [
  {
    name: "openai",
    create: async () => {
      const provider = new OpenAIProvider();
      await provider.initialize({ apiKey: "k", modelId: "m" });
      return provider;
    },
    chunk: openAiChunk,
  },
  {
    name: "openai-compatible",
    create: async () => {
      const provider = new OpenAIProvider();
      await provider.initialize({ baseUrl: "http://localhost:11434/v1", modelId: "m" });
      return provider;
    },
    chunk: openAiChunk,
  },
  {
    name: "anthropic",
    create: async () => {
      const provider = new AnthropicProvider();
      await provider.initialize({ apiKey: "k", modelId: "m" });
      return provider;
    },
    chunk: anthropicChunk,
  },
];

describe.each(cases)("$name provider and AbortSignal", ({ create, chunk }) => {
  afterEach(() => vi.unstubAllGlobals());

  it("cancels the request and reports nothing after the stop", async () => {
    const stream = streamingFetch();
    const provider = await create();
    const stop = new AbortController();
    const onToken = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();

    const run = provider.generateStreaming(
      [{ role: "user", content: "hi" }],
      { onToken, onComplete, onError },
      { signal: stop.signal }
    );

    await tick();
    stream.push(chunk("SELECT"));
    await tick();
    expect(onToken).toHaveBeenCalledTimes(1);

    stop.abort();
    expect(stream.lastSignal()?.aborted).toBe(true);

    await expect(run).resolves.toBeUndefined();
    expect(onToken).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("drops a chunk that was already buffered when the stop arrived", async () => {
    const stream = streamingFetch();
    // A server that ignores the cancellation and keeps sending.
    const provider = await create();
    const stop = new AbortController();
    const onToken = vi.fn();
    const onComplete = vi.fn();

    const original = globalThis.fetch;
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) =>
      original(url, { ...init, signal: undefined })
    );

    const run = provider.generateStreaming(
      [{ role: "user", content: "hi" }],
      { onToken, onComplete },
      { signal: stop.signal }
    );

    await tick();
    stop.abort();
    stream.push(chunk("late"));
    stream.close();

    await run;
    expect(onToken).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("does not send a request for a signal that is already aborted", async () => {
    streamingFetch();
    const provider = await create();
    const stop = new AbortController();
    stop.abort();
    const onComplete = vi.fn();
    const onError = vi.fn();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
        return new Response("{}", { status: 200 });
      })
    );

    await provider.generateStreaming(
      [{ role: "user", content: "hi" }],
      { onComplete, onError },
      { signal: stop.signal }
    );
    expect(onComplete).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("still completes a request nobody stopped", async () => {
    const stream = streamingFetch();
    const provider = await create();
    const onComplete = vi.fn();

    const run = provider.generateStreaming(
      [{ role: "user", content: "hi" }],
      { onComplete },
      { signal: new AbortController().signal }
    );
    await tick();
    stream.push(chunk("SELECT "));
    stream.push(chunk("1"));
    stream.close();
    await run;

    expect(onComplete).toHaveBeenCalledWith("SELECT 1");
  });
});
