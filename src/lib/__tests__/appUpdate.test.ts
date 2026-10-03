import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { watchForUpdates, type RegisterOptions } from "../appUpdate";

const listeners = new Map<string, () => void>();
let visibility = "visible";

beforeEach(() => {
  vi.useFakeTimers();
  listeners.clear();
  (globalThis as { document?: unknown }).document = {
    get visibilityState() {
      return visibility;
    },
    addEventListener: (type: string, handler: () => void) => listeners.set(type, handler),
  };
  visibility = "visible";
});

afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as { document?: unknown }).document;
});

const setup = () => {
  let options: RegisterOptions = {};
  const register = vi.fn((given: RegisterOptions) => {
    options = given;
  });
  const onAvailable = vi.fn();
  const update = vi.fn().mockResolvedValue(undefined);
  watchForUpdates(register, onAvailable, 1000);
  return {
    options: () => options,
    onAvailable,
    registration: { update } as unknown as ServiceWorkerRegistration,
    update,
  };
};

describe("watchForUpdates", () => {
  it("registers at once and reports when the new worker has taken over", () => {
    const { options, onAvailable } = setup();
    expect(options().immediate).toBe(true);
    options().onNeedReload?.();
    expect(onAvailable).toHaveBeenCalledTimes(1);
  });

  it("checks for a new build on the interval and when the tab comes back", () => {
    const { options, registration, update } = setup();
    options().onRegisteredSW?.("/sw.js", registration);

    vi.advanceTimersByTime(1000);
    expect(update).toHaveBeenCalledTimes(1);

    listeners.get("visibilitychange")?.();
    expect(update).toHaveBeenCalledTimes(2);
  });

  it("does not ask the server while the tab is hidden", () => {
    const { options, registration, update } = setup();
    options().onRegisteredSW?.("/sw.js", registration);
    visibility = "hidden";
    vi.advanceTimersByTime(3000);
    listeners.get("visibilitychange")?.();
    expect(update).not.toHaveBeenCalled();
  });

  it("survives a registration without a handle", () => {
    const { options } = setup();
    expect(() => options().onRegisteredSW?.("/sw.js", undefined)).not.toThrow();
  });
});
