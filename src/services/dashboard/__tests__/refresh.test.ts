import { describe, it, expect } from "vitest";
import {
  decideRefresh,
  formatRefreshInterval,
  formatRelativeTime,
  latestFetchedAt,
  MAX_REFRESH_SECONDS,
  MIN_REFRESH_SECONDS,
  normalizeRefreshInterval,
  parseRefreshParam,
  type RefreshState,
} from "../refresh";

const base: RefreshState = {
  intervalSeconds: 60,
  lastRefreshedAt: 1_000_000,
  now: 1_000_000,
  hidden: false,
  inFlight: false,
};

describe("decideRefresh", () => {
  it("is idle when off", () => {
    expect(decideRefresh({ ...base, intervalSeconds: 0 })).toEqual({
      action: "idle",
      reason: "off",
    });
  });

  it("pauses while the tab is hidden, even when overdue", () => {
    expect(decideRefresh({ ...base, hidden: true, now: base.now + 10 * 60_000 })).toEqual({
      action: "idle",
      reason: "hidden",
    });
  });

  it("never overlaps a refresh already in flight", () => {
    expect(decideRefresh({ ...base, inFlight: true, now: base.now + 120_000 })).toEqual({
      action: "idle",
      reason: "in-flight",
    });
  });

  it("waits the remainder of the interval since the last refresh", () => {
    expect(decideRefresh({ ...base, now: base.now + 15_000 })).toEqual({
      action: "wait",
      delayMs: 45_000,
    });
  });

  it("refreshes once due, and immediately when overdue (tab came back)", () => {
    expect(decideRefresh({ ...base, now: base.now + 60_000 })).toEqual({ action: "refresh" });
    expect(decideRefresh({ ...base, now: base.now + 600_000 })).toEqual({ action: "refresh" });
  });

  it("waits a full interval when nothing has run yet", () => {
    expect(decideRefresh({ ...base, lastRefreshedAt: null })).toEqual({
      action: "wait",
      delayMs: 60_000,
    });
  });
});

describe("normalizeRefreshInterval", () => {
  it("treats unusable values as off", () => {
    for (const value of [undefined, null, "", "abc", 0, -30, NaN, Infinity, {}]) {
      expect(normalizeRefreshInterval(value)).toBe(0);
    }
  });

  it("keeps presets and clamps outliers", () => {
    expect(normalizeRefreshInterval(300)).toBe(300);
    expect(normalizeRefreshInterval("60")).toBe(60);
    expect(normalizeRefreshInterval(1)).toBe(MIN_REFRESH_SECONDS);
    expect(normalizeRefreshInterval(10 ** 9)).toBe(MAX_REFRESH_SECONDS);
    expect(normalizeRefreshInterval(45.6)).toBe(46);
  });
});

describe("parseRefreshParam", () => {
  it("reads refresh from a query string or a hash", () => {
    expect(parseRefreshParam("?refresh=60")).toBe(60);
    expect(parseRefreshParam("#dash=abc&refresh=300")).toBe(300);
  });

  it("returns null when absent and 0 when explicitly unusable", () => {
    expect(parseRefreshParam("")).toBeNull();
    expect(parseRefreshParam("?load=x")).toBeNull();
    expect(parseRefreshParam("?refresh=off")).toBe(0);
    expect(parseRefreshParam("?refresh=0")).toBe(0);
  });
});

describe("formatting", () => {
  it("labels presets and custom intervals", () => {
    expect(formatRefreshInterval(0)).toBe("Off");
    expect(formatRefreshInterval(900)).toBe("15m");
    expect(formatRefreshInterval(7200)).toBe("2h");
    expect(formatRefreshInterval(120)).toBe("2m");
    expect(formatRefreshInterval(45)).toBe("45s");
  });

  it("formats relative time", () => {
    expect(formatRelativeTime(0, 2_000)).toBe("just now");
    expect(formatRelativeTime(0, 12_000)).toBe("12s ago");
    expect(formatRelativeTime(0, 4 * 60_000 + 5_000)).toBe("4m ago");
    expect(formatRelativeTime(0, 2 * 3_600_000)).toBe("2h ago");
  });

  it("finds the latest fetchedAt, ignoring missing ones", () => {
    expect(latestFetchedAt([])).toBeNull();
    expect(
      latestFetchedAt([
        { fetchedAt: "2026-01-01T00:00:00.000Z" },
        {},
        { fetchedAt: "2026-01-01T00:05:00.000Z" },
      ])
    ).toBe(Date.parse("2026-01-01T00:05:00.000Z"));
  });
});
