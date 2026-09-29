<script lang="ts">
  import { Copy, EllipsisVertical, LayoutDashboard, Plus, Trash2 } from 'lucide-svelte'
  import Button from '../common/Button.svelte'
  import ConfirmDialog from '../common/ConfirmDialog.svelte'
  import ContextMenu, { type ContextMenuItem } from '../common/ContextMenu.svelte'
  import Input from '../common/Input.svelte'
  import PageHeader from '../common/PageHeader.svelte'
  import PageBody from '../common/PageBody.svelte'
  import Badge from '../common/Badge.svelte'
  import EmptyState from '../common/EmptyState.svelte'
  import { goWorkspace } from '../../stores/router.svelte'
  import { formatRelativeTime } from '../../utils/format'
  import { duck, duckActions } from '../../stores/duck.svelte'
  import type { Dashboard } from '@/services/dashboard/types'

  /**
   * The dashboards index (the Grafana/Evidence "home" for reports).
   *
   * This list is what makes a dashboard durable in practice: closing its tab, or
   * reloading, must never mean losing it. Everything here is already persisted,
   * the list is how you get back to it.
   */
  const dashboards = $derived(duck((s) => s.dashboards))

  let newName = $state('')
  let creating = $state(false)
  let menu = $state<{ dashboard: Dashboard; x: number; y: number } | null>(null)
  let deleting = $state<Dashboard | null>(null)

  const menuItems = $derived<ContextMenuItem[]>(
    menu
      ? [
          { id: 'duplicate', label: 'Duplicate', icon: Copy, onSelect: duplicate(menu.dashboard) },
          { id: 'delete', label: 'Delete', icon: Trash2, danger: true, onSelect: askDelete(menu.dashboard) },
        ]
      : [],
  )

  $effect(() => {
    void duckActions().loadDashboards()
  })

  async function create() {
    if (creating) return
    creating = true
    try {
      const dashboard = await duckActions().createDashboard(newName.trim() || 'Untitled dashboard')
      if (dashboard) {
        newName = ''
        duckActions().openDashboardTab(dashboard.id, dashboard.name)
        goWorkspace()
      }
    } finally {
      creating = false
    }
  }

  function openDashboard(dashboard: Dashboard) {
    duckActions().openDashboardTab(dashboard.id, dashboard.name)
    goWorkspace()
  }

  function openMenu(e: MouseEvent, dashboard: Dashboard) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    menu = { dashboard, x: rect.left, y: rect.bottom + 4 }
  }

  function duplicate(dashboard: Dashboard) {
    return () => void duckActions().duplicateDashboard(dashboard.id)
  }

  function askDelete(dashboard: Dashboard) {
    return () => (deleting = dashboard)
  }

  async function confirmDelete() {
    if (!deleting) return
    const { id } = deleting
    deleting = null
    await duckActions().deleteDashboard(id)
  }
</script>

<PageHeader title="Dashboards" subtitle="Reports written as markdown, with live SQL">
  {#snippet meta()}
    {#if dashboards.length > 0}<Badge>{dashboards.length}</Badge>{/if}
  {/snippet}
  {#snippet actions()}
    <label class="sr-only" for="new-dashboard-name">New dashboard name</label>
    <div class="w-56">
      <Input
        id="new-dashboard-name"
        size="sm"
        bind:value={newName}
        placeholder="New dashboard name"
        onkeydown={(e) => e.key === 'Enter' && create()}
      />
    </div>
    <Button size="sm" onclick={create} disabled={creating}>
      <Plus size={13} />
      New
    </Button>
  {/snippet}
</PageHeader>

<PageBody>
  {#if dashboards.length === 0}
    <EmptyState
      icon={LayoutDashboard}
      title="No dashboards yet"
      description="Create one above, or run a query and use Add to dashboard."
    />
  {:else}
    <ul class="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
      {#each dashboards as dashboard (dashboard.id)}
        <li class="group flex items-center gap-2 rounded-md border border-edge bg-surface px-3 py-2.5 transition-colors focus-within:border-edge-strong hover:border-edge-strong hover:bg-hover">
          <LayoutDashboard size={15} class="shrink-0 text-fg-3" />
          <button type="button" class="min-w-0 flex-1 text-left" onclick={() => openDashboard(dashboard)}>
            <span class="block truncate text-[13px] font-medium text-fg">{dashboard.name}</span>
            <span class="block text-[11px] text-fg-3" title={new Date(dashboard.updatedAt).toLocaleString()}>
              Updated {formatRelativeTime(dashboard.updatedAt)}
            </span>
          </button>
          <Button
            icon
            size="xs"
            variant="ghost"
            aria-label="{dashboard.name} options"
            aria-expanded={menu?.dashboard.id === dashboard.id}
            onclick={(e) => openMenu(e, dashboard)}
          >
            <EllipsisVertical size={14} />
          </Button>
        </li>
      {/each}
    </ul>
  {/if}
</PageBody>

<ContextMenu open={menu !== null} x={menu?.x ?? 0} y={menu?.y ?? 0} items={menuItems} onclose={() => (menu = null)} />

<ConfirmDialog
  open={deleting !== null}
  title="Delete {deleting?.name ?? 'dashboard'}?"
  description="The dashboard and its open tab are removed. This cannot be undone."
  confirmLabel="Delete"
  destructive
  onconfirm={confirmDelete}
  oncancel={() => (deleting = null)}
/>
