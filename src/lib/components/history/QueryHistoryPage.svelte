<script lang="ts">
  import { Copy, CopyCheck, History, Trash2, CircleAlert, Clock, CircleCheck, CircleX, SquareTerminal, Search, Timer, Rows3 } from 'lucide-svelte'
  import PageHeader from '../common/PageHeader.svelte'
  import PageBody from '../common/PageBody.svelte'
  import Badge from '../common/Badge.svelte'
  import Button from '../common/Button.svelte'
  import Spinner from '../common/Spinner.svelte'
  import Tabs from '../common/Tabs.svelte'
  import ConfirmDialog from '../common/ConfirmDialog.svelte'
  import EmptyState from '../common/EmptyState.svelte'
  import { goWorkspace } from '../../stores/router.svelte'
  import { duck, duckActions } from '../../stores/duck.svelte'
  import { success, error as toastError } from '../../stores/toast.svelte'
  import { formatNumber, formatRelativeTime } from '../../utils/format'
  import { formatQueryTime } from '@/lib/resultMessages'
  import {
    searchHistory, type HistoryEntry, type HistoryStatus,
  } from '@/services/persistence/repositories/queryHistoryRepository'

  const PAGE_SIZE = 50
  const SEARCH_DEBOUNCE_MS = 200
  const STATUS_TABS = [
    { id: 'all', label: 'All' },
    { id: 'succeeded', label: 'Succeeded' },
    { id: 'failed', label: 'Failed' },
  ]

  const profileId = $derived(duck((s) => s.currentProfileId))
  // Grows with every run in this session, which is the cue to reload.
  const sessionRuns = $derived(duck((s) => s.queryHistory))

  let entries = $state.raw<HistoryEntry[]>([])
  let total = $state(0)
  let loading = $state(true)
  let loadingMore = $state(false)
  let searchInput = $state('')
  let searchText = $state('')
  let status = $state<HistoryStatus>('all')
  let copiedId = $state<string | null>(null)
  let confirmOpen = $state(false)

  const filtered = $derived(searchText.trim() !== '' || status !== 'all')

  $effect(() => {
    const value = searchInput
    const timer = setTimeout(() => (searchText = value), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  })

  $effect(() => {
    void sessionRuns
    const id = profileId
    const search = { text: searchText, status, limit: PAGE_SIZE, offset: 0 }
    if (!id) {
      entries = []
      total = 0
      loading = false
      return
    }
    let stale = false
    searchHistory(id, search)
      .then((page) => {
        if (stale) return
        entries = page.entries
        total = page.total
      })
      .catch((error) => console.error('Failed to load history:', error))
      .finally(() => {
        if (!stale) loading = false
      })
    return () => {
      stale = true
    }
  })

  async function loadMore() {
    if (!profileId || loadingMore) return
    loadingMore = true
    try {
      const page = await searchHistory(profileId, { text: searchText, status, limit: PAGE_SIZE, offset: entries.length })
      entries = [...entries, ...page.entries]
      total = page.total
    } catch (error) {
      console.error('Failed to load more history:', error)
    } finally {
      loadingMore = false
    }
  }

  const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}...` : text)

  const timeFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

  function formatTimestamp(value: string): string {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? '' : timeFormat.format(date)
  }

  async function copyQuery(id: string, query: string) {
    try {
      await navigator.clipboard.writeText(query)
    } catch {
      toastError('Could not copy to clipboard')
      return
    }
    copiedId = id
    success('Query copied to clipboard', 1500)
    setTimeout(() => {
      if (copiedId === id) copiedId = null
    }, 1000)
  }

  function clearHistory() {
    duckActions().clearHistory()
    entries = []
    total = 0
    confirmOpen = false
  }

  function openInTab(query: string) {
    duckActions().createTab('sql', query)
    goWorkspace()
  }
</script>

<PageHeader title="History" subtitle="Every query this profile has run">
  {#snippet meta()}
    {#if total > 0}<Badge>{formatNumber(total)}</Badge>{/if}
  {/snippet}
  {#snippet actions()}
    <div class="relative w-64">
      <Search size={13} class="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-fg-4" />
      <input
        class="ds-input-sm pl-7"
        type="search"
        placeholder="Search queries and errors"
        aria-label="Search history"
        bind:value={searchInput}
      />
    </div>
    <Tabs items={STATUS_TABS} value={status} onchange={(id) => (status = id as HistoryStatus)} variant="segmented" />
    <Button variant="outline" size="sm" onclick={() => (confirmOpen = true)} disabled={total === 0 && !filtered}>
      <Trash2 size={13} />
      Clear
    </Button>
  {/snippet}
</PageHeader>

<PageBody>
  {#if loading}
    <div class="flex justify-center py-16"><Spinner /></div>
  {:else if entries.length === 0}
    <EmptyState
      icon={History}
      title={filtered ? 'Nothing matches' : 'No history yet'}
      description={filtered
        ? 'No query in the history matches this search.'
        : 'Queries you run show up here, and stay across reloads.'}
    />
  {:else}
    <ul class="flex flex-col gap-2">
      {#each entries as item (item.id)}
        <li class="flex items-start gap-2 rounded-md border border-edge bg-surface p-3">
          <span class="mt-1.5 shrink-0">
            {#if item.error}
              <CircleX size={14} class="text-danger" aria-label="Failed" />
            {:else}
              <CircleCheck size={14} class="text-success" aria-label="Succeeded" />
            {/if}
          </span>

          <div class="min-w-0 flex-1">
            <pre class="overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-surface-2 p-2 font-mono text-xs text-fg-2">{clip(item.sql_text, 400)}</pre>

            <p class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-3">
              <span class="inline-flex items-center gap-1" title={formatRelativeTime(item.executed_at)}>
                <Clock size={12} />
                {formatTimestamp(item.executed_at)}
              </span>
              {#if item.duration_ms !== null}
                <span class="inline-flex items-center gap-1 tabular-nums">
                  <Timer size={12} />
                  {formatQueryTime(item.duration_ms)}
                </span>
              {/if}
              {#if item.row_count !== null && !item.error}
                <span class="inline-flex items-center gap-1 tabular-nums">
                  <Rows3 size={12} />
                  {formatNumber(item.row_count)} {item.row_count === 1 ? 'row' : 'rows'}
                </span>
              {/if}
            </p>

            {#if item.error}
              <p class="mt-2 flex items-start gap-1.5 rounded-md bg-danger-soft px-2 py-1.5 text-xs text-danger">
                <CircleAlert size={12} class="mt-0.5 shrink-0" />
                <span class="min-w-0 break-words">{clip(item.error.split('\n')[0], 200)}</span>
              </p>
            {/if}
          </div>

          <Button icon variant="ghost" size="sm" onclick={() => openInTab(item.sql_text)} aria-label="Open in a new tab" title="Open in a new tab">
            <SquareTerminal size={14} />
          </Button>
          <Button icon variant="ghost" size="sm" onclick={() => copyQuery(item.id, item.sql_text)} aria-label="Copy query" title="Copy query">
            {#if copiedId === item.id}
              <CopyCheck size={14} />
            {:else}
              <Copy size={14} />
            {/if}
          </Button>
        </li>
      {/each}
    </ul>

    {#if entries.length < total}
      <div class="mt-4 flex items-center justify-center gap-3">
        <span class="text-xs text-fg-3 tabular-nums">{formatNumber(entries.length)} of {formatNumber(total)}</span>
        <Button variant="outline" size="sm" onclick={loadMore} loading={loadingMore}>Load more</Button>
      </div>
    {/if}
  {/if}
</PageBody>

<ConfirmDialog
  open={confirmOpen}
  title="Clear query history?"
  description="This permanently deletes the whole history of this profile, not only what is shown."
  confirmLabel="Clear history"
  destructive
  onconfirm={clearHistory}
  oncancel={() => (confirmOpen = false)}
/>
