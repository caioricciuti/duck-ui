import type { StateCreator } from "zustand";
import { generateUUID } from "@/lib/utils";
import { createResultSnapshot } from "@/lib/resultDiff";
import type { DuckStoreState, ResultPin, ResultPinSlice } from "../types";

/**
 * Pinned results for the compare view.
 *
 * Session-only on purpose: a pin is a copy of up to PIN_ROW_LIMIT rows, and
 * writing those to the system DB on every autosave would cost far more than
 * re-running the query. The list is bounded too, oldest pin dropped first.
 */
export const MAX_RESULT_PINS = 20;

export const createResultPinSlice: StateCreator<
  DuckStoreState,
  [["zustand/devtools", never]],
  [],
  ResultPinSlice
> = (set) => ({
  resultPins: [],

  pinResult: (tabId, query, result) => {
    const pin: ResultPin = {
      id: generateUUID(),
      tabId,
      query,
      pinnedAt: new Date(),
      snapshot: createResultSnapshot(result),
    };
    set((state) => ({
      resultPins: [...state.resultPins, pin].slice(-MAX_RESULT_PINS),
    }));
    return pin;
  },

  removeResultPin: (id) =>
    set((state) => ({ resultPins: state.resultPins.filter((p) => p.id !== id) })),

  clearResultPins: () => set({ resultPins: [] }),
});
