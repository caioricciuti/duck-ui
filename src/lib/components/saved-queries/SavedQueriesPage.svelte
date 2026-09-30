<script lang="ts">
  import { tick } from 'svelte'
  import { Bookmark, EllipsisVertical, ExternalLink, Pencil, Trash2 } from 'lucide-svelte'
  import PageHeader from '../common/PageHeader.svelte'
  import PageBody from '../common/PageBody.svelte'
  import Badge from '../common/Badge.svelte'
  import { goWorkspace } from '../../stores/router.svelte'
  import ContextMenu, { type ContextMenuItem } from '../common/ContextMenu.svelte'
  import EmptyState from '../common/EmptyState.svelte'
  import Spinner from '../common/Spinner.svelte'
  import { duck, duckActions } from '../../stores/duck.svelte'
  import { success, error as toastError } from '../../stores/toast.svelte'
  import { formatDate, formatRelativeTime } from '../../utils/format'
  import {
    getSavedQueries,
    updateSavedQuery,
    deleteSavedQuery,
    type SavedQuery,
  } from '@/services/persistence/repositories/savedQueryRepository'

  const profileId = $derived(duck((s) => s.currentProfileId))
  const version = $derived(duck((s) => s.savedQueriesVersion))

  let queries = $state.raw<SavedQuery[]>([])
  let loading = $state(true)
  let editingId = $state<string | null>(null)
  let editName = $state('')
  let renameInput: HTMLInputElement | undefined = $state()
  let menu = $state<{ items: ContextMenuItem[]; x: number; y: number } | null>(null)

  $effect(() => {
    // `version` is read so a save or rename elsewhere reloads the list.
    void version
    if (!profileId) {
      loading = false
      return
    }
    let stale = false
    getSavedQueries(profileId)
      .then((result) => {
        if (!stale) queries = result
      })
      .catch(console.error)
      .finally(() => {
        if (!stale) loading = false
      })
    return () => {
      stale = true
    }
  })

  function openQuery(query: SavedQuery) {
    duckActions().createTab('sql', query.sql_text, query.name)
    goWorkspace()
  }

  async function startRename(query: SavedQuery) {
    editingId = query.id
    editName = query.name
    await tick()
    renameInput?.focus()
    renameInput?.select()
  }

  async function finishRename(id: string) {
    // Enter removes the input, which then fires blur. Only the first call counts.
    if (editingId !== id) return
    editingId = null
    const name = editName.trim()
    if (!name) return
    try {
      await updateSavedQuery(id, { name })
      queries = queries.map((q) => (q.id === id ? { ...q, name } : q))
      duckActions().bumpSavedQueriesVersion()
    } catch {
      toastError('Failed to rename query')
    }
  }

  async function remove(id: string) {
    try {
      await deleteSavedQuery(id)
      queries = queries.filter((q) => q.id !== id)
      duckActions().bumpSavedQueriesVersion()
      success('Query deleted')
    } catch {
      toastError('Failed to delete query')
    }
  }

  function onRenameKeydown(e: KeyboardEvent, id: string) {
    if (e.key === 'Enter') void finishRename(id)
    if (e.key === 'Escape') {
      editingId = null
    }
  }

  function openMenu(e: MouseEvent & { currentTarget: HTMLButtonElement }, query: SavedQuery) {
    const rect = e.currentTarget.getBoundingClientRect()
    menu = {
      x: rect.right - 220,
      y: rect.bottom + 4,
      items: [
        { id: 'open', label: 'Open in new tab', icon: ExternalLink, onSelect: () => openQuery(query) },
        { id: 'rename', label: 'Rename', icon: Pencil, onSelect: () => void startRename(query) },
        { id: 'separator', separator: true },
        { id: 'delete', label: 'Delete', icon: Trash2, danger: true, onSelect: () => void remove(query.id) },
      ],
    }
  }

  const preview = (sql: string) => (sql.length > 100 ? `${sql.slice(0, 100)}...` : sql)
</script>

<PageHeader title="Saved queries" subtitle="Queries you kept for later">
  {#snippet meta()}
    {#if queries.length > 0}<Badge>{queries.length}</Badge>{/if}
  {/snippet}
</PageHeader>

<PageBody>
  {#if loading}
    <div class="flex justify-center py-8"><Spinner /></div>
  {:else if queries.length === 0}
    <EmptyState
      icon={Bookmark}
      title="No saved queries yet"
      description="Save a query from the editor toolbar and it shows up here."
    />
  {:else}
    <ul class="grid grid-cols-1 gap-2 lg:grid-cols-2">
      {#each queries as query (query.id)}
        <li class="flex items-start gap-1 rounded-md border border-edge bg-surface transition-colors hover:border-edge-strong hover:bg-hover">
          {#if editingId === query.id}
            <div class="min-w-0 flex-1 p-3">
              <input
                bind:this={renameInput}
                bind:value={editName}
                class="ds-input-sm font-medium"
                aria-label="Rename {query.name}"
                onblur={() => finishRename(query.id)}
                onkeydown={(e) => onRenameKeydown(e, query.id)}
              />
              <pre class="mt-1 truncate font-mono text-xs text-fg-3">{preview(query.sql_text)}</pre>
            </div>
          {:else}
            <button type="button" class="min-w-0 flex-1 rounded-md p-3 text-left" onclick={() => openQuery(query)}>
              <span class="block truncate text-[13px] font-medium text-fg">{query.name}</span>
              <pre class="mt-1 truncate font-mono text-xs text-fg-3">{preview(query.sql_text)}</pre>
              <span class="mt-1 block text-xs text-fg-4" title={formatDate(query.updated_at)}>
                {formatRelativeTime(query.updated_at)}
              </span>
            </button>
          {/if}
          <button
            type="button"
            class="mr-1.5 mt-2 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-fg-3 transition-colors hover:bg-active hover:text-fg"
            aria-label="{query.name} options"
            aria-haspopup="menu"
            onclick={(e) => openMenu(e, query)}
          >
            <EllipsisVertical size={14} />
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</PageBody>

<ContextMenu open={menu !== null} x={menu?.x ?? 0} y={menu?.y ?? 0} items={menu?.items ?? []} onclose={() => (menu = null)} />
