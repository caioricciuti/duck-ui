import type { EditorTab } from "./types";

/**
 * Split view: two panes side by side, each showing one tab.
 *
 * The tab list stays flat. A tab in the right pane carries `pane: "right"`,
 * which is saved with the tab, and the split exists for as long as one tab
 * does. `activeTabId` keeps its meaning, the tab being worked in, so every
 * reader of it works unchanged. `otherPaneTabId` is the tab the other pane
 * shows.
 */

export type Pane = "left" | "right";

export interface PaneState {
  tabs: EditorTab[];
  activeTabId: string | null;
  otherPaneTabId: string | null;
}

export const paneOf = (tab: EditorTab): Pane => (tab.pane === "right" ? "right" : "left");

/** Home is pinned: first in the left pane, never closed or moved. */
export const isHomeTab = (tab: EditorTab): boolean => tab.type === "home";

export const isSplit = (tabs: EditorTab[]): boolean => tabs.some((tab) => tab.pane === "right");

const opposite = (pane: Pane): Pane => (pane === "left" ? "right" : "left");

const inPane = (tabs: EditorTab[], pane: Pane): EditorTab[] =>
  tabs.filter((tab) => paneOf(tab) === pane);

const withoutPane = (tab: EditorTab): EditorTab => {
  if (tab.pane === undefined) return tab;
  const { pane: _pane, ...rest } = tab;
  return rest;
};

/**
 * The tab next to this one in its pane: the one after it, or the one before
 * when it is last. It takes over when the tab closes or leaves the pane.
 */
export function neighbourOf(tabs: EditorTab[], tabId: string): EditorTab | null {
  const tab = tabs.find((entry) => entry.id === tabId);
  if (!tab) return null;
  const siblings = inPane(tabs, paneOf(tab));
  const index = siblings.indexOf(tab);
  return siblings[index + 1] ?? siblings[index - 1] ?? null;
}

/**
 * The tab each pane shows. Tolerates an `otherPaneTabId` that went stale
 * because something replaced the tab list without going through the tab
 * actions (a live session, a deleted dashboard).
 */
export function visibleTabs(state: PaneState): Record<Pane, string | null> {
  const active = state.tabs.find((tab) => tab.id === state.activeTabId);
  if (!active || !isSplit(state.tabs)) return { left: state.activeTabId, right: null };

  const pane = paneOf(active);
  const others = inPane(state.tabs, opposite(pane));
  const other = others.find((tab) => tab.id === state.otherPaneTabId) ?? others[0] ?? null;
  return pane === "left"
    ? { left: active.id, right: other?.id ?? null }
    : { left: other?.id ?? null, right: active.id };
}

/**
 * Brings a tab list and its focus into a consistent state: Home first and
 * on the left, no right pane without a left one, an active tab that exists,
 * and for the other pane the first of `preferOther` that lives there.
 */
export function settlePanes(
  tabs: EditorTab[],
  activeTabId: string | null,
  preferOther: (string | null | undefined)[] = []
): PaneState {
  let next = tabs;

  const homeIndex = next.findIndex(isHomeTab);
  if (homeIndex > 0 || (homeIndex === 0 && next[0].pane !== undefined)) {
    const home = withoutPane(next[homeIndex]);
    next = [home, ...next.filter((_, index) => index !== homeIndex)];
  }

  // A right pane next to an empty left one is just one pane.
  if (isSplit(next) && inPane(next, "left").length === 0) next = next.map(withoutPane);

  const active = next.find((tab) => tab.id === activeTabId) ?? next[0] ?? null;
  if (!active || !isSplit(next)) {
    return { tabs: next, activeTabId: active?.id ?? null, otherPaneTabId: null };
  }

  const others = inPane(next, opposite(paneOf(active)));
  const preferred = preferOther
    .map((id) => others.find((tab) => tab.id === id))
    .find((tab) => tab !== undefined);
  return {
    tabs: next,
    activeTabId: active.id,
    otherPaneTabId: (preferred ?? others[0])?.id ?? null,
  };
}

/** A saved tab list, as the workspace shows it: with Home, and settled. */
export function restorePanes(saved: EditorTab[], activeTabId: string | null): PaneState {
  const tabs = saved.some(isHomeTab)
    ? saved
    : [{ id: "home", title: "Home", type: "home" as const, content: "" }, ...saved];
  return settlePanes(tabs, activeTabId);
}

/** Moves a tab into a pane, at the end, and focuses it. */
export function moveToPane(state: PaneState, tabId: string, pane: Pane): PaneState {
  const tab = state.tabs.find((entry) => entry.id === tabId);
  if (!tab || isHomeTab(tab)) return state;
  if (paneOf(tab) === pane) {
    return settlePanes(state.tabs, tabId, [state.activeTabId, state.otherPaneTabId]);
  }

  // What the pane it leaves shows next: what was there before, or its neighbour.
  const leftBehind = [
    state.activeTabId,
    state.otherPaneTabId,
    neighbourOf(state.tabs, tabId)?.id,
  ].filter((id) => id !== tabId);
  const moved: EditorTab = pane === "right" ? { ...tab, pane: "right" } : withoutPane(tab);
  return settlePanes(
    [...state.tabs.filter((entry) => entry.id !== tabId), moved],
    tabId,
    leftBehind
  );
}

/**
 * A tab dropped on an edge of the workspace. With two panes it moves to the
 * pane on that side. With one, the right edge sends the tab to a new right
 * pane and the left edge keeps it where it is and sends the others there.
 */
export function splitToSide(state: PaneState, tabId: string, side: Pane): PaneState {
  const tab = state.tabs.find((entry) => entry.id === tabId);
  if (!tab || isHomeTab(tab)) return state;
  if (isSplit(state.tabs) || side === "right") return moveToPane(state, tabId, side);

  const others = state.tabs.filter((entry) => !isHomeTab(entry) && entry.id !== tabId);
  if (others.length === 0) return state;
  const tabs = state.tabs.map((entry) =>
    others.includes(entry) ? { ...entry, pane: "right" as const } : entry
  );
  return settlePanes(tabs, tabId, [state.activeTabId]);
}

/** Closes a tab. Home stays. The pane shows the neighbour; an empty pane goes away. */
export function closeInPanes(state: PaneState, tabId: string): PaneState {
  const tab = state.tabs.find((entry) => entry.id === tabId);
  if (!tab || isHomeTab(tab)) return state;

  const neighbour = neighbourOf(state.tabs, tabId)?.id;
  const tabs = state.tabs.filter((entry) => entry.id !== tabId);
  if (state.activeTabId === tabId) {
    return settlePanes(tabs, neighbour ?? state.otherPaneTabId, [state.otherPaneTabId]);
  }
  return settlePanes(tabs, state.activeTabId, [
    state.otherPaneTabId === tabId ? neighbour : state.otherPaneTabId,
  ]);
}

/** Back to one pane, keeping the order of the tabs and the active one. */
export function joinPanes(state: PaneState): PaneState {
  return settlePanes(state.tabs.map(withoutPane), state.activeTabId);
}
