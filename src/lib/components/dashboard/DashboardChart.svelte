<script lang="ts">
  import ChartView from '../charts/ChartView.svelte'
  import UPlotChart from '../charts/UPlotChart.svelte'
  import { buildXYChart } from '../charts/xyChart'
  import { getTheme } from '../../stores/theme.svelte'
  import { CHART_COMPONENTS, type ComponentBlock } from '@/services/dashboard/markdown'
  import { pivotForSeries } from '@/services/dashboard/chartData'
  import { isNumericColumn } from '@/lib/chartDataTransform'
  import type { ChartConfig, ChartType, QueryResult } from '@/store/types'
  import { propText } from './blockHelpers'

  interface Props {
    block: ComponentBlock
    result: QueryResult
  }

  let { block, result }: Props = $props()

  /** Chart types the uPlot and SVG renderers draw. */
  const DRAWABLE: ReadonlySet<string> = new Set([
    'bar', 'grouped_bar', 'stacked_bar', 'line', 'area', 'stacked_area', 'pie', 'donut', 'scatter',
  ])
  /** Tags without a renderer of their own, drawn as their closest relative. */
  const FALLBACK: Record<string, ChartType> = { bubble: 'scatter', funnel: 'bar' }
  const NO_SERIES_HIDDEN: ReadonlySet<string> = new Set()

  const isSparkline = $derived(block.tag === 'Sparkline')
  const title = $derived(propText(block.props.title))

  const chart = $derived.by(() => {
    const declared = CHART_COMPONENTS[block.tag] as ChartType
    const chartType = FALLBACK[declared] ?? declared
    const x = propText(block.props.x) ?? result.columns[0] ?? ''
    const y =
      propText(block.props.y) ??
      // Without y=, the first numeric column is what the author most likely meant.
      result.columns.find((column) => column !== x && isNumericColumn(result.data, column))
    const seriesColumn = propText(block.props.series)

    // `series=col` pivots long data into one series per distinct value.
    const pivoted = seriesColumn && y ? pivotForSeries(result, x, y, seriesColumn) : null

    // `type=stacked|grouped` refines bar/area the way Evidence does.
    const variant = propText(block.props.type)
    const type: ChartType =
      chartType === 'bar' && variant === 'stacked'
        ? 'stacked_bar'
        : chartType === 'bar' && variant === 'grouped'
          ? 'grouped_bar'
          : chartType === 'area' && (variant === 'stacked' || pivoted)
            ? 'stacked_area'
            : chartType === 'bar' && pivoted
              ? 'grouped_bar'
              : chartType

    const config: ChartConfig = {
      type,
      xAxis: x,
      yAxis: pivoted ? undefined : y,
      series: pivoted ? pivoted.seriesColumns.map((column) => ({ column, label: column })) : undefined,
      title,
      showGrid: !isSparkline,
      legend: { show: !isSparkline, position: 'bottom' },
    }
    return { config, data: pivoted?.result ?? result }
  })

  // A sparkline is a glance, not a figure: the line alone, no axes.
  const sparkline = $derived.by(() => {
    if (!isSparkline) return null
    // The series color follows the theme.
    getTheme()
    const xy = buildXYChart(chart.config, chart.data.data, NO_SERIES_HIDDEN)
    if (!xy) return null
    return {
      data: xy.data,
      options: {
        ...xy.options,
        axes: (xy.options.axes ?? []).map((axis) => ({ ...axis, show: false })),
        cursor: { show: false },
        plugins: [],
        padding: [4, 4, 4, 4] as [number, number, number, number],
      },
    }
  })
</script>

{#if !DRAWABLE.has(chart.config.type)}
  <div class="my-3 flex min-h-24 items-center justify-center rounded-md border border-dashed border-edge px-3 text-xs text-fg-3">
    &lt;{block.tag}&gt; has no renderer in this version yet
  </div>
{:else if isSparkline}
  <div class="my-3 h-12" role="img" aria-label={title ?? `Sparkline of ${chart.config.yAxis ?? 'values'}`}>
    {#if sparkline}
      <UPlotChart options={sparkline.options} data={sparkline.data} class="h-full w-full" />
    {/if}
  </div>
{:else}
  <figure class="my-3 flex h-80 flex-col rounded-md border border-edge p-2">
    {#if title}
      <figcaption class="shrink-0 px-1 pb-1 text-xs font-medium text-fg-2">{title}</figcaption>
    {/if}
    <div class="min-h-0 flex-1">
      <ChartView result={chart.data} chartConfig={chart.config} onconfigchange={() => {}} readonly />
    </div>
  </figure>
{/if}
