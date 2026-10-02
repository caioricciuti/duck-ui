/**
 * The one place chart colors may be literal values.
 *
 * Everything a chart or the map paints comes from here: the series palette,
 * the theme tokens resolved to concrete values (canvas and WebGL cannot read
 * CSS variables), and the ink used on top of a colored mark.
 */
import { DEFAULT_CHART_COLORS } from "@/lib/chartAutoConfig";

/**
 * Series colors after the accent. One set for both themes: each sits in the
 * mid lightness band, so it clears 3:1 on the light and the dark surface.
 * The ORDER is deliberate. It keeps neighbouring series apart under
 * deuteranopia, protanopia and tritanopia (checked with the accent in front,
 * on both surfaces). Reordering can put two colors that look alike next to
 * each other.
 */
const SERIES_COLORS = [
  "#3987e5", // blue
  "#d55181", // magenta
  "#008300", // green
  "#e66767", // red
  "#9085e9", // violet
  "#199e70", // aqua
  "#d95926", // orange
];

/** Used only when a token is missing, which means app.css did not load. */
const TOKEN_FALLBACK = {
  "--accent": "#ca8a04",
  "--fg": "#18181b",
  "--fg-2": "#3f3f46",
  "--fg-3": "#6b6c76",
  "--fg-4": "#a0a1a9",
  "--surface": "#ffffff",
  "--surface-2": "#f3f3f5",
  "--edge-subtle": "rgba(128, 128, 128, 0.15)",
  "--edge": "rgba(128, 128, 128, 0.25)",
} as const;

export type ThemeToken = keyof typeof TOKEN_FALLBACK;

const INK_ON_LIGHT = "#0a0a0a";
const INK_ON_DARK = "#ffffff";

/** Current value of a design token. Call it again after the theme changes. */
export function themeColor(token: ThemeToken): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  return value || TOKEN_FALLBACK[token];
}

/** Default series palette: the accent first, then the fixed series colors. */
export function chartPalette(): string[] {
  return [themeColor("--accent"), ...SERIES_COLORS];
}

export interface ChartTheme {
  /** Axis labels and tick values. */
  axis: string;
  grid: string;
  ticks: string;
  /** Value labels drawn on the plot. */
  label: string;
  text: string;
  surface: string;
  fontFamily: string;
}

export function chartTheme(): ChartTheme {
  return {
    axis: themeColor("--fg-3"),
    grid: themeColor("--edge-subtle"),
    ticks: themeColor("--edge"),
    label: themeColor("--fg-2"),
    text: themeColor("--fg"),
    surface: themeColor("--surface"),
    fontFamily: getComputedStyle(document.body).fontFamily || "system-ui, sans-serif",
  };
}

const sameColor = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Configs saved by the React app carry its default palette baked in. Those
 * are defaults, not a choice the user made, so they must not pin a chart to
 * the old colors.
 */
const isLegacyPalette = (colors: string[]) =>
  colors.length === DEFAULT_CHART_COLORS.length &&
  colors.every((color, i) => sameColor(color, DEFAULT_CHART_COLORS[i]));

/** The palette a config asks for, or the themed default when it asks for none. */
export function resolvePalette(configColors: string[] | undefined): string[] {
  if (!configColors || configColors.length === 0 || isLegacyPalette(configColors)) {
    return chartPalette();
  }
  return configColors;
}

/** Color for the series at `index`. An explicit series color wins over the palette. */
export function resolveSeriesColor(
  explicit: string | undefined,
  index: number,
  palette: string[]
): string {
  const legacyDefault = DEFAULT_CHART_COLORS[index % DEFAULT_CHART_COLORS.length];
  if (explicit && !sameColor(explicit, legacyDefault)) return explicit;
  return palette[index % palette.length];
}

const HEX6 = /^#[0-9a-f]{6}$/i;
const HEX3 = /^#[0-9a-f]{3}$/i;

const toHex6 = (color: string): string | null => {
  const c = color.trim();
  if (HEX6.test(c)) return c;
  if (HEX3.test(c)) return `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
  return null;
};

/** `color` at the given opacity (0 to 1), for fills under a solid stroke. */
export function withAlpha(color: string, alpha: number): string {
  const hex = toHex6(color);
  if (hex) {
    const byte = Math.round(Math.min(1, Math.max(0, alpha)) * 255);
    return `${hex}${byte.toString(16).padStart(2, "0")}`;
  }
  // Tokens are hex today. This keeps rgb() or oklch() values working too.
  return `color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, transparent)`;
}

/** Ink that stays readable on top of `color` (the accent is a light yellow in dark mode). */
export function inkOn(color: string): string {
  const hex = toHex6(color);
  if (!hex) return INK_ON_DARK;
  const channel = (offset: number) => {
    const v = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  // Crossover where black and white text have equal contrast.
  return luminance > 0.179 ? INK_ON_LIGHT : INK_ON_DARK;
}

/** Lowest cell of a heatmap, so it still stands apart from an empty one. */
const HEAT_FLOOR = 0.12;

/**
 * Sequential heatmap fill at `level` (0 to 1), from the surface to the
 * accent. One hue, so the order reads the same under every kind of color
 * blindness. Returns hex when the tokens are hex, so `inkOn` can pick a
 * readable label color for the cell.
 */
export function heatColor(level: number): string {
  const t = HEAT_FLOOR + (1 - HEAT_FLOOR) * Math.min(1, Math.max(0, level));
  const accent = themeColor("--accent");
  const from = toHex6(themeColor("--surface"));
  const to = toHex6(accent);
  if (!from || !to) return withAlpha(accent, t);
  const mix = (offset: number) => {
    const a = parseInt(from.slice(offset, offset + 2), 16);
    const b = parseInt(to.slice(offset, offset + 2), 16);
    return Math.round(a + (b - a) * t)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${mix(1)}${mix(3)}${mix(5)}`;
}
