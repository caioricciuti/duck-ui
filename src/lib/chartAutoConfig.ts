import { isNumericColumn, suggestChartTypes } from "@/lib/chartDataTransform";
import type { ChartConfig, ChartType, QueryResult } from "@/store/types";

export const DEFAULT_CHART_COLORS = [
  "#D99B43",
  "#8B5CF6",
  "#3B82F6",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#EC4899",
  "#6366F1",
  "#14B8A6",
  "#F97316",
];

/** Rows looked at to decide whether a column varies. */
const VARIES_SAMPLE = 200;

const varies = (result: QueryResult, column: string): boolean => {
  const first = result.data[0]?.[column];
  const end = Math.min(result.data.length, VARIES_SAMPLE);
  for (let i = 1; i < end; i++) {
    if (String(result.data[i][column]) !== String(first)) return true;
  }
  // One row cannot vary, and should not be penalised for it.
  return result.data.length <= 1;
};

/**
 * Picks a sensible chart for a result with no saved config. Also the
 * fallback when a Duck Brain chart suggestion fails validation.
 */
export const autoDetectChartConfig = (
  result: QueryResult,
  colors: string[] = DEFAULT_CHART_COLORS
): ChartConfig => {
  const numericColumns = result.columns.filter((col) => isNumericColumn(result.data, col));

  // Prefer a categorical column for the x-axis, and among those one that
  // actually varies: a column holding the same value in every row would put
  // every mark on one label. Fall back to the first column when everything
  // is numeric.
  const categorical = result.columns.filter((col) => !isNumericColumn(result.data, col));
  const xAxis =
    categorical.find((col) => varies(result, col)) || categorical[0] || result.columns[0] || "";

  // The x-axis column must NOT also be plotted as a series. With an
  // all-numeric result (`SELECT 1, 2, 3`) the old default picked column one
  // for both, so the chart drew a value against itself and the legend
  // listed the axis as data.
  const yCol =
    numericColumns.find((col) => col !== xAxis) ||
    result.columns.find((col) => col !== xAxis) ||
    "";
  const suggested = suggestChartTypes(result, xAxis, yCol);
  const type = (suggested[0] || "bar") as ChartType;
  return {
    type,
    xAxis,
    yAxis: yCol,
    colors,
    showGrid: true,
    showValues: false,
    smooth: false,
    legend: { show: true, position: "bottom" },
  };
};
