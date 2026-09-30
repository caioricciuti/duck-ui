<script lang="ts">
  import { untrack } from 'svelte'
  import { Table2, RefreshCw, SquareTerminal, Rows3, ListTree, Sigma, Code2, Copy, Scissors, SearchX, TriangleAlert } from 'lucide-svelte'
  import Button from '../common/Button.svelte'
  import Tabs, { type TabItem } from '../common/Tabs.svelte'
  import Spinner from '../common/Spinner.svelte'
  import EmptyState from '../common/EmptyState.svelte'
  import ResultGrid from '../editor/ResultGrid.svelte'
  import CodeEditor from '../editor/CodeEditor.svelte'
  import ColumnStatsBody from '../explorer/ColumnStatsBody.svelte'
  import { duck, duckActions } from '../../stores/duck.svelte'
  import * as toast from '../../stores/toast.svelte'
  import { formatNumber } from '../../utils/format'
  import { getDisplayType } from '../../utils/column-types'
  import { qualifyTable } from '@/lib/sqlSanitize'
  import { formatSql } from '@/lib/editor/formatSql'
  import { buildFilteredQuery } from '@/lib/resultTable/filterSql'
  import { resultToGrid } from '@/lib/resultTable/gridData'
  import { runQuery } from '@/services/engine'
  import type { ColumnFilter, ResultSort } from '../../utils/result-filters'
  import type { ColumnDistribution, ColumnStats, QueryResult } from '@/store/types'

  interface Props {
    tabId: string
    /** Nothing is read from the table until the tab is on screen. */
    visible: boolean
  }

  let { tabId, visible }: Props = $props()

  type View = 'data' | 'schema' | 'stats' | 'ddl'
  const VIEWS: TabItem[] = [
    { id: 'data', label: 'Data', icon: Rows3 },
    { id: 'schema', label: 'Schema', icon: ListTree },
    { id: 'stats', label: 'Stats', icon: Sigma },
    { id: 'ddl', label: 'DDL', icon: Code2 },
  ]
  const none = (): Record<View, boolean> => ({ data: false, schema: false, stats: false, ddl: false })

  const tab = $derived(duck((s) => s.tabs.find((t) => t.id === tabId)))
  const ref = $derived(tab && typeof tab.content !== 'string' ? tab.content : null)
  const database = $derived(ref?.database ?? '')
  const schema = $derived(ref?.schema || 'main')
  const table = $derived(ref?.table ?? '')
  const qualified = $derived(qualifyTable(database, schema, table))
  const baseSql = $derived(`SELECT * FROM ${qualified}`)

  const sessionId = $derived(duck((s) => s.currentSession?.id ?? null))
  const catalogLoading = $derived(duck((s) => s.isLoadingDbTablesFetch))
  const info = $derived(
    duck((s) =>
      s.databases
        .find((db) => db.name === database)
        ?.tables.find((t) => t.name === table && (t.schema || 'main') === schema),
    ),
  )
  // The tab outlives its table: a dropped table, or another connection.
  const missing = $derived(!!sessionId && !catalogLoading && !info)

  let view = $state<View>('data')
  let data = $state.raw<QueryResult | null>(null)
  let description = $state.raw<QueryResult | null>(null)
  let stats = $state.raw<ColumnStats[] | null>(null)
  let distributions = $state<Record<string, ColumnDistribution | null>>({})
  /** null: the connection could not tell. */
  let ddl = $state<string | null>(null)
  let busy = $state(none())
  let loaded = $state(none())
  let errors = $state<Partial<Record<View, string>>>({})
  // Bumped on every reset, so an answer to an earlier request is dropped.
  let generation = 0

  function reset() {
    generation++
    data = null
    description = null
    stats = null
    distributions = {}
    ddl = null
    busy = none()
    loaded = none()
    errors = {}
  }

  async function load(target: View) {
    const session = duckActions().currentSession
    if (!session || busy[target]) return
    const run = generation
    busy[target] = true
    delete errors[target]
    try {
      if (target === 'data') {
        const result = await runQuery(session, baseSql, 'table data', { maxRows: duckActions().maxResultRows })
        if (run !== generation) return
        if (result.error) throw new Error(result.error)
        data = result
      } else if (target === 'schema') {
        const result = await runQuery(session, `DESCRIBE ${qualified}`, 'table schema')
        if (run !== generation) return
        if (result.error) throw new Error(result.error)
        description = result
      } else if (target === 'stats') {
        const result = await duckActions().fetchTableColumnStats(database, table, schema)
        if (run !== generation) return
        stats = result
      } else {
        const raw = await duckActions().fetchTableDdl(database, table, schema)
        // DuckDB stores the statement on one line.
        const text = raw ? await formatSql(raw).catch(() => raw) : null
        if (run !== generation) return
        ddl = text
      }
      loaded[target] = true
    } catch (error) {
      if (run !== generation) return
      errors[target] = error instanceof Error ? error.message : String(error)
    } finally {
      if (run === generation) busy[target] = false
    }
  }

  function show(next: string) {
    view = next as View
    if (!loaded[view]) void load(view)
  }

  function refresh() {
    reset()
    void load(view)
  }

  // First read, and again after a switch to another connection.
  let loadedSession: string | null = null
  $effect(() => {
    if (!visible || !sessionId || !info || loadedSession === sessionId) return
    loadedSession = sessionId
    untrack(refresh)
  })

  /**
   * Sorts and filters in DuckDB when the table has more rows than were
   * loaded, so the answer covers the whole table.
   */
  async function requery(filters: ColumnFilter[], sort: ResultSort | null): Promise<QueryResult | null> {
    const session = duckActions().currentSession
    if (!session || !data) return null
    const wrapped = buildFilteredQuery(baseSql, resultToGrid(data).meta, filters, sort)
    return runQuery(session, wrapped, 'table filter', { maxRows: duckActions().maxResultRows })
  }

  // One aggregate per column, asked for when its card scrolls into view.
  function whenVisible(node: HTMLElement, run: () => void) {
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      observer.disconnect()
      run()
    })
    observer.observe(node)
    return { destroy: () => observer.disconnect() }
  }

  async function loadDistribution(column: string, type: string) {
    if (column in distributions) return
    const run = generation
    const distribution = await duckActions().fetchColumnDistribution(database, table, column, type, schema)
    if (run === generation) distributions[column] = distribution
  }

  function queryInNewTab() {
    const sql = `${baseSql} LIMIT 100`
    const id = duckActions().createTab('sql', sql, table)
    if (id) void duckActions().executeQuery(sql, id)
  }

  async function copyDdl() {
    if (!ddl) return
    try {
      await navigator.clipboard.writeText(ddl)
      toast.success('Copied', 1500)
    } catch {
      toast.error('Could not copy to the clipboard')
    }
  }

  const dataGrid = $derived(data ? resultToGrid(data) : null)
  const schemaGrid = $derived(description ? resultToGrid(description) : null)
</script>

{#snippet failure(message: string)}
  <div class="p-3">
    <div class="rounded-md border border-danger/40 bg-danger-soft p-3" role="alert">
      <div class="flex items-center gap-2 text-[13px] font-medium text-danger">
        <TriangleAlert size={14} />
        Could not read the table
      </div>
      <pre class="mt-2 whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-fg-2">{message}</pre>
    </div>
  </div>
{/snippet}

{#snippet waiting(label: string)}
  <div class="flex h-full items-center justify-center gap-2 text-xs text-fg-3"><Spinner size="sm" /> {label}</div>
{/snippet}

{#if tab && ref}
  <div class="flex h-full flex-col">
    <div class="flex h-10 shrink-0 items-center gap-2 border-b border-edge-subtle px-3">
      <Table2 size={14} class="shrink-0 text-accent" />
      <h2 class="min-w-0 truncate text-[13px]">
        <span class="text-fg-3">{database}.{schema}.</span><span class="font-medium text-fg">{table}</span>
      </h2>
      {#if info}
        <span class="shrink-0 text-xs text-fg-3 tabular-nums">
          {formatNumber(info.rowCount)} {info.rowCount === 1 ? 'row' : 'rows'} · {info.columns.length} {info.columns.length === 1 ? 'column' : 'columns'}
        </span>
      {/if}
      <div class="ml-auto flex items-center gap-1">
        <Button size="sm" variant="ghost" onclick={queryInNewTab} disabled={missing} title="Open a query on this table">
          <SquareTerminal size={13} />
          Query
        </Button>
        <Button size="sm" variant="ghost" icon onclick={refresh} disabled={missing} title="Read the table again" aria-label="Refresh">
          <RefreshCw size={13} class={busy[view] ? 'animate-spin' : ''} />
        </Button>
      </div>
    </div>

    {#if missing}
      <EmptyState
        icon={SearchX}
        title="Table not found"
        description="{database}.{schema}.{table} is not in the current connection. It may have been dropped, or it belongs to another connection."
        class="h-full"
      />
    {:else}
      <Tabs items={VIEWS} value={view} onchange={show} size="sm" class="shrink-0 px-2" />

      <div class="min-h-0 flex-1">
        {#if errors[view]}
          {@render failure(errors[view] ?? '')}
        {:else if view === 'data'}
          {#if data && dataGrid}
            <div class="flex h-full flex-col">
              {#if data.truncated}
                <div class="flex shrink-0 items-center gap-2 border-b border-edge-subtle px-3 py-1.5 text-xs text-fg-3">
                  <Scissors size={12} class="shrink-0 text-warning" />
                  Showing the first {formatNumber(data.rowCount)} rows. Sorting and filtering still cover the whole table.
                </div>
              {/if}
              <div class="min-h-0 flex-1">
                <ResultGrid
                  meta={dataGrid.meta}
                  data={dataGrid.data}
                  rows={data.data}
                  durationMs={data.durationMs}
                  requery={data.truncated ? requery : undefined}
                />
              </div>
            </div>
          {:else}
            {@render waiting('Reading rows...')}
          {/if}
        {:else if view === 'schema'}
          {#if description && schemaGrid}
            <ResultGrid meta={schemaGrid.meta} data={schemaGrid.data} rows={description.data} compact />
          {:else}
            {@render waiting('Reading the schema...')}
          {/if}
        {:else if view === 'stats'}
          {#if stats && stats.length > 0}
            <div class="h-full overflow-auto p-3">
              <div class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
                {#each stats as column (column.column_name)}
                  <section
                    class="space-y-2 rounded-md bg-surface-2 p-3 text-[11px]"
                    aria-label="{column.column_name} statistics"
                    use:whenVisible={() => void loadDistribution(column.column_name, column.column_type)}
                  >
                    <div class="flex items-baseline justify-between gap-2">
                      <h3 class="truncate text-xs font-semibold text-fg" title={column.column_name}>{column.column_name}</h3>
                      <span class="shrink-0 font-mono text-[10px] text-fg-4">{column.column_type}</span>
                    </div>
                    <ColumnStatsBody
                      stats={column}
                      distribution={distributions[column.column_name]}
                      numeric={getDisplayType(column.column_type) === 'number'}
                    />
                  </section>
                {/each}
              </div>
            </div>
          {:else if stats}
            <EmptyState icon={Sigma} title="No statistics available" size="compact" class="h-full" />
          {:else}
            {@render waiting('Reading column statistics...')}
          {/if}
        {:else if busy.ddl || !loaded.ddl}
          {@render waiting('Reading the definition...')}
        {:else if ddl}
          <div class="flex h-full flex-col">
            <div class="flex h-9 shrink-0 items-center justify-end border-b border-edge-subtle px-2">
              <Button size="xs" variant="ghost" onclick={copyDdl}>
                <Copy size={13} />
                Copy
              </Button>
            </div>
            <div class="min-h-0 flex-1">
              <CodeEditor value={ddl} language="sql" readonly ariaLabel="Definition of {table}" />
            </div>
          </div>
        {:else}
          <EmptyState
            icon={Code2}
            title="No definition available"
            description="This connection does not expose the statement that created the table."
            size="compact"
            class="h-full"
          />
        {/if}
      </div>
    {/if}
  </div>
{/if}
