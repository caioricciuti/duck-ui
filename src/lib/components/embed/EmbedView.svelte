<script lang="ts">
  import { onMount } from 'svelte'
  import { ChartColumn, DatabaseZap, ExternalLink, Table, TriangleAlert } from 'lucide-svelte'
  import Tabs from '../common/Tabs.svelte'
  import Spinner from '../common/Spinner.svelte'
  import ResultGrid from '../editor/ResultGrid.svelte'
  import ChartView from '../charts/ChartView.svelte'
  import { duck, duckActions } from '../../stores/duck.svelte'
  import { runQuery } from '@/services/engine'
  import { appRootUrl, decodeShare, readShareParam, queryReadsRemoteSource } from '@/lib/share'
  import { resultToGrid } from '@/lib/resultTable/gridData'
  import type { ChartConfig, QueryResult } from '@/store/types'
  import logo from '../../../assets/logo.png'

  type EmbedState =
    | { status: 'loading' }
    | { status: 'no-share' }
    | { status: 'invalid' }
    | { status: 'needs-data'; title: string }
    | { status: 'error'; title: string; message: string }
    | { status: 'ready'; title: string; sql: string; result: QueryResult }

  /*
   * Chrome-free, auto-running viewer for a shared analysis. Rendered at
   * /embed, served by a cross-origin-isolated origin (demo.duckui.com) so
   * DuckDB-WASM works inside an <iframe> regardless of the host page's
   * headers. No editor, no sidebar, no profile: just the result, with a fork
   * link back to Duck-UI.
   */
  const VIEWS = [
    { id: 'table', label: 'Table', icon: Table },
    { id: 'charts', label: 'Chart', icon: ChartColumn },
  ]

  const initialized = $derived(duck((s) => s.isInitialized))
  const engineError = $derived(duck((s) => s.error))
  const currentSession = $derived(duck((s) => s.currentSession))
  const maxResultRows = $derived(duck((s) => s.maxResultRows))

  let embed = $state.raw<EmbedState>({ status: 'loading' })
  let liveChartConfig = $state.raw<ChartConfig | undefined>()
  let view = $state('table')

  const grid = $derived(embed.status === 'ready' ? resultToGrid(embed.result) : null)

  // The full-app deep link that "Open in Duck-UI" points back to.
  const shareParam = readShareParam()
  // The app root, not the origin: under a sub path the origin is another site.
  const forkUrl = shareParam ? `${appRootUrl()}#s=${shareParam}` : appRootUrl()

  // The embed is a public, profile-free widget: it boots the engine itself
  // and skips the profile gate, persistence and autosave.
  onMount(() => {
    const { isInitialized, isLoading, initialize } = duckActions()
    if (!isInitialized && !isLoading) void initialize()
  })

  $effect(() => {
    if (!initialized) return
    const session = currentSession
    const maxRows = maxResultRows
    let cancelled = false

    void (async () => {
      const param = readShareParam()
      if (!param) {
        embed = { status: 'no-share' }
        return
      }

      const payload = await decodeShare(param)
      if (cancelled) return
      if (!payload) {
        embed = { status: 'invalid' }
        return
      }

      const title = payload.title || 'Shared analysis'

      // Phase 1 focuses on single-query embeds.
      const sql = payload.type === 'sql' ? (payload.sql ?? '').trim() : ''
      if (!sql) {
        embed = { status: 'needs-data', title }
        return
      }

      try {
        if (!session) throw new Error('No active connection')
        const result = await runQuery(session, sql, 'embed', { maxRows })
        if (cancelled) return
        if (result.error) throw new Error(result.error)

        liveChartConfig = payload.chartConfig
        view = payload.chartConfig ? 'charts' : 'table'
        embed = { status: 'ready', title, sql, result }
      } catch (err) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : 'Query failed'
        // A query with no remote source that fails on a missing table almost
        // certainly relied on locally-imported data the viewer doesn't have.
        const looksLikeMissingData =
          !queryReadsRemoteSource(sql) &&
          /catalog error|does not exist|not found|no such table|referenced table/i.test(message)
        embed = looksLikeMissingData ? { status: 'needs-data', title } : { status: 'error', title, message }
      }
    })()

    return () => {
      cancelled = true
    }
  })
</script>

<div class="flex h-screen w-full flex-col bg-canvas text-fg">
  {#if embed.status === 'ready' && grid}
    <div class="flex min-h-0 flex-1 flex-col">
      <h1 class="shrink-0 truncate px-4 pt-3 pb-1 text-[13px] font-semibold text-fg">{embed.title}</h1>
      <Tabs items={VIEWS} value={view} onchange={(id) => (view = id)} size="sm" class="shrink-0 px-3" />
      <div class="min-h-0 flex-1" role="tabpanel" aria-label={view === 'charts' ? 'Chart' : 'Table'}>
        {#if view === 'charts'}
          <ChartView
            result={embed.result}
            chartConfig={liveChartConfig}
            onconfigchange={(config) => (liveChartConfig = config)}
          />
        {:else}
          <ResultGrid meta={grid.meta} data={grid.data} rows={embed.result.data} />
        {/if}
      </div>
    </div>
  {:else}
    <div class="flex min-h-0 flex-1 flex-col items-center justify-center p-6 text-center">
      {#if embed.status === 'loading' && engineError}
        <TriangleAlert size={28} class="text-danger" />
        <p class="mt-3 text-[13px] font-medium text-fg">DuckDB failed to start</p>
        <p class="mt-1 max-w-md font-mono text-xs text-fg-3" role="alert">{engineError}</p>
      {:else if embed.status === 'loading'}
        <Spinner />
        <p class="mt-3 text-[13px] text-fg-3">Running analysis...</p>
      {:else if embed.status === 'no-share' || embed.status === 'invalid'}
        <TriangleAlert size={28} class="text-fg-3" />
        <p class="mt-3 text-[13px] text-fg-3">
          {embed.status === 'no-share' ? 'No analysis to display.' : 'This shared link is invalid or corrupted.'}
        </p>
      {:else if embed.status === 'needs-data'}
        <DatabaseZap size={28} class="text-accent" />
        <p class="mt-3 text-[13px] font-medium text-fg">This analysis needs data that isn't public</p>
        <p class="mt-1 max-w-sm text-xs text-fg-3">
          The shared link carries the query, not the data. It reads from a table that was imported locally, so it
          can't reproduce here. Analyses that read from a URL (for example
          <code class="font-mono">read_parquet('https://...')</code>) embed fully.
        </p>
      {:else if embed.status === 'error'}
        <TriangleAlert size={28} class="text-danger" />
        <p class="mt-3 text-[13px] font-medium text-fg">Query error</p>
        <p class="mt-1 max-w-md font-mono text-xs text-fg-3" role="alert">{embed.message}</p>
      {/if}
    </div>
  {/if}

  <footer class="flex h-8 shrink-0 items-center justify-between border-t border-edge-subtle bg-sidebar px-3">
    <a
      href={forkUrl}
      target="_blank"
      rel="noopener noreferrer"
      class="flex items-center gap-1.5 text-xs text-fg-3 transition-colors hover:text-fg"
    >
      <img src={logo} alt="" class="h-4 w-4" />
      Powered by Duck-UI
    </a>
    <a
      href={forkUrl}
      target="_blank"
      rel="noopener noreferrer"
      class="flex items-center gap-1.5 text-xs font-medium text-accent hover:underline"
    >
      Open in Duck-UI
      <ExternalLink size={12} />
    </a>
  </footer>
</div>
