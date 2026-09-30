<script lang="ts">
  import { onMount } from 'svelte'
  import Sidebar from './Sidebar.svelte'
  import TabBar, { TAB_DRAG_TYPE } from './TabBar.svelte'
  import TabContent from './TabContent.svelte'
  import CommandPalette from './CommandPalette.svelte'
  import ContextPanel from './ContextPanel.svelte'
  import PageRouter from './PageRouter.svelte'
  import Lazy from '../common/Lazy.svelte'
  import JoinSessionDialog from '../collaboration/JoinSessionDialog.svelte'
  import DeepLinkLoader from '../share/DeepLinkLoader.svelte'
  import DashboardShareLoader from '../dashboard/DashboardShareLoader.svelte'
  import { duck, duckActions } from '../../stores/duck.svelte'
  import { openCommandPalette, toggleCommandPalette } from '../../stores/command-palette.svelte'
  import { toggleExplorer, isMobile } from '../../stores/layout.svelte'
  import { flushAutoSave, hasUnsavedChanges } from '@/store'
  import { initRouter, isOnWorkspace, goWorkspace, goTo } from '../../stores/router.svelte'
  import { isSplit, type Pane } from '@/store/tabPanes'

  const PANE_KEY = 'duck-ui-pane-split-percent'
  const MIN_PANE = 20
  const MAX_PANE = 80
  // Dropping a tab this close to the left or right edge of the workspace splits it.
  const EDGE_WIDTH = 72
  const TAB_BAR_HEIGHT = 36

  // Two panes need the width. A phone shows every tab in one.
  const split = $derived(duck((s) => isSplit(s.tabs)) && !isMobile())

  const savedPane = parseFloat(localStorage.getItem(PANE_KEY) ?? '')
  let panePercent = $state(Number.isNaN(savedPane) ? 50 : Math.max(MIN_PANE, Math.min(MAX_PANE, savedPane)))
  let resizing = $state(false)
  let workspaceEl: HTMLElement | undefined = $state()
  let dropEdge = $state<Pane | null>(null)

  function onResizeStart(e: MouseEvent) {
    e.preventDefault()
    resizing = true
    document.addEventListener('mousemove', onResizeMove)
    document.addEventListener('mouseup', onResizeEnd)
  }

  function onResizeMove(e: MouseEvent) {
    if (!workspaceEl) return
    const rect = workspaceEl.getBoundingClientRect()
    panePercent = Math.max(MIN_PANE, Math.min(MAX_PANE, ((e.clientX - rect.left) / rect.width) * 100))
  }

  function onResizeEnd() {
    resizing = false
    localStorage.setItem(PANE_KEY, panePercent.toFixed(1))
    document.removeEventListener('mousemove', onResizeMove)
    document.removeEventListener('mouseup', onResizeEnd)
  }

  function resetPanes() {
    panePercent = 50
    localStorage.setItem(PANE_KEY, '50')
  }

  /** The edge a dragged tab is over, below the tab bars. */
  function edgeUnder(e: DragEvent): Pane | null {
    if (!workspaceEl || isMobile() || !e.dataTransfer?.types.includes(TAB_DRAG_TYPE)) return null
    const rect = workspaceEl.getBoundingClientRect()
    if (e.clientY - rect.top < TAB_BAR_HEIGHT) return null
    const x = e.clientX - rect.left
    if (x <= EDGE_WIDTH) return 'left'
    if (x >= rect.width - EDGE_WIDTH) return 'right'
    return null
  }

  function onTabDragOver(e: DragEvent) {
    dropEdge = edgeUnder(e)
    if (!dropEdge) return
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  }

  function onTabDrop(e: DragEvent) {
    const edge = edgeUnder(e)
    const tabId = e.dataTransfer?.getData(TAB_DRAG_TYPE)
    dropEdge = null
    if (!edge || !tabId) return
    e.preventDefault()
    duckActions().splitTabToSide(tabId, edge)
  }

  function handleGlobalShortcuts(e: KeyboardEvent) {
    const mod = e.metaKey || e.ctrlKey
    // Autofill and IME events arrive as keydown without a key.
    const key = e.key?.toLowerCase() ?? ''
    const target = e.target as HTMLElement | null
    const isTypingTarget = !!target && (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable
    )

    if (mod && key === 'k') {
      e.preventDefault()
      toggleCommandPalette()
      return
    }

    // Alt shortcuts work while typing too: they never produce editor input
    // we care about, and a query editor is where they are wanted most.
    if (e.altKey && !mod && e.code === 'KeyN') {
      e.preventDefault()
      goWorkspace()
      duckActions().createTab('sql')
      return
    }

    if (e.altKey && !mod && e.code === 'KeyW' && isOnWorkspace()) {
      e.preventDefault()
      const { activeTabId, closeTab } = duckActions()
      if (activeTabId) closeTab(activeTabId)
      return
    }

    if (e.altKey && !mod && e.code === 'KeyS' && isOnWorkspace() && !isMobile()) {
      e.preventDefault()
      const { activeTabId, splitTab } = duckActions()
      if (activeTabId) splitTab(activeTabId)
      return
    }

    if (isTypingTarget) return

    if (e.key === '/') {
      e.preventDefault()
      openCommandPalette()
      return
    }

    if (mod && key === 'b' && isOnWorkspace()) {
      e.preventDefault()
      toggleExplorer()
    }
  }

  // The dashboards list used to be a panel behind a store flag. Logic still
  // raises that flag, which now opens the page.
  const dashboardsRequested = $derived(duck((s) => s.isDashboardsPanelOpen))
  $effect(() => {
    if (!dashboardsRequested) return
    duckActions().setDashboardsPanelOpen(false)
    goTo('dashboards')
  })

  // Opening a dashboard from anywhere lands on its tab, not behind a page.
  const activeTabId = $derived(duck((s) => s.activeTabId))
  let lastActiveTabId = duckActions().activeTabId
  $effect(() => {
    if (activeTabId === lastActiveTabId) return
    lastActiveTabId = activeTabId
    goWorkspace()
  })

  // Duck Brain is fetched the first time its panel opens, then stays mounted.
  const brainOpen = $derived(duck((s) => s.duckBrain.isPanelOpen))
  let brainRequested = $state(false)
  $effect(() => {
    if (brainOpen) brainRequested = true
  })

  // The workspace saves itself, so closing the tab is normally silent. The
  // browser only asks when an edit from the last moments has not been stored
  // yet, and that write is started here so the answer rarely matters.
  function handleBeforeUnload(e: BeforeUnloadEvent) {
    if (!hasUnsavedChanges()) return
    void flushAutoSave()
    e.preventDefault()
  }

  onMount(() => {
    const stopRouter = initRouter()
    window.addEventListener('keydown', handleGlobalShortcuts, true)
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      stopRouter()
      window.removeEventListener('keydown', handleGlobalShortcuts, true)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  })
</script>

<div class="flex h-full {isMobile() ? 'flex-col-reverse' : ''}">
  <Sidebar />
  <ContextPanel />

  <!-- Pages: full-screen product areas driven by the URL -->
  {#if !isOnWorkspace()}
    <main class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-canvas">
      <PageRouter />
    </main>
  {/if}

  <!-- Workspace: stays mounted while a page is shown, so running queries and
       results survive navigation. -->
  <!-- A grid: the tab bars in the first row, the tab panels in the second.
       With two panes there are three columns, the middle one the handle. -->
  <main
    bind:this={workspaceEl}
    class="relative grid min-h-0 min-w-0 flex-1 overflow-hidden bg-canvas"
    style="grid-template-rows: auto minmax(0, 1fr); grid-template-columns: {split
      ? `minmax(0, ${panePercent}fr) auto minmax(0, ${100 - panePercent}fr)`
      : 'minmax(0, 1fr)'}"
    hidden={!isOnWorkspace()}
    ondragover={onTabDragOver}
    ondragleave={() => (dropEdge = null)}
    ondrop={onTabDrop}
  >
    <TabBar pane={split ? 'left' : undefined} />
    {#if split}
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <div
        class="group/pane flex w-1 cursor-col-resize items-center justify-center transition-colors hover:bg-active {resizing ? 'bg-accent/60' : 'bg-edge-subtle'}"
        style="grid-row: 1 / span 2; grid-column: 2"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panes"
        onmousedown={onResizeStart}
        ondblclick={resetPanes}
      >
        <div class="h-8 w-0.5 rounded-full transition-colors {resizing ? 'bg-accent' : 'bg-edge-strong group-hover/pane:bg-accent/60'}"></div>
      </div>
      <TabBar pane="right" />
    {/if}
    <TabContent {split} />

    {#if dropEdge}
      <div
        class="pointer-events-none absolute bottom-0 top-9 z-30 border-accent/50 bg-accent-soft {dropEdge === 'left' ? 'left-0 border-r' : 'right-0 border-l'}"
        style="width: {EDGE_WIDTH}px"
      ></div>
    {/if}
  </main>
</div>

<svelte:window ondragend={() => (dropEdge = null)} />

{#if resizing}
  <div class="fixed inset-0 z-50 cursor-col-resize"></div>
{/if}

<CommandPalette />
{#if brainRequested}
  <Lazy load={() => import('../duck-brain/DuckBrainSheet.svelte')} props={{}} />
{/if}
<JoinSessionDialog />
<DeepLinkLoader />
<DashboardShareLoader />
