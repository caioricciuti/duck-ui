---
title: "Charts"
description: "Data visualization with bar, line, area, pie, and scatter charts"
---

Duck-UI turns any query result into a chart directly in your browser. Pick a type, an X column and one or more value columns, and the chart follows your result and your theme. Charts are drawn with [uPlot](https://github.com/leeoniya/uPlot) on a canvas; pie and donut charts are SVG.

## Chart Types

- **Bar** - Vertical bars for comparing values, one bar per category
- **Grouped Bar** - Side-by-side comparison of multiple series
- **Stacked Bar** - Cumulative visualization showing part-to-whole relationships
- **Line** - Trends and time series data
- **Area** - Filled line charts emphasizing volume
- **Stacked Area** - Cumulative area visualization
- **Pie** - Part-to-whole relationships in a circular format
- **Donut** - Pie chart with a center hole
- **Scatter** - Correlation between two numeric variables

These nine types are the chart builder's whole list. Dashboards use the same renderers; see [Dashboards](/docs/dashboards#charts) for how the `<BubbleChart/>`, `<FunnelChart/>`, `<BoxPlot/>` and `<Heatmap/>` tags behave there.

## Key Features

### 1. Multi-Series Support
- **Select any number of value columns** - Perfect for comparing multiple metrics
- **Automatic color coding** - Each series gets a distinct color from the palette, starting with the accent color of the current theme
- **Visual indicators** - Color dots show which columns are selected
- **Legend toggles** - Click a series in the legend to hide or show it
- Works with grouped bar, stacked bar, line, area and stacked area charts

### 2. Data Transformations
- **Aggregations**: Sum, Average, Count, Min, Max, grouped by the X column and applied to every value column
- **Sorting**: By any column, ascending or descending
- **Limit rows**: Show only the first N rows after sorting
- **Smart defaults**: A fresh chart picks a type, an X column and a value column from the result, skipping constant columns

### 3. Visual Customization
- **Show values**: Print the value on each bar
- **Show grid**: Toggle grid lines
- **Smooth lines**: Spline interpolation for line and area charts
- **Theme**: Colors follow the light or dark theme; a chart made in one theme looks right in the other

### 4. Export
- **Export as PNG** - The chart canvas or SVG is drawn to an offscreen canvas at 2x scale, with the legend under it
- Single click via the download button

### 5. Interactive Features
- **Responsive**: The chart resizes with the panel
- **Hover tooltips**: Values for every series at the hovered X position
- **Type detection**: Only numeric columns are offered as values
- **Y axis includes zero**, and bars are centered on their category

## Usage Guide

### Basic Workflow

1. **Run a SQL Query** - Execute any query in the SQL editor
2. **Switch to Charts** - Click the "Charts" view in the result panel
3. **Configure Your Chart** from the toolbar:
   - The type selector on the left
   - **X**: the category or time column
   - **Y**: a popover listing the numeric columns; tick as many as you need

Every change applies immediately. There is no Apply button.

### Creating Multi-Series Charts

1. Select a chart type that supports multiple series:
   - Grouped Bar (side-by-side comparison)
   - Stacked Bar (cumulative view)
   - Line (trends)
   - Area or Stacked Area

2. Open the **Y** popover and tick two or more numeric columns
   - Each selected column gets a unique color
   - The color dot appears next to the column name and in the legend

3. Click a series in the legend to hide it temporarily. Hidden series are left out of the PNG export

### Chart settings

Click the settings icon to open:
- **Sort by** and order
- **Limit rows**
- **Aggregation** (None, Sum, Average, Count, Min, Max)
- **Show values**, **Show grid**, and **Smooth lines** for line and area charts

### Reset and export

- The reset button returns the chart to the detected defaults
- The download button exports the chart as a PNG image

### Charts elsewhere

- **Notebooks**: every SQL cell has its own chart with the same builder
- **Dashboards**: charts are declared in markdown and rendered without the toolbar
- **Share links and embeds**: the chart configuration travels with the query, so a recipient sees the same chart

## Technical Architecture

### Core Components

**`ChartView.svelte`** (`src/lib/components/charts/`) - The chart builder
- Toolbar, settings popover, legend and export
- Passes a `ChartConfig` to the renderers; dashboards render it read-only

**`xyChart.ts`** - Builds uPlot options and data for bar, line, area and scatter charts, including stacking, grouping and the tooltip plugin

**`PieChart.svelte`** - SVG pie and donut charts

**`palette.ts`** - The chart palette, starting from the theme accent color

**`chartDataTransform.ts`** (`src/lib/`) - Aggregation, grouping, sorting, limits and type detection

**`chartAutoConfig.ts`** - Detects a sensible default chart for a result

**`chartExport.ts`** - PNG export from the canvas or SVG, drawn on an offscreen canvas at 2x scale with the legend

### Type System

```typescript
interface ChartConfig {
  type: ChartType;
  xAxis: string;
  yAxis?: string; // Single series
  series?: SeriesConfig[]; // Multi-series
  transform?: DataTransform;
  colors?: string[];
  legend?: LegendConfig;
  showGrid?: boolean;
  showValues?: boolean;
  smooth?: boolean;
  innerRadius?: number;
  title?: string;
}

interface SeriesConfig {
  column: string;
  label?: string;
  color?: string;
}

interface DataTransform {
  groupBy?: string;
  aggregation?: "none" | "sum" | "avg" | "count" | "min" | "max";
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  limit?: number;
}
```

## Best Practices

### Choosing Chart Types

- **Time Series Data** - Line or Area charts
- **Comparisons** - Bar or Grouped Bar charts
- **Part-to-Whole** - Pie, Donut or Stacked Bar charts
- **Correlations** - Scatter plots
- **Multi-Metric Comparison** - Grouped Bar or multi-series Line charts

### Performance Tips

- Limit data to reasonable sizes (< 10,000 rows for interactive charts)
- Use SQL aggregations for large datasets
- Apply LIMIT clauses, or the chart's own row limit, to focus on key items

### Design Tips

- Use color strategically (don't overuse)
- Keep legends concise
- Use consistent color schemes across related charts
- Consider accessibility when choosing colors

## Examples

### Example 1: Revenue Trend
```sql
SELECT
  DATE_TRUNC('month', order_date) as month,
  SUM(revenue) as total_revenue
FROM sales
GROUP BY 1
ORDER BY 1;
```
**Chart**: Line chart with month on X-axis, total_revenue on Y-axis

### Example 2: Multi-Metric Comparison
```sql
SELECT
  category,
  SUM(sales) as total_sales,
  SUM(profit) as total_profit,
  SUM(revenue) as total_revenue
FROM products
GROUP BY category;
```
**Chart**: Grouped bar chart comparing metrics per category
- Select `category` for X
- Tick `total_sales`, `total_profit` and `total_revenue` under Y

### Example 3: Market Share
```sql
SELECT
  product_name,
  revenue
FROM product_summary
ORDER BY revenue DESC
LIMIT 10;
```
**Chart**: Donut chart showing top 10 products by revenue

## Troubleshooting

### Chart not displaying
- Ensure the query returns data
- Check that an X column and at least one value column are selected; the chart says so when one is missing
- Verify the value columns are numeric; only numeric columns appear in the Y popover

### Export not working
- Check browser permissions for downloads
- Disable ad blockers if necessary
- Ensure the chart is fully rendered before exporting

### Poor performance
- Reduce data size using SQL LIMIT or the chart's row limit
- Apply aggregations in your SQL query
- Use fewer series

### Colors not showing correctly
- Colors follow the theme; switch the theme in Settings > General to check
- Ensure numeric columns are selected as values
- Verify data types are correct

## Not in this version

The chart builder offers the nine types above. Dashboard tags for box plots and heatmaps render a placeholder, bubble charts draw as scatter plots and funnel charts as bars. Combo charts, dual Y axes, annotations and zooming are not available.
