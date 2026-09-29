<script lang="ts">
  import { ExternalLink, ShieldAlert } from 'lucide-svelte'
  import Modal from '../common/Modal.svelte'
  import Button from '../common/Button.svelte'
  import { duck, duckActions } from '../../stores/duck.svelte'
  import * as toast from '../../stores/toast.svelte'
  import { buildSourceSQL, defaultDeepLinkQuery, isLikelyCorsError } from '@/lib/deepLink'
  import { clearSearchParams, loadQueryFromURL, readDeepLinkRequest } from '@/lib/urlLoaders'

  const HOSTING_GUIDE_URL = 'https://github.com/caioricciuti/duck-ui/blob/main/docs/hosting-data.md'

  /*
   * Handles everything a link can ask the app to open.
   *
   * "Open in Duck-UI" links (`?load=<url>&sql=...`) arrive from strangers'
   * READMEs, so nothing runs on arrival: a confirmation lists every remote
   * host and the SQL, and only after the user accepts do we attach the
   * sources and open or run the query. Kiosk deployments with imports hidden
   * ignore these links entirely.
   *
   * Shared analyses (`#s=`) and legacy `?query=` links carry only a query, and
   * open in a new tab as soon as the engine is ready.
   */
  const initialized = $derived(duck((s) => s.isInitialized))

  let loading = $state(false)
  let dismissed = $state(false)

  // The URL is read once the engine is up, and again only after a dismiss,
  // which is also what empties it.
  const request = $derived(initialized && !dismissed ? readDeepLinkRequest() : null)
  const sqlLines = $derived(request?.sql ? request.sql.split('\n').length : 0)
  const hosts = $derived([...new Set((request?.sources ?? []).map((source) => hostOf(source.url)))])

  $effect(() => {
    if (initialized) loadQueryFromURL()
  })

  function hostOf(url: string): string {
    try {
      return new URL(url.replace(/^ducklake:/, '')).host
    } catch {
      return url
    }
  }

  function dismiss() {
    dismissed = true
    clearSearchParams()
  }

  function close() {
    if (!loading) dismiss()
  }

  async function load(run: boolean) {
    if (!request) return
    const { connection, currentSession, fetchDatabasesAndTablesInfo, createTab, executeQuery } = duckActions()
    // Deep links attach into the in-browser engine; on a connection that
    // executes elsewhere the loaded sources would be invisible. Keep the
    // dialog open so the link isn't consumed.
    if (!connection || !currentSession?.capabilities.supportsFileImport) {
      toast.error('Shared data loads into the in-browser DuckDB engine', {
        description: 'Switch to a WASM or OPFS connection, then open this link again.',
      })
      return
    }
    loading = true

    try {
      for (const source of request.sources) {
        try {
          await connection.query(buildSourceSQL(source))
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          if (isLikelyCorsError(message)) {
            toast.error(`Couldn't reach ${hostOf(source.url)}`, {
              description:
                'The host must allow cross-origin (CORS) requests for browsers to read it. See the hosting guide for a free setup that works.',
              action: {
                label: 'Hosting guide',
                onClick: () => window.open(HOSTING_GUIDE_URL, '_blank', 'noopener'),
              },
              duration: 15000,
            })
          } else {
            toast.error(`Failed to load ${source.name}: ${message}`)
          }
          throw error
        }
      }

      await fetchDatabasesAndTablesInfo()

      const sql = request.sql ?? defaultDeepLinkQuery(request.sources)
      const tabId = createTab('sql', sql, request.sources[0]?.name ?? 'Shared data')
      toast.success(
        request.sources.length === 1 ? `Loaded ${request.sources[0].name}` : `Loaded ${request.sources.length} sources`,
      )

      if (run && sql.trim() && tabId) {
        setTimeout(() => {
          void executeQuery(sql, tabId)
        }, 100)
      }
    } catch {
      // Source-level errors already surfaced above.
    } finally {
      loading = false
      dismiss()
    }
  }
</script>

{#if request}
  <Modal open onclose={close} title="Open shared data?" description="This link wants to load remote data into your Duck-UI session.">
    <div class="flex flex-col gap-3 text-[13px] text-fg-2">
      <ul class="flex flex-col gap-1">
        {#each request.sources as source (source.url)}
          <li class="flex items-start gap-2 font-mono text-xs">
            <ExternalLink size={14} class="mt-0.5 shrink-0 text-fg-4" />
            <span class="break-all text-fg">
              {source.url}
              <span class="text-fg-3">→ attaches as {source.name}</span>
            </span>
          </li>
        {/each}
      </ul>

      {#if request.sql}
        <p>and run this SQL ({sqlLines} {sqlLines === 1 ? 'line' : 'lines'}, scroll to read all of it):</p>
        <pre class="max-h-60 overflow-auto whitespace-pre-wrap rounded-md bg-surface-2 p-2 font-mono text-xs text-fg">{request.sql}</pre>
      {/if}

      <p class="flex items-start gap-2 text-xs text-fg-3">
        <ShieldAlert size={14} class="mt-0.5 shrink-0" />
        <span>
          Everything runs in your browser only, no data leaves this tab. Sources from {hosts.join(', ')} are attached
          read-only, but the SQL runs with full access to your local session, so only open links from people you
          trust.
        </span>
      </p>
    </div>

    {#snippet footer()}
      <Button variant="ghost" onclick={dismiss} disabled={loading}>Cancel</Button>
      <Button variant="outline" onclick={() => load(false)} disabled={loading}>Load only</Button>
      <Button onclick={() => load(request.autoRun)} loading={loading}>
        {loading ? 'Loading...' : request.autoRun ? 'Load & run' : 'Load'}
      </Button>
    {/snippet}
  </Modal>
{/if}
