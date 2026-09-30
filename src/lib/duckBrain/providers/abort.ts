/**
 * Makes `controller` abort when the caller's signal does.
 *
 * Providers keep their own controller for `abort()`, so the caller's signal
 * is forwarded into it rather than replacing it. Returns the unlink function.
 */
export function linkAbortSignal(controller: AbortController, signal?: AbortSignal): () => void {
  if (!signal) return () => {};
  if (signal.aborted) {
    controller.abort();
    return () => {};
  }
  const onAbort = () => controller.abort();
  signal.addEventListener("abort", onAbort, { once: true });
  return () => signal.removeEventListener("abort", onAbort);
}
