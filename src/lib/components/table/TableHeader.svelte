<script lang="ts">
  import type { ColumnMeta } from '../../types/query'
  import type { ColumnStats } from '../../utils/stats'
  import { getDisplayType, isRightAligned } from '../../utils/column-types'
  import { formatNumber } from '../../utils/format'
  import { ArrowUp, ArrowDown, Filter } from 'lucide-svelte'

  interface Props {
    columns: ColumnMeta[]
    widths: number[]
    sortColumn?: string
    sortDir?: 'asc' | 'desc'
    onsort?: (column: string) => void
    filteredColumns?: string[]
    onfilterclick?: (column: string, e: MouseEvent) => void
    onresize?: (index: number, width: number) => void
    onfitcolumn?: (index: number) => void
    onfitall?: () => void
    /** One entry per column. When given, each header gets a summary line. */
    stats?: ColumnStats[]
    /** Which rows the summary covers, for its tooltip. */
    statsScope?: string
  }

  let {
    columns, widths, sortColumn = '', sortDir = 'asc', onsort, filteredColumns = [], onfilterclick,
    onresize, onfitcolumn, onfitall, stats, statsScope = '',
  }: Props = $props()

  const num = (value: number | undefined) =>
    value === undefined ? '' : value.toLocaleString(undefined, { maximumFractionDigits: 2 })

  const share = (part: number, whole: number) => {
    const percent = whole > 0 ? (part / whole) * 100 : 0
    return percent > 0 && percent < 1 ? '<1%' : `${Math.round(percent)}%`
  }

  /** The numbers behind the drawing, for the tooltip and for screen readers. */
  function describe(stat: ColumnStats): string {
    const parts: string[] = []
    if (stat.displayType === 'number' && stat.min !== undefined) {
      parts.push(`min ${num(stat.min)}`, `max ${num(stat.max)}`, `avg ${num(stat.avg)}`)
    } else if (stat.displayType === 'date' && stat.earliest) {
      parts.push(`${stat.earliest} to ${stat.latest}`)
    } else if (stat.displayType === 'bool') {
      parts.push(`true ${formatNumber(stat.trueCount ?? 0)}`, `false ${formatNumber(stat.falseCount ?? 0)}`)
    } else if (stat.distinct !== undefined) {
      parts.push(`${formatNumber(stat.distinct)}${stat.distinctCapped ? '+' : ''} distinct`)
    }
    parts.push(`${formatNumber(stat.nulls)} null`)
    if (statsScope) parts.push(statsScope)
    return parts.join(' · ')
  }

  function handleFilterClick(e: MouseEvent, column: string) {
    e.preventDefault()
    e.stopPropagation()
    onfilterclick?.(column, e)
  }

  let resizing = $state<{ index: number; startX: number; startWidth: number } | null>(null)

  function handleMouseDown(e: MouseEvent, index: number) {
    e.preventDefault()
    e.stopPropagation()
    resizing = { index, startX: e.clientX, startWidth: widths[index] }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  function handleMouseMove(e: MouseEvent) {
    if (!resizing) return
    const delta = e.clientX - resizing.startX
    const newWidth = Math.max(50, resizing.startWidth + delta)
    onresize?.(resizing.index, newWidth)
  }

  function handleMouseUp() {
    resizing = null
    window.removeEventListener('mousemove', handleMouseMove)
    window.removeEventListener('mouseup', handleMouseUp)
  }

  function handleFitColumn(e: MouseEvent, index: number) {
    e.preventDefault()
    e.stopPropagation()
    onfitcolumn?.(index)
  }

  function compactTypeLabel(type: string): string {
    const normalized = type.replace(/\s+/g, '')

    if (normalized.length <= 16) return normalized
    return `${normalized.slice(0, 15)}…`
  }

  function typeTone(type: string): string {
    switch (getDisplayType(type)) {
      // One quiet tone for every type: the column name leads, the type is a
      // hint. The display type still drives alignment and cell rendering.
      case 'number':
      case 'date':
      case 'bool':
      case 'json':
      default:
        return 'text-fg-4 bg-surface-2 border-transparent'
    }
  }
</script>

{#snippet summary(stat: ColumnStats)}
  {@const filled = stat.count - stat.nulls}
  <div class="mt-1.5 flex h-4 items-end gap-1.5 text-left text-[10px] font-normal leading-none text-fg-4" title={describe(stat)}>
    {#if filled === 0}
      <span class="truncate">{stat.count > 0 ? 'all null' : ''}</span>
    {:else if stat.bins}
      {@const peak = Math.max(...stat.bins)}
      <div class="flex h-full min-w-0 flex-1 items-end gap-px" role="img" aria-label="Distribution of {stat.name}: {describe(stat)}">
        {#each stat.bins as count, b (b)}
          <div class="flex-1 rounded-t-[1px] bg-accent/60" style="height:{count > 0 ? Math.max(12, (count / peak) * 100) : 0}%"></div>
        {/each}
      </div>
    {:else if stat.displayType === 'bool'}
      <div class="mb-1 flex h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-edge-strong" role="img" aria-label="Share of true in {stat.name}: {describe(stat)}">
        <div class="h-full bg-accent/60" style="width:{((stat.trueCount ?? 0) / filled) * 100}%"></div>
      </div>
    {:else if stat.top}
      {@const peak = stat.top[0]?.count || 1}
      <div class="flex h-full min-w-0 flex-1 items-end gap-px" role="img" aria-label="Values of {stat.name}: {describe(stat)}">
        {#each stat.top as entry (entry.value)}
          <div
            class="max-w-3 flex-1 rounded-t-[1px] bg-accent/60"
            style="height:{Math.max(12, (entry.count / peak) * 100)}%"
            title="{entry.value}: {formatNumber(entry.count)}"
          ></div>
        {/each}
      </div>
    {:else if stat.distinct !== undefined}
      <span class="min-w-0 flex-1 truncate">{formatNumber(stat.distinct)}{stat.distinctCapped ? '+' : ''} distinct</span>
    {:else if stat.displayType === 'number' && stat.min !== undefined}
      <span class="min-w-0 flex-1 truncate">all {num(stat.min)}</span>
    {:else}
      <span class="min-w-0 flex-1"></span>
    {/if}
    {#if stat.nulls > 0 && filled > 0}
      <span class="shrink-0 tabular-nums">{share(stat.nulls, stat.count)} null</span>
    {/if}
  </div>
{/snippet}

<thead class="sticky top-0 z-10 bg-surface-2">
  <tr class="border-b border-edge">
    <!-- Row number header -->
    <th
      class="sticky left-0 z-20 px-2.5 py-2 text-xs font-semibold text-fg-2 border-r border-edge-subtle text-center select-none bg-surface-2"
      style="width:60px;max-width:60px;min-width:60px"
      ondblclick={() => onfitall?.()}
      title="Double-click to auto-fit all columns"
    >#</th>
    {#each columns as col, i}
      <th
        class="px-2.5 py-2 text-xs font-medium text-fg-3 border-r border-edge-subtle select-none relative group bg-surface-2
          {isRightAligned(col.type) ? 'text-right' : 'text-left'}"
        style="width:{widths[i]}px;max-width:{widths[i]}px;min-width:{widths[i]}px"
      >
        <!-- The filter button is placed against this row, so the summary
             line below does not move it. -->
        <div class="relative">
          {#if onsort}
            <button
              type="button"
              class="w-full flex items-center gap-2 min-w-0 hover:text-fg
                {isRightAligned(col.type) ? 'justify-end' : ''}
                {onfilterclick ? (isRightAligned(col.type) ? 'pl-5' : 'pr-6') : ''}"
              onclick={() => onsort?.(col.name)}
            >
              <span class="truncate font-semibold text-[11px]" title={col.name}>{col.name}</span>
              <span class="inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-semibold border {typeTone(col.type)}">
                {compactTypeLabel(col.type)}
              </span>
              {#if sortColumn === col.name}
                {#if sortDir === 'asc'}
                  <ArrowUp size={12} class="shrink-0" />
                {:else}
                  <ArrowDown size={12} class="shrink-0" />
                {/if}
              {/if}
            </button>
          {:else}
            <div class="w-full flex items-center gap-2 min-w-0 {isRightAligned(col.type) ? 'justify-end' : ''}">
              <span class="truncate font-semibold text-[11px]" title={col.name}>{col.name}</span>
              <span class="inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-semibold border {typeTone(col.type)}">
                {compactTypeLabel(col.type)}
              </span>
            </div>
          {/if}

          <!-- Column filter -->
          {#if onfilterclick}
            {@const active = filteredColumns.includes(col.name)}
            <button
              type="button"
              class="absolute top-1/2 -translate-y-1/2 {isRightAligned(col.type) ? '-left-1.5' : 'right-0.5'} p-0.5 rounded transition-opacity
                {active
                  ? 'text-accent opacity-100'
                  : 'text-fg-4 opacity-0 group-hover:opacity-100 hover:text-fg'}"
              onclick={(e) => handleFilterClick(e, col.name)}
              onmousedown={(e) => e.stopPropagation()}
              title={active ? `Edit filter on ${col.name}` : `Filter ${col.name}`}
              aria-label={`Filter ${col.name} column`}
            >
              <Filter size={11} fill={active ? 'currentColor' : 'none'} />
            </button>
          {/if}
        </div>

        {#if stats?.[i]}
          {@render summary(stats[i])}
        {/if}

        <!-- Resize handle -->
        {#if onresize}
          <button
            type="button"
            class="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize opacity-0 group-hover:opacity-100 hover:bg-accent/35 active:bg-accent/45 transition-opacity"
            onmousedown={(e) => handleMouseDown(e, i)}
            ondblclick={(e) => handleFitColumn(e, i)}
            onclick={(e) => e.stopPropagation()}
            title="Drag to resize, double-click to auto-fit"
            aria-label={`Resize ${col.name} column`}
          ></button>
        {/if}
      </th>
    {/each}
  </tr>
</thead>
