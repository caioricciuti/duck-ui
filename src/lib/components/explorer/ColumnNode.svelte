<script lang="ts">
  import { ChevronRight, Hash, Type, Calendar, ToggleLeft, Braces } from 'lucide-svelte'
  import Spinner from '../common/Spinner.svelte'
  import { duckActions } from '../../stores/duck.svelte'
  import { getDisplayType } from '../../utils/column-types'
  import type { ColumnDistribution, ColumnInfo, ColumnStats } from '@/store/types'

  interface Props {
    column: ColumnInfo
    database: string
    table: string
    schema?: string
    /**
     * Statistics for the whole table, fetched once by the first column that
     * opens and shared with its siblings.
     */
    loadStats: () => Promise<ColumnStats[]>
  }

  let { column, database, table, schema, loadStats }: Props = $props()

  let open = $state(false)
  let stats = $state.raw<ColumnStats | null>(null)
  let distribution = $state.raw<ColumnDistribution | null>(null)
  let loading = $state(false)
  let failed = $state(false)
  // Gates the one-shot fetch. Not state: it never drives rendering.
  let requested = false

  const display = $derived(getDisplayType(column.type))
  const isNumeric = $derived(display === 'number')
  const TypeIcon = $derived(
    display === 'number' ? Hash : display === 'date' ? Calendar : display === 'bool' ? ToggleLeft : display === 'json' ? Braces : Type,
  )
  const tone = $derived(
    display === 'number' ? 'text-accent' : display === 'date' ? 'text-info' : display === 'bool' ? 'text-warning' : 'text-success',
  )

  /** SUMMARIZE returns numbers as text, sometimes quoted. */
  function parse(value: string | number | null | undefined): number {
    if (typeof value === 'number') return value
    if (typeof value === 'string') return parseFloat(value.replace(/"/g, '')) || 0
    return 0
  }

  const nullPercentage = $derived(stats ? parse(stats.null_percentage) : 0)
  const fillPercentage = $derived(100 - nullPercentage)
  const uniqueCount = $derived(stats?.approx_unique ? parse(stats.approx_unique) : 0)
  const totalCount = $derived(stats ? parse(stats.count) : 0)
  const cardinality = $derived(totalCount > 0 ? (uniqueCount / totalCount) * 100 : 0)
  const fillTone = $derived(fillPercentage >= 90 ? 'bg-success' : fillPercentage >= 50 ? 'bg-warning' : 'bg-danger')
  const histogramMax = $derived(distribution?.kind === 'histogram' ? Math.max(...distribution.bins) : 0)

  async function toggle() {
    open = !open
    if (!open || requested) return
    requested = true
    loading = true
    try {
      const [all, dist] = await Promise.all([
        loadStats(),
        duckActions().fetchColumnDistribution(database, table, column.name, column.type, schema),
      ])
      stats = all.find((s) => s.column_name === column.name) ?? null
      distribution = dist
    } catch (error) {
      console.error('Failed to fetch column statistics:', error)
      failed = true
      // Allow another attempt the next time the column is opened.
      requested = false
    } finally {
      loading = false
    }
  }

  const fmt = (value: number, digits = 0) => value.toLocaleString(undefined, { maximumFractionDigits: digits })
</script>

{#snippet row(label: string, value: string)}
  <div class="flex justify-between gap-2">
    <span class="shrink-0 text-fg-3">{label}</span>
    <span class="truncate text-right font-mono text-fg-2" title={value}>{value}</span>
  </div>
{/snippet}

<li role="treeitem" aria-expanded={open} aria-selected="false">
  <button class="flex h-6 w-full items-center gap-1.5 rounded-md px-1.5 text-left text-xs hover:bg-hover" onclick={toggle}>
    <ChevronRight size={11} class="shrink-0 text-fg-4 transition-transform {open ? 'rotate-90' : ''}" />
    <TypeIcon size={12} class="shrink-0 {tone}" />
    <span class="truncate text-fg-2">{column.name}</span>
    <span class="ml-auto shrink-0 font-mono text-[11px] text-fg-4">{column.type}</span>
  </button>

  {#if open}
    <div class="mb-1.5 ml-4 mt-0.5 space-y-2 rounded-md bg-surface-2 p-2 text-[11px]" role="group" aria-label="{column.name} statistics">
      {#if loading}
        <div class="flex items-center gap-2 text-fg-3"><Spinner size="sm" /> Reading column statistics...</div>
      {:else if failed}
        <p class="text-danger">Could not read statistics for this column.</p>
      {:else if !stats}
        <p class="text-fg-3">No statistics available.</p>
      {:else}
        {#if distribution?.kind === 'histogram' && histogramMax > 0}
          <div class="space-y-1">
            <div class="font-medium text-fg-3">Distribution</div>
            <div class="flex h-8 items-end gap-px">
              {#each distribution.bins as count, i (i)}
                <div
                  class="min-w-[2px] flex-1 rounded-t-[1px] bg-accent/70"
                  style="height: {Math.max(count > 0 ? 8 : 0, (count / histogramMax) * 100)}%"
                  title="{count.toLocaleString()} rows"
                ></div>
              {/each}
            </div>
            <div class="flex justify-between font-mono text-[10px] text-fg-4">
              <span class="max-w-[45%] truncate" title={stats.min ?? ''}>{stats.min}</span>
              <span class="max-w-[45%] truncate text-right" title={stats.max ?? ''}>{stats.max}</span>
            </div>
          </div>
        {:else if distribution?.kind === 'topk' && distribution.values.length > 0}
          {@const top = distribution.values[0]?.count || 1}
          <div class="space-y-1">
            <div class="font-medium text-fg-3">Top values</div>
            {#each distribution.values as entry (entry.value)}
              <div class="flex items-center gap-1.5">
                <span class="w-[45%] truncate font-mono text-[10px] text-fg-2" title={entry.value}>{entry.value}</span>
                <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-surface">
                  <div class="h-full bg-accent/70" style="width: {(entry.count / top) * 100}%"></div>
                </div>
                <span class="font-mono text-[10px] text-fg-3 tabular-nums">{entry.count.toLocaleString()}</span>
              </div>
            {/each}
          </div>
        {/if}

        <div class="space-y-1">
          <div class="flex items-center justify-between">
            <span class="text-fg-3">Filled</span>
            <span class="font-mono text-fg-2">{fillPercentage.toFixed(1)}%</span>
          </div>
          <div class="h-1.5 overflow-hidden rounded-full bg-surface">
            <div class="h-full {fillTone}" style="width: {fillPercentage}%"></div>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-x-3 gap-y-1">
          {@render row('Total', fmt(totalCount))}
          {@render row('Unique', fmt(uniqueCount))}
          {@render row('Nulls', fmt((nullPercentage / 100) * totalCount))}
          {@render row('Cardinality', `${cardinality.toFixed(1)}%`)}
        </div>

        {#if isNumeric && stats.avg}
          <div class="space-y-1 border-t border-edge-subtle pt-2">
            {@render row('Min', fmt(parse(stats.min), 4))}
            {@render row('Max', fmt(parse(stats.max), 4))}
            {@render row('Avg', fmt(parse(stats.avg), 2))}
            {#if stats.std}{@render row('Std dev', fmt(parse(stats.std), 2))}{/if}
          </div>
          {#if stats.q25 && stats.q50 && stats.q75}
            <div class="space-y-1 border-t border-edge-subtle pt-2">
              {@render row('Q1 (25%)', fmt(parse(stats.q25), 4))}
              {@render row('Median', fmt(parse(stats.q50), 4))}
              {@render row('Q3 (75%)', fmt(parse(stats.q75), 4))}
            </div>
          {/if}
        {:else if !isNumeric && stats.min && stats.max}
          <div class="space-y-1 border-t border-edge-subtle pt-2">
            {@render row('Min', stats.min)}
            {@render row('Max', stats.max)}
          </div>
        {/if}
      {/if}
    </div>
  {/if}
</li>
