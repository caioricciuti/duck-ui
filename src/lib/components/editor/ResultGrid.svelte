<script lang="ts">
  import { Search, X, Hash, FilterX, Database, ChartNoAxesColumn } from 'lucide-svelte'
  import VirtualTable from '../table/VirtualTable.svelte'
  import Button from '../common/Button.svelte'
  import ExportMenu from './ExportMenu.svelte'
  import { getFormatNumbers, toggleFormatNumbers } from '../../stores/number-format.svelte'
  import { getHeaderStats, toggleHeaderStats } from '../../stores/header-stats.svelte'
  import { computeColumnStats, sampleRows } from '../../utils/stats'
  import { formatNumber } from '../../utils/format'
  import { cellText } from '../../utils/column-types'
  import {
    cycleSort, filterRows, sortRows, type ColumnFilter, type ResultSort,
  } from '../../utils/result-filters'
  import { gridToRows } from '@/lib/resultTable/gridData'
  import { createTableExporters } from '@/lib/resultTable/tableExport'
  import { formatQueryTime } from '@/lib/resultMessages'
  import { resultToGrid } from '@/lib/resultTable/gridData'
  import * as toast from '../../stores/toast.svelte'
  import type { QueryResult } from '@/store/types'
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
    /**
     * Given for a result that holds only part of the answer. Sorting and
     * filtering then run in the engine over the whole answer, since doing it
     * over the rows at hand would give a wrong result that looks right.
     * Resolves to null when the query cannot be run that way.
     */
    requery?: (filters: ColumnFilter[], sort: ResultSort | null) => Promise<QueryResult | null>
  }

  let { meta, data, rows, durationMs, compact = false, requery }: Props = $props()

  let sort = $state<ResultSort | null>(null)
  let filters = $state<ColumnFilter[]>([])
  let search = $state('')
  let selectedCells = $state(0)

  // A new result set has different columns; stale sort and filters would
  // point at names that no longer exist.
  $effect(() => {
    void meta
    sort = null
    filters = []
    search = ''
  })

  // Rows sorted and filtered by the engine, when `requery` is in use.
  let engine = $state.raw<{ data: unknown[][]; rows: DataRow[]; truncated: boolean } | null>(null)
  let engineBusy = $state(false)
  /** Set after a failed attempt, so the grid falls back for this result. */
  let engineUnavailable = $state(false)

  $effect(() => {
    void meta
    engine = null
    engineUnavailable = false
  })

  $effect(() => {
    const run = requery
    const activeFilters = filters
    const activeSort = sort
    if (!run || engineUnavailable || (activeFilters.length === 0 && !activeSort)) {
      engine = null
      engineBusy = false
      return
    }
    let stale = false
    engineBusy = true
    run(activeFilters, activeSort)
      .then((result) => {
        if (stale) return
        if (!result || result.error) {
          engineUnavailable = true
          engine = null
          toast.warning(
            result?.error
              ? `Could not filter in DuckDB, showing the loaded rows instead. ${result.error.split('\n')[0]}`
              : 'This query cannot be filtered in DuckDB. Showing the loaded rows instead.',
          )
          return
        }
        engine = { data: resultToGrid(result).data, rows: result.data, truncated: !!result.truncated }
      })
      .catch((error) => {
        if (stale) return
        console.error('Engine-side filtering failed:', error)
        engineUnavailable = true
        engine = null
      })
      .finally(() => {
        if (!stale) engineBusy = false
      })
    return () => {
      stale = true
    }
  })

  const inEngine = $derived(engine !== null)
  const base = $derived(engine?.data ?? data)

  const searched = $derived.by(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return base
    return base.filter((row) => row.some((value) => value !== null && value !== undefined && cellText(value).toLowerCase().includes(needle)))
  })
  // Already done by the engine when its rows are shown.
  const filtered = $derived(inEngine ? searched : filterRows(searched, meta, filters))
  const shown = $derived(!inEngine && sort ? sortRows(filtered, meta, sort) : filtered)
  const narrowed = $derived(inEngine ? filters.length > 0 || search.trim() !== '' : shown.length !== data.length)

  // Enough rows for a faithful picture, few enough to redo on every keystroke
  // in the search box.
  const HEADER_STATS_ROWS = 100_000

  // A summary of the rows in the grid, so it follows search and filters.
  // Sorting does not change it, which is why it reads `filtered`.
  const headerStats = $derived.by(() => {
    if (compact || !getHeaderStats()) return null
    const sample = sampleRows(filtered, HEADER_STATS_ROWS)
    return {
      columns: computeColumnStats(meta, sample),
      scope:
        sample.length < filtered.length
          ? `from a sample of ${formatNumber(sample.length)} of ${formatNumber(filtered.length)} rows`
          : `in ${formatNumber(filtered.length)} ${filtered.length === 1 ? 'row' : 'rows'}`,
    }
  })

  function onFilterChange(column: string, filter: ColumnFilter | null) {
    const rest = filters.filter((f) => f.column !== column)
    filters = filter ? [...rest, filter] : rest
  }

  function exportCsv() {
    createTableExporters(engine?.rows ?? rows, {
      getVisibleColumnIds: () => meta.map((c) => c.name),
      getFilteredRows: () => gridToRows(meta, shown),
    }).exportToCSV()
  }

  function clearAll() {
    filters = []
    search = ''
  }
</script>

<div class="flex h-full min-h-0 flex-col">
  {#if engineBusy}
    <div class="h-0.5 w-full shrink-0 overflow-hidden bg-surface-2">
      <div class="animate-query-sweep h-full w-1/4 bg-accent"></div>
    </div>
  {/if}
  <VirtualTable
    {meta}
    data={shown}
    sortColumn={sort?.column ?? ''}
    sortDir={sort?.dir ?? 'asc'}
    onsort={(column) => (sort = cycleSort(sort, column))}
    {filters}
    onfilterchange={onFilterChange}
    onselectionchange={(count) => (selectedCells = count)}
    onexport={compact ? undefined : exportCsv}
    stats={headerStats?.columns}
    statsScope={headerStats?.scope}
  />

  <div class="flex h-8 shrink-0 items-center gap-2 border-t border-edge-subtle bg-sidebar px-2 text-xs text-fg-3">
    <span class="tabular-nums">
      {#if inEngine}
        <span class="text-fg">{formatNumber(shown.length)}</span>{engine?.truncated ? '+' : ''} {shown.length === 1 ? 'row' : 'rows'}
      {:else if narrowed}
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

    {#if inEngine}
      <span class="text-fg-4">·</span>
      <span class="inline-flex items-center gap-1 text-accent" title="This result was cut at the row limit, so sorting and filtering ran in DuckDB over the whole answer.">
        <Database size={12} />
        over the full result
      </span>
    {/if}

    {#if selectedCells > 0}
      <span class="text-fg-4">·</span>
      <span class="tabular-nums text-accent">
        {formatNumber(selectedCells)} {selectedCells === 1 ? 'cell' : 'cells'} selected
      </span>
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
        <Button
          size="xs"
          variant="ghost"
          aria-pressed={getHeaderStats()}
          class={getHeaderStats() ? 'text-accent' : ''}
          onclick={toggleHeaderStats}
          title="A summary under each column name: distribution, distinct values, nulls"
        >
          <ChartNoAxesColumn size={13} />
          Column stats
        </Button>
        <ExportMenu rows={engine?.rows ?? rows} visibleColumns={meta.map((c) => c.name)} filteredRows={() => gridToRows(meta, shown)} />
      </div>
    {/if}
  </div>
</div>
