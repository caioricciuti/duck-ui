/**
 * Dashboard auto-refresh scheduling.
 *
 * Pure on purpose: the component owns the timer, this decides what the timer
 * should do. Two rules shape it —
 *
 *   hidden   a background tab never refreshes. Queries against a remote
 *            source cost somebody something, and nobody is looking.
 *   busy     a refresh never overlaps the previous one. A slow query on a
 *            short interval would otherwise stack runs until the tab dies.
 *
 * The interval counts from when the last refresh FINISHED, not from a fixed
 * clock: a 30s query on a 1m interval leaves 1m of idle between runs.
 */

/** Seconds. Zero means off. */
export const REFRESH_INTERVAL_OPTIONS: ReadonlyArray<{ seconds: number; label: string }> = [
  { seconds: 0, label: "Off" },
  { seconds: 30, label: "30s" },
  { seconds: 60, label: "1m" },
  { seconds: 300, label: "5m" },
  { seconds: 900, label: "15m" },
  { seconds: 3600, label: "1h" },
];

/** Floor for URL-supplied intervals: a link must not be able to hammer a source. */
export const MIN_REFRESH_SECONDS = 10;
/** Ceiling, so a typo'd link doesn't schedule something effectively never. */
export const MAX_REFRESH_SECONDS = 24 * 60 * 60;

/**
 * Normalises a stored or URL-supplied interval to whole seconds.
 *
 * Anything unusable (missing, non-numeric, zero, negative) is off. Positive
 * values are clamped rather than rejected — `refresh=5` on a kiosk link almost
 * certainly meant "often", and the floor is the closest honest answer.
 */
export const normalizeRefreshInterval = (value: unknown): number => {
  const seconds =
    typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : NaN;
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.min(MAX_REFRESH_SECONDS, Math.max(MIN_REFRESH_SECONDS, Math.round(seconds)));
};

/** Human label for an interval: the preset's name, or a compact duration. */
export const formatRefreshInterval = (seconds: number): string => {
  const preset = REFRESH_INTERVAL_OPTIONS.find((option) => option.seconds === seconds);
  if (preset) return preset.label;
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
};

/** Reads `refresh=<seconds>` from a query string or hash. Null when absent. */
export const parseRefreshParam = (raw: string): number | null => {
  const trimmed = raw.replace(/^[?#]/, "");
  if (!trimmed) return null;
  const value = new URLSearchParams(trimmed).get("refresh");
  if (value === null) return null;
  return normalizeRefreshInterval(value);
};

export interface RefreshState {
  /** Seconds; zero is off. */
  intervalSeconds: number;
  /** Epoch ms of the last completed refresh, or null if none yet. */
  lastRefreshedAt: number | null;
  now: number;
  /** `document.visibilityState === "hidden"`. */
  hidden: boolean;
  /** A refresh (manual or scheduled) is running. */
  inFlight: boolean;
}

export type RefreshDecision =
  /** Nothing to schedule: off, hidden, or busy. Re-evaluate when that changes. */
  | { action: "idle"; reason: "off" | "hidden" | "in-flight" }
  /** Due now. */
  | { action: "refresh" }
  /** Due in `delayMs`. */
  | { action: "wait"; delayMs: number };

export const decideRefresh = (state: RefreshState): RefreshDecision => {
  if (state.intervalSeconds <= 0) return { action: "idle", reason: "off" };
  if (state.hidden) return { action: "idle", reason: "hidden" };
  if (state.inFlight) return { action: "idle", reason: "in-flight" };
  // Nothing has run yet — the initial load is the component's job, so wait a
  // full interval rather than racing it.
  const anchor = state.lastRefreshedAt ?? state.now;
  const remaining = anchor + state.intervalSeconds * 1000 - state.now;
  return remaining <= 0 ? { action: "refresh" } : { action: "wait", delayMs: remaining };
};

/** Latest `fetchedAt` across results, as epoch ms. Null when nothing has landed. */
export const latestFetchedAt = (results: Iterable<{ fetchedAt?: string }>): number | null => {
  let latest: number | null = null;
  for (const result of results) {
    if (!result.fetchedAt) continue;
    const at = Date.parse(result.fetchedAt);
    if (Number.isFinite(at) && (latest === null || at > latest)) latest = at;
  }
  return latest;
};

/** "just now", "12s ago", "4m ago", "2h ago". */
export const formatRelativeTime = (then: number, now: number): string => {
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
};
