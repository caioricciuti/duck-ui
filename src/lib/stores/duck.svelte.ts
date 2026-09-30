import { createSubscriber } from "svelte/reactivity";
import { useDuckStore, type DuckStoreState } from "@/store";

const subscribe = createSubscriber((update) => useDuckStore.subscribe(() => update()));

/**
 * Reactive read of the app store. Call it inside `$derived`:
 * `const tabs = $derived(duck((s) => s.tabs))`.
 */
export function duck<T>(selector: (state: DuckStoreState) => T): T {
  subscribe();
  return selector(useDuckStore.getState());
}

/** Non-reactive access, for calling actions from event handlers. */
export function duckActions(): DuckStoreState {
  return useDuckStore.getState();
}
