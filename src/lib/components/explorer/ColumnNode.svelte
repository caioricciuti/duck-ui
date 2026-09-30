<script lang="ts">
  import { ChevronRight, Hash, Type, Calendar, ToggleLeft, Braces } from 'lucide-svelte'
  import Spinner from '../common/Spinner.svelte'
  import ColumnStatsBody from './ColumnStatsBody.svelte'
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
</script>

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
        <ColumnStatsBody {stats} {distribution} numeric={isNumeric} />
      {/if}
    </div>
  {/if}
</li>
