import { describe, it, expect, vi } from "vitest";

vi.mock("svelte-sonner", () => ({
  toast: { warning: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { changesPersistedState, useDuckStore } from "../index";
import type { DuckStoreState } from "../types";

const base = useDuckStore.getState();
const withChange = (patch: Partial<DuckStoreState>): DuckStoreState => ({ ...base, ...patch });

describe("changesPersistedState", () => {
  it("ignores changes that are never stored", () => {
    expect(changesPersistedState(base, withChange({ isLoadingDbTablesFetch: true }))).toBe(false);
    expect(changesPersistedState(base, withChange({ executingTabs: { t1: true } }))).toBe(false);
    expect(
      changesPersistedState(
        base,
        withChange({ queryProgress: { t1: { rows: 10, batches: 1, elapsedMs: 5, columns: [] } } })
      )
    ).toBe(false);
  });

  it("sees an edit to a tab", () => {
    const tabs = [
      ...base.tabs,
      { id: "t1", title: "Query", type: "sql" as const, content: "select 1" },
    ];
    expect(changesPersistedState(base, withChange({ tabs }))).toBe(true);
  });

  it("sees a switch of tab, database or AI provider", () => {
    expect(changesPersistedState(base, withChange({ activeTabId: "other" }))).toBe(true);
    expect(changesPersistedState(base, withChange({ currentDatabase: "analytics" }))).toBe(true);
    expect(
      changesPersistedState(
        base,
        withChange({ duckBrain: { ...base.duckBrain, aiProvider: "anthropic" } })
      )
    ).toBe(true);
  });

  it("sees a new chat message", () => {
    const duckBrain = { ...base.duckBrain, messages: [...base.duckBrain.messages] };
    expect(changesPersistedState(base, withChange({ duckBrain }))).toBe(true);
  });
});
