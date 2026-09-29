/**
 * Turns a chart config and its rows into uPlot options and data.
 * Pie and donut are not handled here, they are SVG (see PieChart.svelte).
 */
import uPlot from "uplot";
import { formatNumberWithSuffix, shortenLabel } from "@/lib/chartUtils";
import { tooltipPlugin } from "@/lib/charts/tooltipPlugin";
import type { ChartConfig } from "@/store/types";
import { chartTheme, resolvePalette, resolveSeriesColor, withAlpha } from "./palette";
import { barSlot, categoryRange, categorySplits } from "./barLayout";

export interface ChartSeriesInfo {
  column: string;
  label: string;
  color: string;
}

export interface XYChart {
  options: Omit<uPlot.Options, "width" | "height">;
  data: uPlot.AlignedData;
  /** In config order, for the legend. */
  series: ChartSeriesInfo[];
}

/** Columns plotted on the y axis, in config order. */
export const seriesColumns = (config: ChartConfig): string[] => {
  if (config.series?.length) return config.series.map((s) => s.column);
  return config.yAxis ? [config.yAxis] : [];
};

export const describeSeries = (config: ChartConfig): ChartSeriesInfo[] => {
  const palette = resolvePalette(config.colors);
  const useSeries = Boolean(config.series?.length);
  return seriesColumns(config).map((column, i) => {
    const entry = useSeries ? config.series?.[i] : undefined;
    return {
      column,
      label: entry?.label || column,
      color: resolveSeriesColor(entry?.color, i, palette),
    };
  });
};

export const buildXYChart = (
  config: ChartConfig,
  rows: Record<string, unknown>[],
  hidden: ReadonlySet<string>
): XYChart | null => {
  const series = describeSeries(config);
  if (!config.xAxis || series.length === 0) return null;

  const isStacked = config.type === "stacked_bar" || config.type === "stacked_area";
  const isBar = ["bar", "stacked_bar", "grouped_bar"].includes(config.type);
  const isArea = ["area", "stacked_area"].includes(config.type);
  const isScatter = config.type === "scatter";
  // Several series on a plain bar chart sit side by side. Drawn on the same
  // spot they would hide each other.
  const isGrouped = isBar && !isStacked && series.length > 1;
  const smooth = Boolean(config.smooth) && (config.type === "line" || isArea);

  const xs = rows.map((_, i) => i);
  const xLabels = rows.map((row) => shortenLabel(String(row[config.xAxis])));
  const raw = series.map((s) => rows.map((row) => Number(row[s.column]) || 0));

  // A stacked chart plots running totals. Hidden series are left out of the
  // total, so the rest closes the gap instead of floating above a hole.
  const plotted = isStacked
    ? raw.reduce<number[][]>((acc, values, i) => {
        const below = acc[acc.length - 1];
        const own = hidden.has(series[i].column) ? values.map(() => 0) : values;
        acc.push(below ? own.map((v, di) => v + below[di]) : own);
        return acc;
      }, [])
    : raw;

  // Stacked marks overlap: the tallest total is drawn first and each smaller
  // one on top, which leaves every series its own band. Series and data use
  // the same order, so a band always has the color of its own series.
  const order = series.map((_, i) => i);
  if (isStacked) order.reverse();

  const splinePaths = smooth ? uPlot.paths.spline?.() : undefined;

  // Position of each series among the visible ones, so hiding a series
  // closes its gap instead of leaving a hole in every group.
  const visible = series.filter((entry) => !hidden.has(entry.column));
  const positionOf = (i: number) => Math.max(0, visible.indexOf(series[i]));

  /** Bars as plain rectangles with softened top corners, any number per group. */
  const barPaths = (i: number): uPlot.Series.PathBuilder => {
    const count = isGrouped ? visible.length : 1;
    const position = isGrouped ? positionOf(i) : 0;
    return (u, seriesIdx, idx0, idx1) => {
      const fill = new Path2D();
      const xData = u.data[0];
      const slotPx =
        xData.length > 1
          ? Math.abs(u.valToPos(xData[1], "x", true) - u.valToPos(xData[0], "x", true))
          : u.bbox.width;
      const { offset, width } = barSlot(slotPx, count, position);
      const zero = u.valToPos(0, "y", true);
      const radius = Math.min(3 * uPlot.pxRatio, width / 2);

      for (let di = idx0; di <= idx1; di++) {
        const value = u.data[seriesIdx][di];
        if (value == null) continue;
        const top = u.valToPos(value, "y", true);
        const height = Math.abs(zero - top);
        if (height <= 0) continue;
        const x = u.valToPos(xData[di], "x", true) + offset;
        // Round the end away from the baseline, which is the bottom edge for
        // a negative value.
        const corners = top <= zero ? [radius, radius, 0, 0] : [0, 0, radius, radius];
        fill.roundRect(x, Math.min(top, zero), width, height, corners);
      }
      return { fill, stroke: fill };
    };
  };

  const pathsFor = (i: number): uPlot.Series["paths"] => {
    if (isBar) return barPaths(i);
    if (smooth) return splinePaths;
    if (isScatter) return () => null;
    return undefined;
  };

  // Overlapping translucent fills would mix the colors of the series below.
  const fillAlpha = isStacked ? 1 : isArea ? 0.4 : 0.8;

  const uSeries: uPlot.Series[] = [
    { label: config.xAxis },
    ...order.map((i): uPlot.Series => {
      const { label, color, column } = series[i];
      return {
        label,
        show: !hidden.has(column),
        stroke: color,
        width: isBar ? 0 : 2,
        fill: isBar || isArea ? withAlpha(color, fillAlpha) : undefined,
        points: { show: isScatter, size: isScatter ? 8 : 4 },
        paths: pathsFor(i),
      };
    }),
  ];

  const longestLabel = Math.max(...xLabels.map((l) => l.length), 1);
  const LABEL_CHAR_PX = 6.5;
  const flatLabelPx = longestLabel * LABEL_CHAR_PX + 16;
  // Labels lie flat while they fit. Past that they are slanted, which takes
  // far less width per label.
  const SLANTED_LABEL_PX = 26;

  // Colors and fonts are left out on purpose: UPlotChart fills them from the theme.
  const axes: uPlot.Axis[] = [
    {
      values: (_u, vals) => vals.map((v) => xLabels[v] ?? ""),
      // One tick per row, on the row. uPlot's own ticks would land between
      // categories and draw grid lines for positions that hold no data.
      splits: (u) => {
        const widthPx = u.bbox.width / uPlot.pxRatio;
        const slanted = rows.length * flatLabelPx > widthPx;
        return categorySplits(rows.length, widthPx, slanted ? SLANTED_LABEL_PX : flatLabelPx);
      },
      rotate: (u) => (rows.length * flatLabelPx > u.bbox.width / uPlot.pxRatio ? -45 : 0),
      grid: { show: false },
      gap: 8,
      size: (u) =>
        rows.length * flatLabelPx > u.bbox.width / uPlot.pxRatio
          ? Math.min(120, 40 + longestLabel * 5)
          : 44,
    },
    {
      grid: (config.showGrid ?? true) ? { dash: [4, 4] } : { show: false },
      values: (_u, vals) => vals.map((v) => formatNumberWithSuffix(v)),
      gap: 8,
      size: 70,
    },
  ];

  const values = order.map((i) => raw[i]);

  const hooks: uPlot.Hooks.Arrays = {};
  if (config.showValues && isBar) {
    hooks.draw = [
      (u) => {
        const theme = chartTheme();
        const ctx = u.ctx;
        ctx.save();
        // The canvas is in device pixels.
        ctx.font = `${10 * uPlot.pxRatio}px ${theme.fontFamily}`;
        ctx.fillStyle = theme.label;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        for (let si = 1; si < u.series.length; si++) {
          if (!u.series[si].show) continue;
          for (let di = 0; di < u.data[si].length; di++) {
            const top = u.data[si][di];
            const x = u.data[0][di];
            if (top == null || x == null) continue;
            ctx.fillText(
              formatNumberWithSuffix(values[si - 1][di]),
              u.valToPos(x, "x", true),
              u.valToPos(top, "y", true) - 4 * uPlot.pxRatio
            );
          }
        }
        ctx.restore();
      },
    ];
  }

  const options: XYChart["options"] = {
    scales: {
      x: {
        time: false,
        // Rows sit at 0, 1, 2 and so on. Half a slot of padding keeps the
        // first and last mark whole, and centres a result with one row.
        range: (_u, min, max) => categoryRange(min, max),
      },
      ...(isBar
        ? {
            y: {
              // Bars are read by their length, so the axis has to include zero.
              range: (_u: uPlot, min: number, max: number): [number, number] => {
                const low = Math.min(0, min);
                const high = Math.max(0, max);
                if (low === high) return [0, 1];
                const pad = (high - low) * 0.06;
                return [low < 0 ? low - pad : 0, high > 0 ? high + pad : 0];
              },
            },
          }
        : {}),
    },
    series: uSeries,
    axes,
    cursor: {
      drag: { x: false, y: false },
      points: {
        size: 6,
        fill: (u, i) => {
          const stroke = u.series[i].stroke;
          return (typeof stroke === "function" ? stroke(u, i) : stroke) as string;
        },
        stroke: "transparent",
        width: 0,
      },
    },
    legend: { show: false },
    plugins: [tooltipPlugin(xLabels, { stacked: isStacked, values }), { hooks }],
    padding: [16, 16, 8, 0],
  };

  return {
    options,
    data: [xs, ...order.map((i) => plotted[i])],
    series,
  };
};
