<script lang="ts">
  import { formatNumber, formatNumberWithSuffix } from '@/lib/chartUtils'
  import { HEATMAP_MAX_CATEGORIES, heatLevel, type HeatmapData } from '@/lib/heatmap'
  import { getTheme } from '../../stores/theme.svelte'
  import { chartTheme, heatColor, inkOn } from './palette'

  interface Props {
    grid: HeatmapData
    xLabel: string
    yLabel: string
    valueLabel: string
  }

  let { grid, xLabel, yLabel, valueLabel }: Props = $props()
  const uid = $props.id()
  const gradientId = `heat-legend-${uid}`

  let width = $state(0)
  let height = $state(0)
  let hovered = $state<{ xi: number; yi: number } | null>(null)

  const CHAR_W = 6.5
  const LEGEND_H = 26

  // Colors are written as attributes, not classes, so the SVG still looks
  // right when it is serialized for an export.
  const colors = $derived.by(() => {
    getTheme()
    return { ...chartTheme(), low: heatColor(0), high: heatColor(1) }
  })

  const fills = $derived.by(() => {
    getTheme()
    return grid.cells.map((row) =>
      row.map((value) => (value === null ? null : heatColor(heatLevel(value, grid.min, grid.max)))),
    )
  })

  const left = $derived(
    Math.min(140, Math.max(...grid.yLabels.map((label) => label.length), 3) * CHAR_W + 10),
  )
  const top = 4
  const bottom = $derived(20 + LEGEND_H)
  const cellW = $derived(grid.xLabels.length ? Math.max(0, width - left - 4) / grid.xLabels.length : 0)
  const cellH = $derived(grid.yLabels.length ? Math.max(0, height - top - bottom) / grid.yLabels.length : 0)
  /** Every nth x label, so labels do not run into each other. */
  const xEvery = $derived.by(() => {
    const longest = Math.max(...grid.xLabels.map((label) => label.length), 1) * CHAR_W + 6
    return Math.max(1, Math.ceil(longest / Math.max(cellW, 1)))
  })
  const showValues = $derived(cellW >= 40 && cellH >= 18)

  function fit(label: string, room: number): string {
    const chars = Math.max(2, Math.floor(room / CHAR_W))
    return label.length > chars ? `${label.slice(0, chars - 1)}…` : label
  }
</script>

<div class="relative flex h-full w-full flex-col">
  {#if grid.cut}
    <p class="mb-1 text-[11px] text-fg-3">
      Showing the first {HEATMAP_MAX_CATEGORIES} categories per axis. Filter or group the query to see the rest.
    </p>
  {/if}
  <div class="relative min-h-0 flex-1" bind:clientWidth={width} bind:clientHeight={height}>
    {#if grid.cells.length === 0}
      <div class="flex h-full items-center justify-center text-[13px] text-fg-3">No numeric values</div>
    {:else if width > 0 && height > 0}
      <svg
        {width}
        {height}
        font-family={colors.fontFamily}
        font-size="11"
        role="img"
        aria-label="Heatmap of {valueLabel} by {xLabel} and {yLabel}, from {formatNumber(grid.min)} to {formatNumber(grid.max)}"
      >
        <defs>
          <linearGradient id={gradientId}>
            <stop offset="0" stop-color={colors.low} />
            <stop offset="1" stop-color={colors.high} />
          </linearGradient>
        </defs>

        {#each grid.yLabels as label, yi (yi)}
          <text x={left - 6} y={top + cellH * yi + cellH / 2} text-anchor="end" dominant-baseline="central" fill={colors.axis}>
            {fit(label, left - 8)}
          </text>
          {#each grid.cells[yi] as value, xi (xi)}
            {@const fill = fills[yi]?.[xi]}
            {#if value !== null && fill}
              <rect
                x={left + cellW * xi}
                y={top + cellH * yi}
                width={Math.max(0, cellW - 1)}
                height={Math.max(0, cellH - 1)}
                {fill}
                stroke={hovered?.xi === xi && hovered?.yi === yi ? colors.text : 'none'}
                role="presentation"
                onmouseenter={() => (hovered = { xi, yi })}
                onmouseleave={() => (hovered = null)}
              />
              {#if showValues}
                <text
                  x={left + cellW * xi + cellW / 2}
                  y={top + cellH * yi + cellH / 2}
                  text-anchor="middle"
                  dominant-baseline="central"
                  fill={inkOn(fill)}
                  pointer-events="none"
                >
                  {fit(formatNumberWithSuffix(value), cellW - 4)}
                </text>
              {/if}
            {/if}
          {/each}
        {/each}

        {#each grid.xLabels as label, xi (xi)}
          {#if xi % xEvery === 0}
            <text x={left + cellW * xi + cellW / 2} y={top + cellH * grid.yLabels.length + 14} text-anchor="middle" fill={colors.axis}>
              {fit(label, cellW * xEvery - 4)}
            </text>
          {/if}
        {/each}

        <g transform="translate({left}, {height - 12})">
          <text x="0" y="0" dominant-baseline="central" fill={colors.axis}>{formatNumberWithSuffix(grid.min)}</text>
          <rect x="44" y="-4" width="120" height="8" rx="2" fill="url(#{gradientId})" />
          <text x="170" y="0" dominant-baseline="central" fill={colors.axis}>{formatNumberWithSuffix(grid.max)}</text>
        </g>
      </svg>

      {#if hovered}
        {@const value = grid.cells[hovered.yi]?.[hovered.xi]}
        <div class="surface-card pointer-events-none absolute right-2 top-2 z-10 rounded-md px-2.5 py-1.5 text-xs">
          <div class="max-w-[240px] truncate text-fg-3">
            {xLabel} <span class="text-fg">{grid.xLabels[hovered.xi]}</span>
          </div>
          <div class="max-w-[240px] truncate text-fg-3">
            {yLabel} <span class="text-fg">{grid.yLabels[hovered.yi]}</span>
          </div>
          <div class="text-fg-3">
            {valueLabel} <span class="font-medium tabular-nums text-fg">{value === null || value === undefined ? '' : formatNumber(value)}</span>
          </div>
        </div>
      {/if}
    {/if}
  </div>
</div>
