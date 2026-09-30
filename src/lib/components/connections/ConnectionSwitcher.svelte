<script lang="ts">
  import { tick } from 'svelte'
  import { Cable, ChevronDown } from 'lucide-svelte'
  import type { ConnectionProvider } from '@/store/types'
  import { getUiConfig } from '@/lib/appConfig'
  import Badge from '../common/Badge.svelte'
  import Spinner from '../common/Spinner.svelte'
  import { duck, duckActions } from '../../stores/duck.svelte'

  interface Props {
    class?: string
  }

  let { class: cls = '' }: Props = $props()

  const ui = getUiConfig()
  const MENU_WIDTH = 240
  const GAP = 6
  const PAD = 8

  const connections = $derived(duck((s) => s.connectionList.connections))
  const currentConnection = $derived(duck((s) => s.currentConnection))
  const loading = $derived(duck((s) => s.isLoading))
  const hostName = $derived(duck((s) => s.session.hostName))

  const activeConnection = $derived(currentConnection ?? connections[0])
  const ownConnections = $derived(connections.filter((c) => c.environment !== 'SESSION'))
  const sessionConnections = $derived(connections.filter((c) => c.environment === 'SESSION'))

  let open = $state(false)
  let triggerEl = $state<HTMLButtonElement | null>(null)
  let menuEl = $state<HTMLDivElement | null>(null)
  let left = $state(0)
  let top = $state(0)

  function dotColor(scope: string | undefined): string {
    switch (scope) {
      case 'WASM':
        return 'bg-success'
      case 'External':
        return 'bg-info'
      case 'OPFS':
        return 'bg-accent'
      // Hosted by another participant: warning matches the live-session accent.
      case 'Peer':
        return 'bg-warning'
      default:
        return 'bg-fg-4'
    }
  }

  function reposition() {
    if (!triggerEl) return
    const rect = triggerEl.getBoundingClientRect()
    const height = menuEl?.getBoundingClientRect().height ?? 0
    left = Math.round(Math.min(Math.max(rect.left, PAD), window.innerWidth - MENU_WIDTH - PAD))
    const below = rect.bottom + GAP
    // Flip above the trigger when the menu would run off the bottom edge.
    top = Math.round(below + height > window.innerHeight - PAD && rect.top - GAP - height >= PAD ? rect.top - GAP - height : below)
  }

  function items(): HTMLElement[] {
    return menuEl ? Array.from(menuEl.querySelectorAll<HTMLElement>('[role="menuitem"]')) : []
  }

  async function openMenu() {
    open = true
    reposition()
    await tick()
    reposition()
    const all = items()
    const active = all.find((el) => el.dataset.active === 'true')
    ;(active ?? all[0])?.focus()
  }

  function closeMenu(restoreFocus = true) {
    if (!open) return
    open = false
    if (restoreFocus) triggerEl?.focus()
  }

  function onMenuKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      closeMenu()
      return
    }
    if (e.key === 'Tab') {
      closeMenu(false)
      return
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    const all = items()
    if (all.length === 0) return
    const idx = all.indexOf(document.activeElement as HTMLElement)
    let next = 0
    if (e.key === 'ArrowDown') next = (idx + 1) % all.length
    else if (e.key === 'ArrowUp') next = (idx - 1 + all.length) % all.length
    else if (e.key === 'End') next = all.length - 1
    all[next].focus()
  }

  function onWindowPointerDown(e: PointerEvent) {
    if (!open) return
    const target = e.target as Node | null
    if (target && (menuEl?.contains(target) || triggerEl?.contains(target))) return
    closeMenu(false)
  }

  async function switchTo(connection: ConnectionProvider) {
    try {
      const { setCurrentConnection, fetchDatabasesAndTablesInfo } = duckActions()
      await setCurrentConnection(connection.id)
      await fetchDatabasesAndTablesInfo()
      closeMenu()
    } catch (error) {
      console.error('Failed to switch connection:', error)
    }
  }

  function manageConnections() {
    const { tabs, setActiveTab, createTab } = duckActions()
    const existing = tabs.find((t) => t.type === 'connections')
    if (existing) setActiveTab(existing.id)
    else createTab('connections', '', 'Connections')
    closeMenu()
  }

  const itemClass =
    'mx-1 flex w-[calc(100%-8px)] items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[13px] text-fg-2 transition-colors hover:bg-hover hover:text-fg focus:bg-hover focus:text-fg focus:outline-none disabled:pointer-events-none disabled:opacity-50'
</script>

<svelte:window onpointerdown={onWindowPointerDown} onresize={() => open && reposition()} />

<div class="inline-flex min-w-0 {cls}">
  <button
    bind:this={triggerEl}
    type="button"
    class="inline-flex h-7 min-w-0 items-center gap-2 rounded-md border border-edge px-2 text-xs text-fg-2 transition-colors hover:border-edge-strong hover:bg-hover hover:text-fg disabled:cursor-not-allowed disabled:opacity-70"
    aria-haspopup="menu"
    aria-expanded={open}
    aria-label={`Switch connection, current: ${activeConnection?.name ?? 'none'}`}
    disabled={loading}
    onclick={() => (open ? closeMenu() : openMenu())}
  >
    {#if loading}
      <Spinner size="sm" class="h-3 w-3" />
    {:else}
      <span class="h-2 w-2 shrink-0 rounded-full {dotColor(activeConnection?.scope ?? 'WASM')}"></span>
    {/if}
    <span class="max-w-[120px] truncate font-medium">{activeConnection?.name ?? ''}</span>
    {#if activeConnection}
      <Badge class="h-4 px-1 text-[10px]">{activeConnection.scope}</Badge>
    {/if}
    <ChevronDown size={13} class="shrink-0 text-fg-4" />
  </button>
</div>

{#snippet dot(scope: string)}
  <span class="h-2 w-2 shrink-0 rounded-full {dotColor(scope)}"></span>
{/snippet}

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    bind:this={menuEl}
    class="surface-card fixed z-[96] rounded-md py-1"
    style="left:{left}px;top:{top}px;width:{MENU_WIDTH}px"
    role="menu"
    aria-label="Switch connection"
    tabindex="-1"
    onkeydown={onMenuKeydown}
  >
    <p class="px-3 py-1 text-[11px] text-fg-3">Switch Connection</p>

    {#each ownConnections as connection (connection.id)}
      {@const isActive = activeConnection?.id === connection.id}
      <button
        type="button"
        role="menuitem"
        class="{itemClass} {isActive ? 'bg-active text-fg' : ''}"
        data-active={isActive}
        aria-current={isActive ? 'true' : undefined}
        disabled={loading}
        onclick={() => switchTo(connection)}
      >
        {@render dot(connection.scope)}
        <span class="min-w-0 flex-1 truncate font-medium">{connection.name}</span>
        <Badge class="h-4 px-1 text-[10px]">{connection.scope}</Badge>
      </button>
    {/each}

    <!-- Session grants are listed apart, and say whose browser runs them.
         A connection that executes somewhere else should never be
         indistinguishable from a local one. -->
    {#if sessionConnections.length > 0}
      <div class="my-1 h-px bg-edge-subtle"></div>
      <p class="px-3 py-1 text-[11px] text-fg-3">Session</p>
      {#each sessionConnections as connection (connection.id)}
        {@const isActive = activeConnection?.id === connection.id}
        <button
          type="button"
          role="menuitem"
          class="{itemClass} {isActive ? 'bg-active text-fg' : ''}"
          data-active={isActive}
          aria-current={isActive ? 'true' : undefined}
          disabled={loading}
          onclick={() => switchTo(connection)}
        >
          {@render dot(connection.scope)}
          <span class="min-w-0 flex-1">
            <span class="block truncate font-medium">{connection.name}</span>
            <span class="block truncate text-[10px] text-fg-3">
              {hostName ? `Hosted by ${hostName}` : 'Hosted by a participant'} · Read-only
            </span>
          </span>
        </button>
      {/each}
    {/if}

    {#if !ui.hideConnections}
      <div class="my-1 h-px bg-edge-subtle"></div>
      <button type="button" role="menuitem" class={itemClass} onclick={manageConnections}>
        <Cable size={14} class="shrink-0" />
        <span>Manage Connections</span>
      </button>
    {/if}
  </div>
{/if}
