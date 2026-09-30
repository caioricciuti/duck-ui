<script lang="ts">
  import type { ColumnDistribution, ColumnStats } from '@/store/types'

  interface Props {
    stats: ColumnStats
    /** Histogram or top values. Absent while it loads or when it failed. */
    distribution?: ColumnDistribution | null
    numeric: boolean
  }

  let { stats, distribution = null, numeric }: Props = $props()

  /** SUMMARIZE returns numbers as text, sometimes quoted. */
  function parse(value: string | number | null | undefined): number {
    if (typeof value === 'number') return value
    if (typeof value === 'string') return parseFloat(value.replace(/"/g, '')) || 0
    return 0
  }

  const nullPercentage = $derived(parse(stats.null_percentage))
  const fillPercentage = $derived(100 - nullPercentage)
  const uniqueCount = $derived(stats.approx_unique ? parse(stats.approx_unique) : 0)
  const totalCount = $derived(parse(stats.count))
  const cardinality = $derived(totalCount > 0 ? (uniqueCount / totalCount) * 100 : 0)
  const fillTone = $derived(fillPercentage >= 90 ? 'bg-success' : fillPercentage >= 50 ? 'bg-warning' : 'bg-danger')
  const histogramMax = $derived(distribution?.kind === 'histogram' ? Math.max(...distribution.bins) : 0)

  const fmt = (value: number, digits = 0) => value.toLocaleString(undefined, { maximumFractionDigits: digits })
</script>

{#snippet row(label: string, value: string)}
  <div class="flex justify-between gap-2">
    <span class="shrink-0 text-fg-3">{label}</span>
    <span class="truncate text-right font-mono text-fg-2" title={value}>{value}</span>
  </div>
{/snippet}

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

{#if numeric && stats.avg}
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
{:else if !numeric && stats.min && stats.max}
  <div class="space-y-1 border-t border-edge-subtle pt-2">
    {@render row('Min', stats.min)}
    {@render row('Max', stats.max)}
  </div>
{/if}
