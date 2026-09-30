<script lang="ts">
  import type { Snippet } from 'svelte'
  import { FileX2, CircleCheck, Scissors, Table2, Sigma, ListTree, TriangleAlert } from 'lucide-svelte'
  import Button from '../common/Button.svelte'
  import Spinner from '../common/Spinner.svelte'
  import EmptyState from '../common/EmptyState.svelte'
  import ResultGrid from './ResultGrid.svelte'
  import StatsPanel from './StatsPanel.svelte'
  import SchemaPanel from './SchemaPanel.svelte'
  import { computeColumnStats } from '../../utils/stats'
  import { resultToGrid } from '@/lib/resultTable/gridData'
  import { zeroRowsMessage } from '@/lib/resultMessages'
  import type { QueryProgress, QueryResult } from '@/store/types'
  import type { ColumnFilter, ResultSort } from '../../utils/result-filters'

  export interface ResultView {
    id: string
    label: string
    icon: typeof Table2
  }

  interface Props {
    result?: QueryResult | null
    executing: boolean
    progress?: QueryProgress
    /** Active view id. `table`, `stats` and `schema` are built in. */
    view: string
    onviewchange: (view: string) => void
    oncancel: () => void
    /** Views rendered by the parent, such as charts or a map. */
    extraViews?: ResultView[]
    extra?: Snippet<[string, QueryResult]>
    /** Buttons on the right of the view switcher. */
    actions?: Snippet<[QueryResult]>
    /** Runs the query again with filters and sort, for a result cut at the row limit. */
    requery?: (filters: ColumnFilter[], sort: ResultSort | null) => Promise<QueryResult | null>
    /** Shown under a failed query, such as an AI fix. */
    errorActions?: Snippet<[QueryResult]>
  }

  let {
    result, executing, progress, view, onviewchange, oncancel,
    extraViews = [], extra, actions, errorActions, requery,
  }: Props = $props()

  const grid = $derived(result && !result.error ? resultToGrid(result) : null)
  // Stats scan every row, so they are computed only while that view is open.
  const stats = $derived(grid && view === 'stats' ? computeColumnStats(grid.meta, grid.data) : [])

  const views = $derived<ResultView[]>([
    { id: 'table', label: 'Table', icon: Table2 },
    ...extraViews,
    { id: 'stats', label: 'Stats', icon: Sigma },
    { id: 'schema', label: 'Schema', icon: ListTree },
  ])
  const activeView = $derived(views.some((v) => v.id === view) ? view : 'table')
  const isExtra = $derived(extraViews.some((v) => v.id === activeView))
</script>

{#if executing}
  <!-- While the query runs, report what the engine has actually delivered so
       far. The column headers arrive before the first row, so a long query
       shows its real shape instead of a placeholder. -->
  <div class="flex h-full flex-col">
    <div class="h-0.5 w-full overflow-hidden bg-surface-2">
      <div class="animate-query-sweep h-full w-1/4 bg-accent"></div>
    </div>
    <div class="flex items-center gap-2 px-3 py-2 text-xs text-fg-3">
      <Spinner size="sm" />
      <span aria-live="polite">
        {progress && progress.rows > 0 ? `${progress.rows.toLocaleString()} rows so far` : 'Running query...'}
      </span>
      {#if progress && progress.elapsedMs > 1000}
        <span class="tabular-nums">· {(progress.elapsedMs / 1000).toFixed(1)}s</span>
      {/if}
      <Button size="xs" variant="outline" class="ml-auto" onclick={oncancel}>Stop</Button>
    </div>
    {#if progress?.columns?.length}
      <div class="flex gap-4 overflow-hidden border-y border-edge-subtle px-3 py-2">
        {#each progress.columns.slice(0, 15) as name (name)}
          <span class="max-w-48 min-w-24 truncate text-xs font-medium text-fg-3" title={name}>{name}</span>
        {/each}
      </div>
    {/if}
  </div>
{:else if !result}
  <EmptyState icon={FileX2} title="No results yet" description="Run a query to see its rows here." class="h-full" />
{:else if result.error}
  <div class="h-full overflow-auto p-3">
    <div class="rounded-md border border-danger/40 bg-danger-soft p-3" role="alert">
      <div class="flex items-center gap-2 text-[13px] font-medium text-danger">
        <TriangleAlert size={14} />
        Query error
      </div>
      <pre class="mt-2 whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-fg-2">{result.error}</pre>
    </div>
    {#if errorActions}
      <div class="mt-3 flex items-center gap-2">{@render errorActions(result)}</div>
    {/if}
  </div>
{:else if result.data.length === 0}
  <!-- A successful query with no rows is not an error: say so plainly. -->
  <EmptyState icon={CircleCheck} title={zeroRowsMessage(result.durationMs)} class="h-full" />
{:else if grid}
  <div class="flex h-full flex-col">
    {#if result.truncated}
      <div class="mx-3 mt-2 flex items-start gap-2 rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-xs text-fg-2">
        <Scissors size={13} class="mt-0.5 shrink-0 text-warning" />
        <span>
          Showing the first {result.rowCount.toLocaleString()} rows. The query returns more: add a
          <code class="font-mono">LIMIT</code>, or raise the row limit in Settings. Parquet export
          still writes the complete result.
        </span>
      </div>
    {/if}

    <div class="min-h-0 flex-1">
      {#if isExtra && extra}
        {@render extra(activeView, result)}
      {:else if activeView === 'stats'}
        <div class="h-full overflow-auto"><StatsPanel {stats} /></div>
      {:else if activeView === 'schema'}
        <div class="h-full overflow-auto"><SchemaPanel meta={grid.meta} /></div>
      {:else}
        <ResultGrid
          meta={grid.meta}
          data={grid.data}
          rows={result.data}
          durationMs={result.durationMs}
          requery={result.truncated ? requery : undefined}
        />
      {/if}
    </div>

    <!-- Sits at the bottom rather than as a full-width band above the
         results. The results are the part worth giving space to. -->
    <div class="flex h-8 shrink-0 items-center gap-0.5 border-t border-edge-subtle px-2" role="tablist" aria-label="Result views">
      {#each views as v (v.id)}
        <button
          class="inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-xs transition-colors {activeView === v.id ? 'bg-active text-fg' : 'text-fg-3 hover:bg-hover hover:text-fg'}"
          role="tab"
          aria-selected={activeView === v.id}
          onclick={() => onviewchange(v.id)}
        >
          <v.icon size={13} class={activeView === v.id ? 'text-accent' : ''} />
          {v.label}
        </button>
      {/each}
      {#if actions}
        <div class="ml-auto flex items-center gap-0.5">{@render actions(result)}</div>
      {/if}
    </div>
  </div>
{/if}
