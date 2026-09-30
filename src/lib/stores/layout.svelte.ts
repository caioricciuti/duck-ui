const WIDTH_KEY = "duck-ui-explorer-width";
const COLLAPSED_KEY = "duck-ui-explorer-collapsed";

export const EXPLORER_MIN_WIDTH = 220;
export const EXPLORER_MAX_WIDTH = 560;
export const EXPLORER_DEFAULT_WIDTH = 300;

const savedWidth = parseInt(localStorage.getItem(WIDTH_KEY) ?? "", 10);

let explorerWidth = $state(Number.isNaN(savedWidth) ? EXPLORER_DEFAULT_WIDTH : savedWidth);
let explorerCollapsed = $state(localStorage.getItem(COLLAPSED_KEY) === "true");

export function getExplorerWidth(): number {
  return explorerWidth;
}

export function setExplorerWidth(width: number): void {
  explorerWidth = Math.max(EXPLORER_MIN_WIDTH, Math.min(EXPLORER_MAX_WIDTH, Math.round(width)));
  localStorage.setItem(WIDTH_KEY, String(explorerWidth));
}

export function isExplorerCollapsed(): boolean {
  return explorerCollapsed;
}

export function setExplorerCollapsed(collapsed: boolean): void {
  explorerCollapsed = collapsed;
  localStorage.setItem(COLLAPSED_KEY, String(collapsed));
}

export function toggleExplorer(): void {
  setExplorerCollapsed(!explorerCollapsed);
}

// Below this width the rail moves to the bottom and the second column
// becomes a drawer.
const mobileQuery = window.matchMedia("(max-width: 767px)");
let mobile = $state(mobileQuery.matches);
let drawerOpen = $state(false);

mobileQuery.addEventListener("change", (e) => {
  mobile = e.matches;
  if (!e.matches) drawerOpen = false;
});

export function isMobile(): boolean {
  return mobile;
}

export function isDrawerOpen(): boolean {
  return mobile && drawerOpen;
}

export function openDrawer(): void {
  drawerOpen = true;
}

export function closeDrawer(): void {
  drawerOpen = false;
}
