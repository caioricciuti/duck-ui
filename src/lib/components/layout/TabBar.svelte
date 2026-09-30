<script lang="ts" module>
  /**
   * What a dragged tab carries. Its own type, not text/plain: the editor
   * would take a text drop and insert the tab id.
   */
  export const TAB_DRAG_TYPE = 'application/x-duck-ui-tab'
</script>

<script lang="ts">
  import {
    X, Plus, Home, SquareTerminal, NotebookPen, LayoutDashboard, Table2, Columns2, PanelLeftClose,
  } from 'lucide-svelte'
  import { tick } from 'svelte'
  import ContextMenu, { type ContextMenuItem } from '../common/ContextMenu.svelte'
  import { duck, duckActions } from '../../stores/duck.svelte'
  import { isMobile } from '../../stores/layout.svelte'
  import { isHomeTab, isSplit, paneOf, visibleTabs, type Pane } from '@/store/tabPanes'
  import type { EditorTab, EditorTabType } from '@/store/types'

  interface Props {
    /** The pane this bar belongs to while the workspace is split. Without it, every tab is listed. */
    pane?: Pane
  }

  let { pane }: Props = $props()

  const ICONS: Partial<Record<EditorTabType, typeof Home>> = {
    home: Home,
    sql: SquareTerminal,
    notebook: NotebookPen,
    dashboard: LayoutDashboard,
    table: Table2,
  }
  const RENAMABLE: EditorTabType[] = ['sql', 'notebook']

  const allTabs = $derived(duck((s) => s.tabs))
  const tabs = $derived(pane ? allTabs.filter((tab) => paneOf(tab) === pane) : allTabs)
  const activeTabId = $derived(duck((s) => s.activeTabId))
  // The tab this bar's pane shows. Only in the focused pane is it the active one.
  const shownTabId = $derived(duck((s) => (pane ? visibleTabs(s)[pane] : s.activeTabId)))
  const split = $derived(isSplit(allTabs))
  const running = $derived(duck((s) => s.executingTabs))

  let dragId = $state<string | null>(null)
  let dropId = $state<string | null>(null)
  let renamingId = $state<string | null>(null)
  let renameValue = $state('')
  let renameEl: HTMLInputElement | undefined = $state()
  let menu = $state<{ x: number; y: number; items: ContextMenuItem[] } | null>(null)

  function isRunning(tabId: string): boolean {
    return tabId in running && !!running[tabId]
  }

  async function startRename(tab: EditorTab) {
    if (!RENAMABLE.includes(tab.type)) return
    renamingId = tab.id
    renameValue = tab.title
    await tick()
    renameEl?.select()
  }

  function commitRename() {
    if (renamingId && renameValue.trim()) duckActions().updateTabTitle(renamingId, renameValue.trim())
    renamingId = null
  }

  function onRenameKey(e: KeyboardEvent) {
    if (e.key === 'Enter') commitRename()
    if (e.key === 'Escape') renamingId = null
  }

  function closeOthers(tabId: string) {
    for (const t of allTabs) if (t.id !== tabId) duckActions().closeTab(t.id)
  }

  // A new tab opens in the focused pane, so the pane of this bar takes the focus first.
  function createTab(type: EditorTabType) {
    if (pane && shownTabId) duckActions().setActiveTab(shownTabId)
    duckActions().createTab(type)
  }

  function openMenu(e: MouseEvent, tab: EditorTab) {
    e.preventDefault()
    const home = isHomeTab(tab)
    const items: ContextMenuItem[] = [
      { id: 'rename', label: 'Rename', disabled: !RENAMABLE.includes(tab.type), onSelect: () => startRename(tab) },
    ]
    if (!isMobile()) {
      items.push(
        { id: 'sep-split', separator: true },
        {
          id: 'split',
          label: split ? 'Move to other pane' : 'Split right',
          icon: Columns2,
          shortcut: '⌥S',
          disabled: home,
          onSelect: () => duckActions().splitTab(tab.id),
        },
      )
      if (split) items.push({ id: 'join', label: 'Join panes', icon: PanelLeftClose, onSelect: () => duckActions().joinPanes() })
    }
    items.push(
      { id: 'sep', separator: true },
      { id: 'close', label: 'Close', shortcut: '⌥W', disabled: home, onSelect: () => duckActions().closeTab(tab.id) },
      { id: 'close-others', label: 'Close others', disabled: allTabs.length < 2, onSelect: () => closeOthers(tab.id) },
      { id: 'close-all', label: 'Close all', onSelect: () => duckActions().closeAllTabs() },
    )
    menu = { x: e.clientX, y: e.clientY, items }
  }

  function isTabDrag(e: DragEvent): boolean {
    return !!e.dataTransfer?.types.includes(TAB_DRAG_TYPE)
  }

  function onDragStart(e: DragEvent, tab: EditorTab) {
    if (isHomeTab(tab) || !e.dataTransfer) {
      e.preventDefault()
      return
    }
    dragId = tab.id
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData(TAB_DRAG_TYPE, tab.id)
  }

  function onDragOver(e: DragEvent, tab: EditorTab) {
    if (!isTabDrag(e)) return
    e.preventDefault()
    dropId = tab.id
  }

  /** The dragged tab, which may come from the other pane's bar. */
  function takeDrop(e: DragEvent): EditorTab | undefined {
    const id = e.dataTransfer?.getData(TAB_DRAG_TYPE)
    dragId = null
    dropId = null
    if (!id) return undefined
    e.preventDefault()
    e.stopPropagation()
    return duckActions().tabs.find((tab) => tab.id === id)
  }

  function onDrop(e: DragEvent, target: EditorTab) {
    const moved = takeDrop(e)
    if (!moved) return
    const { tabs: all, moveTab, moveTabToPane } = duckActions()
    if (pane && paneOf(moved) !== pane) {
      moveTabToPane(moved.id, pane)
      return
    }
    // Positions in the whole list: the order inside a pane is the order there.
    const from = all.indexOf(moved)
    const to = all.indexOf(target)
    if (from !== to) moveTab(from, to)
  }

  // The empty part of a bar takes a tab from the other pane.
  function onBarDragOver(e: DragEvent) {
    if (pane && isTabDrag(e)) e.preventDefault()
  }

  function onBarDrop(e: DragEvent) {
    if (!pane) return
    const moved = takeDrop(e)
    if (moved && paneOf(moved) !== pane) duckActions().moveTabToPane(moved.id, pane)
  }

  function onDragEnd() {
    dragId = null
    dropId = null
  }

  function onAuxClick(e: MouseEvent, tab: EditorTab) {
    if (e.button === 1) {
      e.preventDefault()
      duckActions().closeTab(tab.id)
    }
  }
</script>

<div
  class="flex h-9 min-w-0 items-stretch border-b border-edge-subtle bg-sidebar"
  style="grid-row: 1; grid-column: {pane === 'right' ? 3 : 1}"
  role="tablist"
  aria-label={pane === 'right' ? 'Right pane tabs' : 'Open tabs'}
  tabindex="-1"
  ondragover={onBarDragOver}
  ondrop={onBarDrop}
>
  <div class="flex min-w-0 items-stretch overflow-x-auto [scrollbar-width:none]">
    {#each tabs as tab (tab.id)}
      {@const Icon = ICONS[tab.type] ?? SquareTerminal}
      {@const shown = tab.id === shownTabId}
      {@const focused = tab.id === activeTabId}
      {@const home = isHomeTab(tab)}
      <div
        class="group relative flex min-w-0 shrink-0 items-center gap-1.5 border-r border-edge-subtle text-xs transition-colors
          {home ? 'w-10 justify-center' : 'max-w-[220px] pl-3 pr-1.5'}
          {shown ? 'bg-canvas text-fg' : 'text-fg-3 hover:bg-hover hover:text-fg'}
          {dragId === tab.id ? 'opacity-40' : ''}
          {dropId === tab.id && dragId !== tab.id ? 'bg-accent-soft' : ''}"
        style={shown ? `box-shadow: inset 0 2px 0 var(${focused ? '--accent' : '--edge-strong'})` : ''}
        role="tab"
        tabindex={shown ? 0 : -1}
        aria-selected={shown}
        aria-label={tab.title}
        title={home ? tab.title : undefined}
        draggable={!home && renamingId !== tab.id}
        onclick={() => duckActions().setActiveTab(tab.id)}
        onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && duckActions().setActiveTab(tab.id)}
        ondblclick={() => startRename(tab)}
        oncontextmenu={(e) => openMenu(e, tab)}
        onauxclick={(e) => onAuxClick(e, tab)}
        ondragstart={(e) => onDragStart(e, tab)}
        ondragover={(e) => onDragOver(e, tab)}
        ondrop={(e) => onDrop(e, tab)}
        ondragend={onDragEnd}
      >
        <Icon size={13} class="shrink-0 {focused ? 'text-accent' : ''}" />
        <!-- Home is pinned: the icon is all it needs, and it cannot be closed. -->
        {#if !home}
          {#if renamingId === tab.id}
            <input
              bind:this={renameEl}
              bind:value={renameValue}
              class="h-6 w-32 rounded-sm border border-accent bg-surface px-1 text-xs text-fg focus:outline-none"
              aria-label="Tab name"
              onblur={commitRename}
              onkeydown={onRenameKey}
              onclick={(e) => e.stopPropagation()}
            />
          {:else}
            <span class="truncate">{tab.title}</span>
          {/if}
          {#if isRunning(tab.id)}
            <span class="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent" role="img" aria-label="Running"></span>
          {/if}
          <button
            class="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-fg-4 opacity-0 hover:bg-active hover:text-fg focus-visible:opacity-100 group-hover:opacity-100 {shown ? 'opacity-100' : ''}"
            onclick={(e) => { e.stopPropagation(); duckActions().closeTab(tab.id) }}
            aria-label="Close {tab.title}"
            title="Close"
          >
            <X size={12} />
          </button>
        {/if}
      </div>
    {/each}
  </div>

  <button
    class="inline-flex w-9 shrink-0 items-center justify-center text-fg-3 hover:bg-hover hover:text-fg"
    onclick={() => createTab('sql')}
    title="New query (⌥N)"
    aria-label="New query"
  >
    <Plus size={14} />
  </button>
  <button
    class="inline-flex w-9 shrink-0 items-center justify-center text-fg-3 hover:bg-hover hover:text-fg"
    onclick={() => createTab('notebook')}
    title="New notebook"
    aria-label="New notebook"
  >
    <NotebookPen size={14} />
  </button>
</div>

<ContextMenu open={menu !== null} x={menu?.x ?? 0} y={menu?.y ?? 0} items={menu?.items ?? []} onclose={() => (menu = null)} />
