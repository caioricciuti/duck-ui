<script lang="ts">
  import { untrack } from 'svelte'
  import uPlot from 'uplot'
  import 'uplot/dist/uPlot.min.css'
  import { getTheme } from '../../stores/theme.svelte'
  import { chartTheme } from './palette'

  interface Props {
    /** Axis, grid, tick colors and fonts left unset here are filled from the theme. */
    options: Omit<uPlot.Options, 'width' | 'height'>
    data: uPlot.AlignedData
    class?: string
    oninit?: (chart: uPlot) => void
  }

  let { options, data, class: cls = '', oninit }: Props = $props()

  let container = $state<HTMLDivElement | null>(null)
  let chart: uPlot | null = null

  function themed(opts: Props['options']): Props['options'] {
    const theme = chartTheme()
    const font = `12px ${theme.fontFamily}`
    // uPlot draws two axes when none are given, so theme those two.
    const axes = (opts.axes ?? [{}, {}]).map((axis) => ({
      ...axis,
      stroke: axis.stroke ?? theme.axis,
      font: axis.font ?? font,
      labelFont: axis.labelFont ?? font,
      grid: { stroke: theme.grid, width: 1, ...axis.grid },
      ticks: { stroke: theme.ticks, width: 1, ...axis.ticks },
    }))
    return { ...opts, axes }
  }

  function destroy() {
    chart?.destroy()
    chart = null
  }

  function create() {
    destroy()
    if (!container) return
    const { width, height } = container.getBoundingClientRect()
    // A hidden container has no size. The resize observer creates the chart
    // once it becomes visible.
    if (width === 0 || height === 0) return
    chart = new uPlot({ ...themed(options), width, height }, data, container)
    oninit?.(chart)
  }

  $effect(() => {
    // Canvas pixels do not follow CSS variables: rebuild on theme change.
    getTheme()
    void options
    void data
    if (!container) return
    untrack(create)
    return destroy
  })

  $effect(() => {
    if (!container) return
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      if (width === 0 || height === 0) return
      if (chart) chart.setSize({ width, height })
      else create()
    })
    observer.observe(container)
    return () => observer.disconnect()
  })
</script>

<div bind:this={container} class="uplot-host min-h-0 {cls}"></div>

<style>
  /* The tooltip is built by tooltipPlugin outside Svelte, so its classes
     cannot be scoped or expressed as utilities. */
  .uplot-host :global(.uplot-tooltip) {
    min-width: 120px;
    padding: 6px 9px;
    border: 1px solid var(--edge);
    border-radius: var(--radius-lg);
    background: var(--elevated);
    color: var(--fg);
    box-shadow: var(--shadow-popover);
    font-size: 11px;
    line-height: 1.5;
    white-space: nowrap;
  }
  .uplot-host :global(.uplot-tooltip-title) {
    margin-bottom: 4px;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--edge-subtle);
    color: var(--fg-2);
    font-weight: 600;
  }
  .uplot-host :global(.uplot-tooltip-row),
  .uplot-host :global(.uplot-tooltip-total) {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .uplot-host :global(.uplot-tooltip-dot) {
    width: 7px;
    height: 7px;
    flex-shrink: 0;
    border-radius: 2px;
  }
  .uplot-host :global(.uplot-tooltip-label) {
    flex: 1;
    color: var(--fg-3);
  }
  .uplot-host :global(.uplot-tooltip-value) {
    margin-left: 12px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .uplot-host :global(.uplot-tooltip-pct) {
    color: var(--fg-3);
    font-weight: 400;
  }
  .uplot-host :global(.uplot-tooltip-total) {
    margin-top: 4px;
    padding-top: 4px;
    border-top: 1px solid var(--edge-subtle);
    font-weight: 600;
  }
</style>
