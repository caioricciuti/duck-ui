<script lang="ts">
  import { onMount } from 'svelte'
  import Sidebar from './Sidebar.svelte'
  import TabBar from './TabBar.svelte'
  import TabContent from './TabContent.svelte'
  import CommandPalette from './CommandPalette.svelte'
  import ContextPanel from './ContextPanel.svelte'
  import PageRouter from './PageRouter.svelte'
  import Lazy from '../common/Lazy.svelte'
  import JoinSessionDialog from '../collaboration/JoinSessionDialog.svelte'
  import DeepLinkLoader from '../share/DeepLinkLoader.svelte'
  import ShareLiveDialog from '../collaboration/ShareLiveDialog.svelte'
  import DashboardShareLoader from '../dashboard/DashboardShareLoader.svelte'
  import { isShareLiveOpen, closeShareLive } from '../../stores/overlays.svelte'
  import { duck, duckActions } from '../../stores/duck.svelte'
  import { openCommandPalette, toggleCommandPalette } from '../../stores/command-palette.svelte'
  import { toggleExplorer } from '../../stores/layout.svelte'
  import { hasUnsavedWork } from '@/lib/boot'
  import { initRouter, isOnWorkspace, goWorkspace, goTo } from '../../stores/router.svelte'

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

  function handleBeforeUnload(e: BeforeUnloadEvent) {
    if (hasUnsavedWork()) e.preventDefault()
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

<div class="flex h-full">
  <Sidebar />
  <ContextPanel />

  <!-- Pages: full-screen product areas driven by the URL -->
  {#if !isOnWorkspace()}
    <main class="flex min-w-0 flex-1 flex-col overflow-hidden bg-canvas">
      <PageRouter />
    </main>
  {/if}

  <!-- Workspace: stays mounted while a page is shown, so running queries and
       results survive navigation. -->
  <main class="flex min-w-0 flex-1 flex-col overflow-hidden bg-canvas" hidden={!isOnWorkspace()}>
    <TabBar />
    <div class="min-h-0 flex-1">
      <TabContent />
    </div>
  </main>
</div>

<CommandPalette />
{#if brainRequested}
  <Lazy load={() => import('../duck-brain/DuckBrainSheet.svelte')} props={{}} />
{/if}
<JoinSessionDialog />
<DeepLinkLoader />
<DashboardShareLoader />
<ShareLiveDialog open={isShareLiveOpen()} onclose={closeShareLive} />
