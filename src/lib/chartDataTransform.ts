/**
 * Advanced data transformation utilities for charting
 * Handles aggregations, grouping, sorting, and filtering
 */

import type { QueryResult } from "@/store";
import type { ChartConfig, DataTransform, AggregationType, SeriesConfig } from "@/store";

export type TransformedData = Record<string, unknown>[];

/**
 * Check if a column contains numeric values
 */
export const isNumericColumn = (data: Record<string, unknown>[], column: string): boolean => {
  if (data.length === 0) return false;

  // Sample first few non-null values
  const sampleSize = Math.min(10, data.length);
  for (let i = 0; i < sampleSize; i++) {
    const value = data[i][column];
    if (value !== null && value !== undefined) {
      return typeof value === "number" || !isNaN(Number(value));
    }
  }

  return false;
};

/**
 * Check if a column contains date/time values
 */
export const isDateColumn = (data: Record<string, unknown>[], column: string): boolean => {
  if (data.length === 0) return false;

  const value = data[0][column];
  if (value instanceof Date) return true;
  if (typeof value === "string") {
    const date = new Date(value);
    return !isNaN(date.getTime());
  }

  return false;
};

/**
 * Aggregate values based on aggregation type
 */
export const aggregate = (values: unknown[], aggregationType: AggregationType): number => {
  const numericValues = values.map((v) => Number(v)).filter((v) => !isNaN(v));

  if (numericValues.length === 0) return 0;

  switch (aggregationType) {
    case "sum":
      return numericValues.reduce((a, b) => a + b, 0);
    case "avg":
      return numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
    case "count":
      return values.length;
    case "min":
      return Math.min(...numericValues);
    case "max":
      return Math.max(...numericValues);
    case "none":
    default:
      return numericValues[0] || 0;
  }
};

/** A column to aggregate, optionally with its own aggregation. */
export type ValueColumn = string | { column: string; aggregation?: AggregationType };

/**
 * Map keys compare objects by identity, so two rows holding equal dates
 * would land in separate groups.
 */
const groupKey = (value: unknown): unknown => (value instanceof Date ? value.getTime() : value);

/**
 * Group data by a column and aggregate values.
 *
 * Takes one value column or several: every one of them is aggregated, so a
 * multi series chart keeps all its series.
 */
export const groupByColumn = (
  data: Record<string, unknown>[],
  groupByColumn: string,
  valueColumns: ValueColumn | ValueColumn[],
  aggregationType: AggregationType
): TransformedData => {
  const columns = new Map<string, AggregationType>();
  for (const entry of Array.isArray(valueColumns) ? valueColumns : [valueColumns]) {
    const column = typeof entry === "string" ? entry : entry.column;
    const aggregation = typeof entry === "string" ? undefined : entry.aggregation;
    // Aggregating the key itself would overwrite it in the output row.
    if (!column || column === groupByColumn || columns.has(column)) continue;
    columns.set(column, aggregation ?? aggregationType);
  }

  const grouped = new Map<unknown, { key: unknown; rows: Record<string, unknown>[] }>();

  // Group rows
  data.forEach((row) => {
    const key = row[groupByColumn];
    if (key === null || key === undefined) return;

    const id = groupKey(key);
    const group = grouped.get(id);
    if (group) group.rows.push(row);
    else grouped.set(id, { key, rows: [row] });
  });

  // Aggregate each value column per group
  const result: TransformedData = [];
  grouped.forEach(({ key, rows }) => {
    const aggregated: Record<string, unknown> = { [groupByColumn]: key };
    columns.forEach((aggregation, column) => {
      aggregated[column] = aggregate(
        rows.map((row) => row[column]),
        aggregation
      );
    });
    result.push(aggregated);
  });

  return result;
};

/**
 * Sort data by column
 */
export const sortData = (
  data: TransformedData,
  sortBy: string,
  sortOrder: "asc" | "desc"
): TransformedData => {
  return [...data].sort((a, b) => {
    const aVal = a[sortBy];
    const bVal = b[sortBy];

    if (aVal === null || aVal === undefined) return 1;
    if (bVal === null || bVal === undefined) return -1;

    const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    return sortOrder === "asc" ? comparison : -comparison;
  });
};

/**
 * Limit data to top/bottom N rows
 */
export const limitData = (data: TransformedData, limit: number): TransformedData => {
  return data.slice(0, Math.max(1, limit));
};

/** Columns a config plots on the y axis, in config order. */
export const chartValueColumns = (config: ChartConfig): string[] => {
  if (config.series?.length) return config.series.map((s) => s.column);
  return config.yAxis ? [config.yAxis] : [];
};

/**
 * Keeps a chart config consistent with itself after an edit. With
 * aggregation on, the rows are grouped by the x axis and hold only the x
 * column and the value columns, so:
 *
 * - the group column follows the x axis,
 * - the x column cannot also be a value column (its slot in the grouped
 *   row holds the key),
 * - a sort on any other column would sort on missing values and is dropped.
 *
 * Every settings control runs its result through here, so the rules live
 * once instead of in each handler.
 */
export const reconcileChartConfig = (config: ChartConfig): ChartConfig => {
  const transform = config.transform;
  if (!transform?.groupBy) return config;

  const groupBy = config.xAxis;
  const values = chartValueColumns(config).filter((column) => column !== groupBy);
  const series = config.series?.filter((s) => s.column !== groupBy);
  const sortBy = transform.sortBy;
  const sortKept = !sortBy || sortBy === groupBy || values.includes(sortBy);

  return {
    ...config,
    yAxis: config.yAxis === groupBy ? undefined : config.yAxis,
    series: series?.length ? series : undefined,
    transform: {
      ...transform,
      groupBy,
      ...(sortKept ? {} : { sortBy: undefined, sortOrder: undefined }),
    },
  };
};

/**
 * Transform query result data based on configuration
 */
export const transformData = (
  result: QueryResult,
  transform?: DataTransform,
  xAxis?: string,
  yAxis?: string | SeriesConfig[]
): TransformedData => {
  let data = [...result.data];

  // Apply grouping and aggregation. The chart settings group by the x axis:
  // one point per x value, each series aggregated over the rows sharing it.
  if (transform?.groupBy) {
    const valueColumns: ValueColumn[] = typeof yAxis === "string" ? [yAxis] : (yAxis ?? []);
    if (valueColumns.length > 0) {
      const aggregation = transform.aggregation || "sum";
      data = groupByColumn(data, transform.groupBy, valueColumns, aggregation);
    }
  }

  // Apply sorting
  if (transform?.sortBy && transform.sortOrder && transform.sortOrder !== "none") {
    data = sortData(data, transform.sortBy, transform.sortOrder);
  }

  // Apply limit
  if (transform?.limit && transform.limit > 0) {
    data = limitData(data, transform.limit);
  }

  return data;
};

/**
 * Detect recommended chart types based on data characteristics
 * Only suggests chart types that are actually implemented in ChartVisualizationPro
 * Implemented types: bar, grouped_bar, stacked_bar, line, area, stacked_area, pie, donut, scatter
 */
export const suggestChartTypes = (
  result: QueryResult,
  xAxis?: string,
  yAxis?: string | SeriesConfig[]
): string[] => {
  if (!xAxis || !yAxis) return ["bar"];

  const suggestions: string[] = [];
  const yColumn = typeof yAxis === "string" ? yAxis : yAxis[0]?.column;

  if (!yColumn) return ["bar"];

  const hasMultipleSeries = Array.isArray(yAxis) && yAxis.length > 1;
  const xIsNumeric = isNumericColumn(result.data, xAxis);
  const xIsDate = isDateColumn(result.data, xAxis);
  const yIsNumeric = isNumericColumn(result.data, yColumn);
  const dataSize = result.data.length;

  // Time series data
  if (xIsDate && yIsNumeric) {
    suggestions.push("line", "area", "stacked_area");
  }

  // Categorical x-axis with numeric y
  if (!xIsNumeric && yIsNumeric) {
    suggestions.push("bar", "stacked_bar", "grouped_bar");
    if (dataSize <= 10) {
      suggestions.push("pie", "donut");
    }
  }

  // Numeric both axes
  if (xIsNumeric && yIsNumeric) {
    suggestions.push("scatter", "line");
  }

  // Multi-series
  if (hasMultipleSeries) {
    suggestions.push("grouped_bar", "stacked_bar");
  }

  return suggestions.length > 0 ? suggestions : ["bar"];
};

/**
 * Detect recommended aggregations for a column
 */
export const suggestAggregations = (result: QueryResult, column: string): AggregationType[] => {
  if (isNumericColumn(result.data, column)) {
    return ["sum", "avg", "count", "min", "max"];
  }
  return ["count"];
};

/**
 * Generate a color palette based on number of series
 */
export const generateColorPalette = (count: number): string[] => {
  const baseColors = [
    "#D99B43", // Gold
    "#8B5CF6", // Purple
    "#3B82F6", // Blue
    "#10B981", // Green
    "#F59E0B", // Amber
    "#EF4444", // Red
    "#EC4899", // Pink
    "#6366F1", // Indigo
    "#14B8A6", // Teal
    "#F97316", // Orange
    "#A855F7", // Violet
    "#06B6D4", // Cyan
  ];

  if (count <= baseColors.length) {
    return baseColors.slice(0, count);
  }

  // Generate more colors by interpolating
  const colors = [...baseColors];
  while (colors.length < count) {
    const baseColor = baseColors[colors.length % baseColors.length];
    colors.push(adjustColorBrightness(baseColor, (colors.length % 3) * 20 - 20));
  }

  return colors;
};

/**
 * Adjust color brightness
 */
function adjustColorBrightness(hex: string, percent: number): string {
  // Remove # if present
  hex = hex.replace("#", "");

  // Parse RGB
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // Adjust brightness
  const adjust = (value: number) => {
    const adjusted = value + (value * percent) / 100;
    return Math.max(0, Math.min(255, Math.round(adjusted)));
  };

  // Convert back to hex
  const toHex = (value: number) => value.toString(16).padStart(2, "0");

  return `#${toHex(adjust(r))}${toHex(adjust(g))}${toHex(adjust(b))}`;
}

/**
 * Format value for display in charts
 */
export const formatChartValue = (value: unknown, format?: string): string => {
  if (value === null || value === undefined) return "";

  if (typeof value === "number") {
    if (format === "percent") {
      return `${(value * 100).toFixed(2)}%`;
    }
    if (format === "currency") {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(value);
    }
    if (format === "compact") {
      return new Intl.NumberFormat("en-US", {
        notation: "compact",
        compactDisplay: "short",
      }).format(value);
    }
    // Default number formatting
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value);
  }

  if (value instanceof Date) {
    return value.toLocaleDateString();
  }

  return String(value);
};
