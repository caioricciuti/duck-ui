<script lang="ts">
  import {
    X, Plus, Home, SquareTerminal, NotebookPen, LayoutDashboard, Cable, Settings,
  } from 'lucide-svelte'
  import { tick } from 'svelte'
  import ContextMenu, { type ContextMenuItem } from '../common/ContextMenu.svelte'
  import { duck, duckActions } from '../../stores/duck.svelte'
  import type { EditorTab, EditorTabType } from '@/store/types'

  const ICONS: Record<EditorTabType, typeof Home> = {
    home: Home,
    sql: SquareTerminal,
    notebook: NotebookPen,
    dashboard: LayoutDashboard,
    connections: Cable,
    settings: Settings,
  }
  const RENAMABLE: EditorTabType[] = ['sql', 'notebook']

  const tabs = $derived(duck((s) => s.tabs))
  const activeTabId = $derived(duck((s) => s.activeTabId))
  const running = $derived(duck((s) => s.executingTabs))

  let dragIndex = $state<number | null>(null)
  let dropIndex = $state<number | null>(null)
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
    for (const t of tabs) if (t.id !== tabId && t.id !== 'home') duckActions().closeTab(t.id)
  }

  function openMenu(e: MouseEvent, tab: EditorTab) {
    e.preventDefault()
    menu = {
      x: e.clientX,
      y: e.clientY,
      items: [
        { id: 'rename', label: 'Rename', disabled: !RENAMABLE.includes(tab.type), onSelect: () => startRename(tab) },
        { id: 'sep', separator: true },
        { id: 'close', label: 'Close', shortcut: '⌥W', onSelect: () => duckActions().closeTab(tab.id) },
        { id: 'close-others', label: 'Close others', disabled: tabs.length < 2, onSelect: () => closeOthers(tab.id) },
        { id: 'close-all', label: 'Close all', onSelect: () => duckActions().closeAllTabs() },
      ],
    }
  }

  function onDragStart(e: DragEvent, index: number) {
    dragIndex = index
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', tabs[index].id)
    }
  }

  function onDragOver(e: DragEvent, index: number) {
    if (dragIndex === null) return
    e.preventDefault()
    dropIndex = index
  }

  function onDrop(e: DragEvent, index: number) {
    e.preventDefault()
    if (dragIndex !== null && dragIndex !== index) duckActions().moveTab(dragIndex, index)
    dragIndex = null
    dropIndex = null
  }

  function onDragEnd() {
    dragIndex = null
    dropIndex = null
  }

  function onAuxClick(e: MouseEvent, tab: EditorTab) {
    if (e.button === 1) {
      e.preventDefault()
      duckActions().closeTab(tab.id)
    }
  }
</script>

<div class="flex h-9 shrink-0 items-stretch border-b border-edge-subtle bg-sidebar" role="tablist" aria-label="Open tabs">
  <div class="flex min-w-0 items-stretch overflow-x-auto [scrollbar-width:none]">
    {#each tabs as tab, index (tab.id)}
      {@const Icon = ICONS[tab.type] ?? SquareTerminal}
      {@const active = tab.id === activeTabId}
      <div
        class="group relative flex min-w-0 max-w-[220px] shrink-0 items-center gap-1.5 border-r border-edge-subtle pl-3 pr-1.5 text-xs transition-colors
          {active ? 'bg-canvas text-fg' : 'text-fg-3 hover:bg-hover hover:text-fg'}
          {dropIndex === index && dragIndex !== index ? 'bg-accent-soft' : ''}"
        style={active ? 'box-shadow: inset 0 2px 0 var(--accent)' : ''}
        role="tab"
        tabindex={active ? 0 : -1}
        aria-selected={active}
        draggable={renamingId !== tab.id}
        onclick={() => duckActions().setActiveTab(tab.id)}
        onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && duckActions().setActiveTab(tab.id)}
        ondblclick={() => startRename(tab)}
        oncontextmenu={(e) => openMenu(e, tab)}
        onauxclick={(e) => onAuxClick(e, tab)}
        ondragstart={(e) => onDragStart(e, index)}
        ondragover={(e) => onDragOver(e, index)}
        ondrop={(e) => onDrop(e, index)}
        ondragend={onDragEnd}
      >
        <Icon size={13} class="shrink-0 {active ? 'text-accent' : ''}" />
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
          class="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-fg-4 opacity-0 hover:bg-active hover:text-fg focus-visible:opacity-100 group-hover:opacity-100 {active ? 'opacity-100' : ''}"
          onclick={(e) => { e.stopPropagation(); duckActions().closeTab(tab.id) }}
          aria-label="Close {tab.title}"
          title="Close"
        >
          <X size={12} />
        </button>
      </div>
    {/each}
  </div>

  <button
    class="inline-flex w-9 shrink-0 items-center justify-center text-fg-3 hover:bg-hover hover:text-fg"
    onclick={() => duckActions().createTab('sql')}
    title="New query (⌥N)"
    aria-label="New query"
  >
    <Plus size={14} />
  </button>
</div>

<ContextMenu open={menu !== null} x={menu?.x ?? 0} y={menu?.y ?? 0} items={menu?.items ?? []} onclose={() => (menu = null)} />
