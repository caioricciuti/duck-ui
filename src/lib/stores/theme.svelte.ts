export type ThemeMode = "dark" | "light" | "system";

// Same key the React app used, so an existing preference carries over and the
// profile loader (which writes this key) needs no change.
const STORAGE_KEY = "vite-ui-theme";
const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

function readSaved(): ThemeMode {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === "dark" || saved === "light" || saved === "system" ? saved : "system";
}

let mode = $state<ThemeMode>(readSaved());
let systemIsDark = $state(systemDark.matches);

systemDark.addEventListener("change", (e) => {
  systemIsDark = e.matches;
  applyTheme();
});

applyTheme();

export function getThemeMode(): ThemeMode {
  return mode;
}

/** The theme actually on screen, with "system" resolved against the OS. */
export function getTheme(): "dark" | "light" {
  if (mode === "system") return systemIsDark ? "dark" : "light";
  return mode;
}

export function setThemeMode(next: ThemeMode): void {
  mode = next;
  localStorage.setItem(STORAGE_KEY, next);
  applyTheme();
}

export function toggleTheme(): void {
  setThemeMode(getTheme() === "dark" ? "light" : "dark");
}

/** Re-reads storage. The profile loader writes the saved theme there. */
export function syncThemeFromStorage(): void {
  mode = readSaved();
  applyTheme();
}

function applyTheme(): void {
  document.documentElement.classList.toggle("dark", getTheme() === "dark");
}
