import { describe, expect, it } from "vitest";
import { create } from "zustand";
import { PIN_ROW_LIMIT } from "@/lib/resultDiff";
import { createResultPinSlice, MAX_RESULT_PINS } from "../resultPinSlice";
import type { QueryResult, ResultPinSlice } from "../../types";

// Only this slice is exercised; the cast stands in for the rest of the store.
const makeStore = () =>
  create<ResultPinSlice>()((...a) =>
    createResultPinSlice(...(a as unknown as Parameters<typeof createResultPinSlice>))
  );

const result = (rows: number): QueryResult => ({
  columns: ["i"],
  columnTypes: ["INTEGER"],
  data: Array.from({ length: rows }, (_, i) => ({ i })),
  rowCount: rows,
});

describe("resultPinSlice", () => {
  it("pins a snapshot of the result with its query", () => {
    const store = makeStore();
    const source = result(3);
    const pin = store.getState().pinResult("tab-1", "SELECT 1", source);
    expect(store.getState().resultPins).toEqual([pin]);
    expect(pin.tabId).toBe("tab-1");
    expect(pin.query).toBe("SELECT 1");
    expect(pin.snapshot.rows).toHaveLength(3);
    expect(pin.snapshot.rows).not.toBe(source.data);
    expect(pin.pinnedAt).toBeInstanceOf(Date);
  });

  it("caps the pinned rows", () => {
    const store = makeStore();
    const pin = store.getState().pinResult("t", "q", result(PIN_ROW_LIMIT + 5));
    expect(pin.snapshot.rows).toHaveLength(PIN_ROW_LIMIT);
    expect(pin.snapshot.truncated).toBe(true);
    expect(pin.snapshot.sourceRowCount).toBe(PIN_ROW_LIMIT + 5);
  });

  it("drops the oldest pin beyond the limit", () => {
    const store = makeStore();
    const first = store.getState().pinResult("t", "q0", result(1));
    for (let i = 1; i <= MAX_RESULT_PINS; i++) store.getState().pinResult("t", `q${i}`, result(1));
    const pins = store.getState().resultPins;
    expect(pins).toHaveLength(MAX_RESULT_PINS);
    expect(pins.some((p) => p.id === first.id)).toBe(false);
    expect(pins[pins.length - 1].query).toBe(`q${MAX_RESULT_PINS}`);
  });

  it("removes and clears pins", () => {
    const store = makeStore();
    const a = store.getState().pinResult("t", "a", result(1));
    const b = store.getState().pinResult("t", "b", result(1));
    store.getState().removeResultPin(a.id);
    expect(store.getState().resultPins.map((p) => p.id)).toEqual([b.id]);
    store.getState().clearResultPins();
    expect(store.getState().resultPins).toEqual([]);
  });
});
