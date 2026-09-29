/**
 * Bridge between the framework-free store and the UI router.
 *
 * Connections and Settings used to be workspace tabs, and logic still asks
 * for them with `createTab("settings")`. They are pages now, so the tab slice
 * hands those requests to whoever registered here instead of opening a tab.
 */

export type PageTabType = "connections" | "settings";

type PageOpener = (page: PageTabType) => void;

let opener: PageOpener | null = null;

export const isPageTabType = (type: string): type is PageTabType =>
  type === "connections" || type === "settings";

export function registerPageOpener(next: PageOpener): void {
  opener = next;
}

export function openPageFor(type: PageTabType): void {
  opener?.(type);
}
