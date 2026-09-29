<script lang="ts">
  import { Copy, CopyCheck, History, Trash2, AlertCircle, Clock, CheckCircle2, XCircle, SquareTerminal } from 'lucide-svelte'
  import PageHeader from '../common/PageHeader.svelte'
  import PageBody from '../common/PageBody.svelte'
  import Badge from '../common/Badge.svelte'
  import { goWorkspace } from '../../stores/router.svelte'
  import Button from '../common/Button.svelte'
  import ConfirmDialog from '../common/ConfirmDialog.svelte'
  import EmptyState from '../common/EmptyState.svelte'
  import { duck, duckActions } from '../../stores/duck.svelte'
  import { success, error as toastError } from '../../stores/toast.svelte'
  import { formatRelativeTime } from '../../utils/format'

  const history = $derived(duck((s) => s.queryHistory))

  let copiedId = $state<string | null>(null)
  let confirmOpen = $state(false)

  const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}...` : text)

  const timeFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

  function formatTimestamp(value: Date): string {
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
    confirmOpen = false
  }

  function openInTab(query: string) {
    duckActions().createTab('sql', query)
    goWorkspace()
  }
</script>

<PageHeader title="History" subtitle="What ran in this session and before">
  {#snippet meta()}
    {#if history.length > 0}<Badge>{history.length}</Badge>{/if}
  {/snippet}
  {#snippet actions()}
    <Button variant="outline" size="sm" onclick={() => (confirmOpen = true)} disabled={history.length === 0}>
      <Trash2 size={13} />
      Clear history
    </Button>
  {/snippet}
</PageHeader>

<PageBody>
  {#if history.length === 0}
    <EmptyState
      icon={History}
      title="No history"
      description="Your query history will appear here once you start executing queries."
    />
  {:else}
    <ul class="flex flex-col gap-2">
      {#each history as item (item.id)}
        <li class="flex items-start gap-2 rounded-md border border-edge bg-surface p-3">
          <span class="mt-1.5 shrink-0">
            {#if item.error}
              <XCircle size={14} class="text-danger" aria-label="Failed" />
            {:else}
              <CheckCircle2 size={14} class="text-success" aria-label="Succeeded" />
            {/if}
          </span>

          <div class="min-w-0 flex-1">
            <pre class="overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-surface-2 p-2 font-mono text-xs text-fg-2">{clip(item.query, 150)}</pre>

            <p class="mt-2 flex items-center gap-1 text-xs text-fg-3" title={formatRelativeTime(item.timestamp)}>
              <Clock size={12} />
              {formatTimestamp(item.timestamp)}
            </p>

            {#if item.error}
              <p class="mt-2 flex items-start gap-1.5 rounded-md bg-danger-soft px-2 py-1.5 text-xs text-danger">
                <AlertCircle size={12} class="mt-0.5 shrink-0" />
                <span class="min-w-0 break-words">{clip(item.error, 100)}</span>
              </p>
            {/if}
          </div>

          <Button icon variant="ghost" size="sm" onclick={() => openInTab(item.query)} aria-label="Open in a new tab" title="Open in a new tab">
            <SquareTerminal size={14} />
          </Button>
          <Button icon variant="ghost" size="sm" onclick={() => copyQuery(item.id, item.query)} aria-label="Copy query" title="Copy query">
            {#if copiedId === item.id}
              <CopyCheck size={14} />
            {:else}
              <Copy size={14} />
            {/if}
          </Button>
        </li>
      {/each}
    </ul>
  {/if}
</PageBody>

<ConfirmDialog
  open={confirmOpen}
  title="Clear query history?"
  description="This action cannot be undone. This will permanently delete your query history."
  confirmLabel="Clear history"
  destructive
  onconfirm={clearHistory}
  oncancel={() => (confirmOpen = false)}
/>
