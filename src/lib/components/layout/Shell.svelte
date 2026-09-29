<script lang="ts">
  import { onMount } from 'svelte'
  import Sidebar from './Sidebar.svelte'
  import TabBar from './TabBar.svelte'
  import TabContent from './TabContent.svelte'
  import CommandPalette from './CommandPalette.svelte'
  import ExplorerPanel from '../explorer/ExplorerPanel.svelte'
  import DuckBrainSheet from '../duck-brain/DuckBrainSheet.svelte'
  import { duckActions } from '../../stores/duck.svelte'
  import { openCommandPalette, toggleCommandPalette } from '../../stores/command-palette.svelte'
  import { toggleExplorer } from '../../stores/layout.svelte'
  import { hasUnsavedWork } from '@/lib/boot'

  function handleGlobalShortcuts(e: KeyboardEvent) {
    const mod = e.metaKey || e.ctrlKey
    const key = e.key.toLowerCase()
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
      duckActions().createTab('sql')
      return
    }

    if (e.altKey && !mod && e.code === 'KeyW') {
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

    if (mod && key === 'b') {
      e.preventDefault()
      toggleExplorer()
    }
  }

  function handleBeforeUnload(e: BeforeUnloadEvent) {
    if (hasUnsavedWork()) e.preventDefault()
  }

  onMount(() => {
    window.addEventListener('keydown', handleGlobalShortcuts, true)
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('keydown', handleGlobalShortcuts, true)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  })
</script>

<div class="flex h-full">
  <Sidebar />
  <ExplorerPanel />

  <main class="flex min-w-0 flex-1 flex-col overflow-hidden bg-canvas">
    <TabBar />
    <div class="min-h-0 flex-1">
      <TabContent />
    </div>
  </main>
</div>

<CommandPalette />
<DuckBrainSheet />
