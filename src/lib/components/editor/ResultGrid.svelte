<script lang="ts">
  import { Search, X, Hash, FilterX } from 'lucide-svelte'
  import VirtualTable from '../table/VirtualTable.svelte'
  import Button from '../common/Button.svelte'
  import ExportMenu from './ExportMenu.svelte'
  import { getFormatNumbers, toggleFormatNumbers } from '../../stores/number-format.svelte'
  import { formatNumber } from '../../utils/format'
  import { cellText } from '../../utils/column-types'
  import {
    cycleSort, filterRows, sortRows, type ColumnFilter, type ResultSort,
  } from '../../utils/result-filters'
  import { gridToRows } from '@/lib/resultTable/gridData'
  import { formatQueryTime } from '@/lib/resultMessages'
  import type { ColumnMeta } from '@/lib/types/query'
  import type { DataRow } from '@/lib/resultTable/types'

  interface Props {
    meta: ColumnMeta[]
    data: unknown[][]
    /** Original row objects, handed to the exporters untouched. */
    rows: DataRow[]
    durationMs?: number
    /** Hide the footer tools in embedded uses such as chat or diff views. */
    compact?: boolean
  }

  let { meta, data, rows, durationMs, compact = false }: Props = $props()

  let sort = $state<ResultSort | null>(null)
  let filters = $state<ColumnFilter[]>([])
  let search = $state('')

  // A new result set has different columns; stale sort and filters would
  // point at names that no longer exist.
  $effect(() => {
    void meta
    sort = null
    filters = []
    search = ''
  })

  const searched = $derived.by(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return data
    return data.filter((row) => row.some((value) => value !== null && value !== undefined && cellText(value).toLowerCase().includes(needle)))
  })
  const filtered = $derived(filterRows(searched, meta, filters))
  const shown = $derived(sort ? sortRows(filtered, meta, sort) : filtered)
  const narrowed = $derived(shown.length !== data.length)

  function onFilterChange(column: string, filter: ColumnFilter | null) {
    const rest = filters.filter((f) => f.column !== column)
    filters = filter ? [...rest, filter] : rest
  }

  function clearAll() {
    filters = []
    search = ''
  }
</script>

<div class="flex h-full min-h-0 flex-col">
  <VirtualTable
    {meta}
    data={shown}
    sortColumn={sort?.column ?? ''}
    sortDir={sort?.dir ?? 'asc'}
    onsort={(column) => (sort = cycleSort(sort, column))}
    {filters}
    onfilterchange={onFilterChange}
  />

  <div class="flex h-8 shrink-0 items-center gap-2 border-t border-edge-subtle bg-sidebar px-2 text-xs text-fg-3">
    <span class="tabular-nums">
      {#if narrowed}
        <span class="text-fg">{formatNumber(shown.length)}</span> of {formatNumber(data.length)} rows
      {:else}
        <span class="text-fg">{formatNumber(data.length)}</span> {data.length === 1 ? 'row' : 'rows'}
      {/if}
    </span>
    <span class="text-fg-4">·</span>
    <span>{meta.length} {meta.length === 1 ? 'column' : 'columns'}</span>
    {#if durationMs !== undefined}
      <span class="text-fg-4">·</span>
      <span class="tabular-nums">{formatQueryTime(durationMs)}</span>
    {/if}

    {#if narrowed}
      <Button size="xs" variant="ghost" onclick={clearAll} title="Clear search and filters">
        <FilterX size={13} />
        Clear
      </Button>
    {/if}

    {#if !compact}
      <div class="ml-auto flex items-center gap-1">
        <div class="relative">
          <Search size={12} class="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-fg-4" />
          <input
            class="ds-input-sm h-6 w-44 pl-6 pr-6"
            type="text"
            placeholder="Search rows"
            aria-label="Search rows"
            bind:value={search}
          />
          {#if search}
            <button class="absolute right-1 top-1/2 inline-flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded-sm text-fg-4 hover:text-fg" onclick={() => (search = '')} aria-label="Clear search">
              <X size={11} />
            </button>
          {/if}
        </div>
        <Button
          size="xs"
          variant="ghost"
          aria-pressed={getFormatNumbers()}
          class={getFormatNumbers() ? 'text-accent' : ''}
          onclick={toggleFormatNumbers}
          title="Thousands separators in numbers"
        >
          <Hash size={13} />
          1,000
        </Button>
        <ExportMenu {rows} visibleColumns={meta.map((c) => c.name)} filteredRows={() => gridToRows(meta, shown)} />
      </div>
    {/if}
  </div>
</div>
