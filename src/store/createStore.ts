/**
 * Minimal state container with the same `set` / `get` / `subscribe` contract
 * the slices were written against, so their bodies stay untouched. Framework
 * free: Svelte components read it through `src/lib/stores/duck.svelte.ts`.
 */

export type StatePartial<T> = T | Partial<T> | ((state: T) => T | Partial<T>);

export type SetState<T> = (partial: StatePartial<T>, replace?: boolean) => void;

export type GetState<T> = () => T;

export type StoreListener<T> = (state: T, previous: T) => void;

export interface StoreApi<T> {
  getState: GetState<T>;
  getInitialState: GetState<T>;
  setState: SetState<T>;
  subscribe: (listener: StoreListener<T>) => () => void;
}

/**
 * The two middle type parameters are unused. They exist so slice signatures
 * written as `StateCreator<State, [], [], Slice>` keep compiling.
 */
export type StateCreator<T, _Mis = [], _Mos = [], U = T> = (
  set: SetState<T>,
  get: GetState<T>,
  api: StoreApi<T>
) => U;

export function createStore<T>(initializer: StateCreator<T>): StoreApi<T> {
  let state: T;
  const listeners = new Set<StoreListener<T>>();

  const setState: SetState<T> = (partial, replace) => {
    const next =
      typeof partial === "function" ? (partial as (state: T) => T | Partial<T>)(state) : partial;
    if (Object.is(next, state)) return;
    const previous = state;
    state =
      replace || typeof next !== "object" || next === null
        ? (next as T)
        : Object.assign({}, state, next);
    for (const listener of listeners) listener(state, previous);
  };

  const getState: GetState<T> = () => state;

  const api: StoreApi<T> = {
    getState,
    getInitialState: () => initialState,
    setState,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  const initialState = (state = initializer(setState, getState, api));
  return api;
}

/** Curried form, matching how the store and its tests were already written. */
export function create<T>(): (initializer: StateCreator<T>) => StoreApi<T> {
  return (initializer) => createStore(initializer);
}
