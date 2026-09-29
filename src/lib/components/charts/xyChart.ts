/**
 * Turns a chart config and its rows into uPlot options and data.
 * Pie and donut are not handled here, they are SVG (see PieChart.svelte).
 */
import uPlot from "uplot";
import { formatNumberWithSuffix, shortenLabel } from "@/lib/chartUtils";
import { tooltipPlugin } from "@/lib/charts/tooltipPlugin";
import type { ChartConfig } from "@/store/types";
import { chartTheme, resolvePalette, resolveSeriesColor, withAlpha } from "./palette";

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
  const isGrouped = config.type === "grouped_bar" && series.length > 1;
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

  const barPaths =
    isBar && !isGrouped ? uPlot.paths.bars?.({ size: [0.6, 100], radius: 0.2 }) : undefined;
  const splinePaths = smooth ? uPlot.paths.spline?.() : undefined;

  const pathsFor = (i: number): uPlot.Series["paths"] => {
    if (isGrouped) {
      return uPlot.paths.bars?.({
        size: [0.6 / series.length, 100],
        radius: 0.2,
        align: i === 0 ? -1 : i === series.length - 1 ? 1 : 0,
      });
    }
    if (isBar) return barPaths;
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

  const rotate = rows.length > 10;
  const longestLabel = Math.max(...xLabels.map((l) => l.length), 1);

  // Colors and fonts are left out on purpose: UPlotChart fills them from the theme.
  const axes: uPlot.Axis[] = [
    {
      values: (_u, vals) => vals.map((v) => xLabels[v] ?? ""),
      gap: 8,
      size: rotate ? Math.min(120, 40 + longestLabel * 5) : 60,
      rotate: rotate ? -45 : 0,
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
        /**
         * A result with one row collapses the x range to a single value, and
         * uPlot then draws the whole series pinned to the left edge with the
         * rest of the canvas empty, which reads as a broken chart rather
         * than as one data point. Pad the range so a lone bar sits centred.
         */
        range: rows.length === 1 ? (_u, min, max) => [min - 1, max + 1] : undefined,
      },
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
