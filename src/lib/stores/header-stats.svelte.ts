const STORAGE_KEY = "duck-ui-header-stats";

// Off until asked for: the summary line costs a second header row.
let headerStats = $state(localStorage.getItem(STORAGE_KEY) === "true");

export function getHeaderStats(): boolean {
  return headerStats;
}

export function toggleHeaderStats(): void {
  headerStats = !headerStats;
  localStorage.setItem(STORAGE_KEY, String(headerStats));
}
