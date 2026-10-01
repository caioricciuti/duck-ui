<script lang="ts">
  import { onMount } from 'svelte'
  import {
    ArrowUpDown,
    ChartArea,
    ChartColumn,
    ChartColumnStacked,
    ChartLine,
    ChartPie,
    ChartScatter,
    Check,
    ChevronDown,
    CircleDot,
    Download,
    Layers,
    RotateCcw,
    Settings2,
    TrendingUp,
  } from 'lucide-svelte'
  import type { AggregationType, ChartConfig, ChartType, DataTransform, QueryResult } from '@/store/types'
  import { autoDetectChartConfig } from '@/lib/chartAutoConfig'
  import { chartValueColumns, isNumericColumn, reconcileChartConfig, transformData } from '@/lib/chartDataTransform'
  import { exportChartAsPNG } from '@/lib/chartExport'
  import { formatNumberWithSuffix } from '@/lib/chartUtils'
  import { getTheme } from '../../stores/theme.svelte'
  import { success, error as toastError } from '../../stores/toast.svelte'
  import Button from '../common/Button.svelte'
  import Input from '../common/Input.svelte'
  import Select from '../common/Select.svelte'
  import PieChart from './PieChart.svelte'
  import Popover from './Popover.svelte'
  import UPlotChart from './UPlotChart.svelte'
  import { chartTheme, resolvePalette } from './palette'
  import { buildXYChart, describeSeries } from './xyChart'

  interface Props {
    result: QueryResult
    chartConfig?: ChartConfig
    onconfigchange: (config: ChartConfig | undefined) => void
    /**
     * Presentation mode: render only the chart, no configuration toolbar.
     * Used inside dashboard documents, where the config lives in the markdown
     * and a toolbar per chart would turn a report into a cockpit.
     */
    readonly?: boolean
  }

  let { result, chartConfig, onconfigchange, readonly = false }: Props = $props()

  const CHART_TYPES: { value: ChartType; label: string; icon: typeof ChartColumn }[] = [
    { value: 'bar', label: 'Bar', icon: ChartColumn },
    { value: 'grouped_bar', label: 'Grouped Bar', icon: Layers },
    { value: 'stacked_bar', label: 'Stacked Bar', icon: ChartColumnStacked },
    { value: 'line', label: 'Line', icon: ChartLine },
    { value: 'area', label: 'Area', icon: ChartArea },
    { value: 'stacked_area', label: 'Stacked Area', icon: TrendingUp },
    { value: 'pie', label: 'Pie', icon: ChartPie },
    { value: 'donut', label: 'Donut', icon: CircleDot },
    { value: 'scatter', label: 'Scatter', icon: ChartScatter },
  ]

  const AGGREGATIONS: { value: AggregationType; label: string }[] = [
    { value: 'none', label: 'None' },
    { value: 'sum', label: 'Sum' },
    { value: 'avg', label: 'Average' },
    { value: 'count', label: 'Count' },
    { value: 'min', label: 'Min' },
    { value: 'max', label: 'Max' },
  ]

  const NO_SORT = '__none__'
  const uid = $props.id()

  let chartEl = $state<HTMLDivElement | null>(null)
  // Columns switched off in the legend. Kept by column, so the choice
  // survives a change of chart type or series order.
  let hidden = $state<ReadonlySet<string>>(new Set())

  const hasData = $derived(Boolean(result?.data?.length))
  const numericColumns = $derived(result.columns.filter((col) => isNumericColumn(result.data, col)))

  // No colors in the detected config: a config without them follows the
  // theme palette, one with them would freeze today's accent into the tab.
  const autoConfig = $derived<ChartConfig>({ ...autoDetectChartConfig(result), colors: undefined })
  const config = $derived(chartConfig ?? autoConfig)

  const typeInfo = $derived(CHART_TYPES.find((t) => t.value === config.type))
  const isPie = $derived(config.type === 'pie' || config.type === 'donut')
  const isLineOrArea = $derived(['line', 'area', 'stacked_area'].includes(config.type))
  const selectedColumns = $derived(chartValueColumns(config))
  const grouped = $derived(Boolean(config.transform?.groupBy))

  // Grouped rows keep the x column as their key, so it cannot be a value too.
  const valueColumns = $derived(grouped ? numericColumns.filter((col) => col !== config.xAxis) : numericColumns)

  // Grouped rows hold only the x column and the value columns, so sorting by
  // anything else would sort on missing values.
  const sortColumns = $derived(grouped ? [config.xAxis, ...selectedColumns] : result.columns)

  const rows = $derived(transformData(result, config.transform, config.xAxis, config.yAxis || config.series))

  const xy = $derived.by(() => {
    // The palette starts with the accent, which differs per theme.
    getTheme()
    return isPie ? null : buildXYChart(config, rows, hidden)
  })

  const seriesInfo = $derived.by(() => {
    getTheme()
    return describeSeries(config)
  })

  const pieColors = $derived.by(() => {
    getTheme()
    return resolvePalette(config.colors)
  })

  const pieSlices = $derived.by(() => {
    const valueColumn = selectedColumns[0] ?? ''
    return rows.map((row) => ({
      label: String(row[config.xAxis]),
      value: Number(row[valueColumn]) || 0,
    }))
  })

  // Auto-chart: store the detected config when the tab has none yet.
  onMount(() => {
    if (!chartConfig && hasData) onconfigchange(autoConfig)
  })

  // Every edit passes through reconcileChartConfig, which keeps the group
  // column, the value columns and the sort column consistent.
  function updateConfig(updates: Partial<ChartConfig>) {
    onconfigchange(reconcileChartConfig({ ...config, ...updates }))
  }

  function updateTransform(updates: Partial<DataTransform>) {
    updateConfig({ transform: { ...config.transform, ...updates } })
  }

  function toggleColumn(column: string) {
    const columns = selectedColumns.includes(column)
      ? selectedColumns.filter((c) => c !== column)
      : [...selectedColumns, column]
    // Keep what a series already carries (its aggregation, color, type).
    const existing = new Map((config.series ?? []).map((s) => [s.column, s]))
    updateConfig({
      series: columns.length > 1 ? columns.map((c) => existing.get(c) ?? { column: c, label: c }) : undefined,
      yAxis: columns.length === 1 ? columns[0] : undefined,
    })
  }

  function toggleSeries(column: string) {
    const next = new Set(hidden)
    if (!next.delete(column)) next.add(column)
    hidden = next
  }

  function reset() {
    hidden = new Set()
    onconfigchange(autoConfig)
  }

  async function exportPNG() {
    if (!chartEl) {
      toastError('No chart to export')
      return
    }
    const theme = chartTheme()
    const total = pieSlices.reduce((sum, s) => sum + s.value, 0)
    const legend = isPie
      ? pieSlices.map((s, i) => ({
          label: `${s.label}: ${formatNumberWithSuffix(s.value)} (${total ? ((s.value / total) * 100).toFixed(1) : '0'}%)`,
          color: pieColors[i % pieColors.length],
        }))
      : seriesInfo.filter((s) => !hidden.has(s.column))
    try {
      await exportChartAsPNG(chartEl, `chart-${Date.now()}.png`, theme.surface, {
        // A single series is named by the axis, a legend adds nothing.
        legend: isPie || legend.length > 1 ? legend : [],
        textColor: theme.text,
        fontFamily: theme.fontFamily,
      })
      success('Chart exported as PNG')
    } catch (err) {
      toastError(`Failed to export chart: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }
</script>

{#snippet toggle(label: string, checked: boolean, onchange: (value: boolean) => void)}
  <div class="flex items-center justify-between">
    <span class="text-xs text-fg-2" aria-hidden="true">{label}</span>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      class="relative h-4 w-7 shrink-0 rounded-full transition-colors duration-100 {checked ? 'bg-accent' : 'bg-active'}"
      onclick={() => onchange(!checked)}
    >
      <span
        class="absolute top-0.5 h-3 w-3 rounded-full transition-all duration-100 {checked
          ? 'left-3.5 bg-accent-fg'
          : 'left-0.5 bg-fg-3'}"
      ></span>
    </button>
  </div>
{/snippet}

{#snippet chart()}
  <div class="flex h-full flex-col">
    {#if config.title}
      <p class="shrink-0 truncate px-1 pb-1 text-xs font-medium text-fg-2" title={config.title}>{config.title}</p>
    {/if}
    <div class="min-h-0 flex-1">
      {#if isPie}
        <PieChart
          slices={pieSlices}
          colors={pieColors}
          donut={config.type === 'donut'}
          innerRadius={config.innerRadius ? config.innerRadius / 120 : 0.45}
        />
      {:else if xy}
        <div class="flex h-full flex-col">
          <div class="min-h-0 flex-1">
            <UPlotChart options={xy.options} data={xy.data} class="h-full w-full" />
          </div>
          {#if xy.series.length > 1}
            <div class="flex flex-wrap justify-center gap-x-4 gap-y-1 py-1 text-xs">
              {#each xy.series as s (s.column)}
                {@const shown = !hidden.has(s.column)}
                <button
                  type="button"
                  class="flex items-center gap-1.5 transition-opacity hover:opacity-80 {shown ? '' : 'opacity-35'}"
                  aria-pressed={shown}
                  title={shown ? 'Hide series' : 'Show series'}
                  onclick={() => toggleSeries(s.column)}
                >
                  <span class="h-2.5 w-2.5 shrink-0 rounded-full" style="background-color: {s.color}"></span>
                  <span class="text-fg-3">{s.label}</span>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {:else}
        <div class="flex h-full items-center justify-center text-[13px] text-fg-3">
          Pick a column for the X axis and at least one value column.
        </div>
      {/if}
    </div>
  </div>
{/snippet}

{#if !hasData}
  <div class="flex h-full items-center justify-center text-[13px] text-fg-3">
    No data available for visualization
  </div>
{:else if readonly}
  <div class="h-full min-h-0">{@render chart()}</div>
{:else}
  <div class="flex h-full flex-col">
    <div class="flex flex-wrap items-center gap-2 border-b border-edge-subtle bg-surface px-3 py-1.5">
      <div class="flex shrink-0 items-center gap-1.5">
        {#if typeInfo}
          {@const Icon = typeInfo.icon}
          <Icon size={14} class="text-fg-3" />
        {/if}
        <label class="sr-only" for="{uid}-type">Chart type</label>
        <Select
          id="{uid}-type"
          size="sm"
          class="w-36"
          value={config.type}
          options={CHART_TYPES.map(({ value, label }) => ({ value, label }))}
          onchange={(value) => updateConfig({ type: value as ChartType })}
        />
      </div>

      <div class="flex shrink-0 items-center gap-1.5">
        <label class="text-xs text-fg-3" for="{uid}-x">X</label>
        <Select
          id="{uid}-x"
          size="sm"
          class="w-36"
          placeholder="Column"
          value={config.xAxis}
          options={result.columns.map((col) => ({ value: col, label: col }))}
          onchange={(value) => updateConfig({ xAxis: value })}
        />
      </div>

      <Popover label="Value columns" panelClass="w-56 p-1.5" class="shrink-0">
        {#snippet trigger({ open, toggle: togglePanel })}
          <button
            type="button"
            class="ds-select flex w-48 items-center gap-1.5 text-left"
            aria-haspopup="dialog"
            aria-expanded={open}
            onclick={togglePanel}
          >
            <span class="text-fg-3">Y</span>
            <span class="min-w-0 flex-1 truncate {selectedColumns.length ? '' : 'text-fg-4'}">
              {selectedColumns.length ? selectedColumns.join(', ') : 'Values...'}
            </span>
            <ChevronDown size={13} class="shrink-0 text-fg-4" />
          </button>
        {/snippet}
        {#if valueColumns.length === 0}
          <p class="px-2 py-3 text-center text-xs text-fg-3">
            {numericColumns.length ? 'The X column is the group key' : 'No numeric columns in this result'}
          </p>
        {:else}
          <ul class="max-h-56 overflow-y-auto">
            {#each valueColumns as col (col)}
              {@const info = seriesInfo.find((s) => s.column === col)}
              <li>
                <button
                  type="button"
                  aria-pressed={Boolean(info)}
                  class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs text-fg-2 transition-colors hover:bg-hover hover:text-fg"
                  onclick={() => toggleColumn(col)}
                >
                  <span
                    class="h-2.5 w-2.5 shrink-0 rounded-full {info ? '' : 'border border-edge-strong'}"
                    style={info ? `background-color: ${info.color}` : undefined}
                  ></span>
                  <span class="min-w-0 flex-1 truncate" title={col}>{col}</span>
                  {#if info}<Check size={13} class="shrink-0 text-accent" />{/if}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </Popover>

      <div class="ml-auto flex items-center gap-0.5">
        <Popover label="Chart settings" align="end" panelClass="w-64">
          {#snippet trigger({ open, toggle: togglePanel })}
            <Button
              icon
              variant="ghost"
              size="sm"
              title="Chart settings"
              aria-label="Chart settings"
              aria-expanded={open}
              onclick={togglePanel}
            >
              <Settings2 size={14} />
            </Button>
          {/snippet}
          <div class="flex flex-col gap-3">
            <h4 class="text-[13px] font-semibold text-fg">Chart settings</h4>

            <div class="flex flex-col gap-1">
              <label class="text-xs text-fg-3" for="{uid}-title">Title</label>
              <Input
                id="{uid}-title"
                size="sm"
                placeholder="No title"
                value={config.title ?? ''}
                oninput={(e) => updateConfig({ title: e.currentTarget.value || undefined })}
              />
            </div>

            <div class="flex flex-col gap-1">
              <label class="flex items-center gap-1 text-xs text-fg-3" for="{uid}-sort">
                <ArrowUpDown size={12} /> Sort by
              </label>
              <div class="flex gap-1.5">
                <Select
                  id="{uid}-sort"
                  size="sm"
                  class="min-w-0 flex-1"
                  value={config.transform?.sortBy ?? NO_SORT}
                  options={[{ value: NO_SORT, label: 'None' }, ...sortColumns.map((col) => ({ value: col, label: col }))]}
                  onchange={(value) =>
                    updateTransform(
                      value === NO_SORT
                        ? { sortBy: undefined }
                        : // transformData only sorts when an order is set.
                          { sortBy: value, sortOrder: config.transform?.sortOrder ?? 'asc' }
                    )}
                />
                {#if config.transform?.sortBy}
                  <label class="sr-only" for="{uid}-order">Sort order</label>
                  <Select
                    id="{uid}-order"
                    size="sm"
                    class="w-20"
                    value={config.transform.sortOrder ?? 'asc'}
                    options={[
                      { value: 'asc', label: 'Asc' },
                      { value: 'desc', label: 'Desc' },
                    ]}
                    onchange={(value) => updateTransform({ sortOrder: value as 'asc' | 'desc' })}
                  />
                {/if}
              </div>
            </div>

            <div class="flex flex-col gap-1">
              <label class="text-xs text-fg-3" for="{uid}-limit">Limit rows</label>
              <Input
                id="{uid}-limit"
                type="number"
                size="sm"
                min={0}
                placeholder="No limit"
                value={config.transform?.limit ?? ''}
                oninput={(e) => {
                  const limit = parseInt(e.currentTarget.value, 10)
                  updateTransform({ limit: Number.isNaN(limit) ? undefined : limit })
                }}
              />
            </div>

            <div class="flex flex-col gap-1">
              <label class="text-xs text-fg-3" for="{uid}-agg">Aggregation</label>
              <Select
                id="{uid}-agg"
                size="sm"
                value={config.transform?.aggregation ?? 'none'}
                options={AGGREGATIONS}
                onchange={(value) =>
                  updateTransform({
                    aggregation: value as AggregationType,
                    groupBy: value !== 'none' ? config.xAxis : undefined,
                  })}
              />
            </div>

            <div class="flex flex-col gap-2.5 border-t border-edge-subtle pt-3">
              {@render toggle('Show values', config.showValues ?? false, (v) => updateConfig({ showValues: v }))}
              {@render toggle('Show grid', config.showGrid ?? true, (v) => updateConfig({ showGrid: v }))}
              {#if isLineOrArea}
                {@render toggle('Smooth lines', config.smooth ?? false, (v) => updateConfig({ smooth: v }))}
              {/if}
            </div>
          </div>
        </Popover>

        <Button icon variant="ghost" size="sm" title="Download as PNG" aria-label="Download chart as PNG" onclick={exportPNG}>
          <Download size={14} />
        </Button>
        <Button icon variant="ghost" size="sm" title="Reset chart" aria-label="Reset chart" onclick={reset}>
          <RotateCcw size={13} />
        </Button>
      </div>
    </div>

    <div bind:this={chartEl} class="min-h-0 flex-1 p-2">
      {@render chart()}
    </div>
  </div>
{/if}
