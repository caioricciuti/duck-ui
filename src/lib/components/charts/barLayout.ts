/**
 * Geometry for charts whose x axis is a list of categories, one per row,
 * placed at the integer positions 0, 1, 2 and so on.
 */

/** Share of a category's slot taken by its bars. The rest is the gap. */
const GROUP_SHARE = 0.72;
/** Wider than this a lone bar looks like a wall rather than a bar. */
const MAX_BAR_PX = 96;
const BAR_GAP_PX = 1;

/**
 * Half a slot of room on both sides, so the first and last bar are drawn in
 * full instead of being cut by the plot edge.
 */
export const categoryRange = (min: number, max: number): [number, number] => [min - 0.5, max + 0.5];

/**
 * Tick positions: one per category, thinned evenly when the labels would
 * collide. Always on a category, never between two.
 */
export function categorySplits(count: number, plotWidthPx: number, labelWidthPx: number): number[] {
  if (count <= 0) return [];
  const fits = Math.max(1, Math.floor(plotWidthPx / Math.max(1, labelWidthPx)));
  const step = Math.max(1, Math.ceil(count / fits));
  const splits: number[] = [];
  for (let i = 0; i < count; i += step) splits.push(i);
  return splits;
}

export interface BarSlot {
  /** Left edge of the bar, relative to the centre of its category. */
  offset: number;
  width: number;
}

/**
 * Where one series' bar sits inside a category that is `slotPx` wide.
 * `position` counts visible series only, so hiding one closes the gap.
 * Stacked bars pass a count of 1 and share the whole group width.
 */
export function barSlot(slotPx: number, visibleCount: number, position: number): BarSlot {
  const count = Math.max(1, visibleCount);
  const group = Math.min(slotPx * GROUP_SHARE, MAX_BAR_PX * count);
  const each = group / count;
  const gap = count > 1 && each > 4 ? BAR_GAP_PX : 0;
  return {
    offset: -group / 2 + position * each + gap / 2,
    width: Math.max(1, each - gap),
  };
}
