<script lang="ts">
  import { PanelLeftClose, PanelLeftOpen, RefreshCw, Search, Database, Upload } from 'lucide-svelte'
  import Button from '../common/Button.svelte'
  import EmptyState from '../common/EmptyState.svelte'
  import Spinner from '../common/Spinner.svelte'
  import SchemaTree from './SchemaTree.svelte'
  import FileImporter from '../importer/FileImporter.svelte'
  import FolderBrowser from '../folders/FolderBrowser.svelte'
  import ConnectionSwitcher from '../connections/ConnectionSwitcher.svelte'
  import { getUiConfig } from '@/lib/appConfig'
  import { duck, duckActions } from '../../stores/duck.svelte'
  import {
    getExplorerWidth, setExplorerWidth, isExplorerCollapsed, setExplorerCollapsed,
    EXPLORER_DEFAULT_WIDTH, EXPLORER_MIN_WIDTH,
  } from '../../stores/layout.svelte'

  interface Props {
    /** Inside the mobile drawer: full width, never collapsed, not resizable. */
    drawer?: boolean
  }

  let { drawer = false }: Props = $props()

  const COLLAPSED_WIDTH = 32
  const NARROW_QUERY = '(max-width: 1100px)'

  let dragging = $state(false)
  let narrow = $state(matchMedia(NARROW_QUERY).matches)
  let panelEl: HTMLDivElement | undefined = $state()
  let search = $state('')
  let importerOpen = $state(false)
  let droppedFiles = $state<File[]>([])
  let dropActive = $state(false)

  const ui = getUiConfig()
  const canImport = $derived(duck((s) => s.currentSession?.capabilities.supportsFileImport ?? false) && !ui.hideImport)
  const foldersSupported = $derived(duck((s) => s.isFileSystemSupported))

  function hasFiles(e: DragEvent): boolean {
    return !!e.dataTransfer?.types.includes('Files')
  }

  function onDragOver(e: DragEvent) {
    if (!canImport || !hasFiles(e)) return
    e.preventDefault()
    dropActive = true
  }

  function onDrop(e: DragEvent) {
    if (!canImport || !hasFiles(e)) return
    e.preventDefault()
    dropActive = false
    // A new array each time: the importer queues a given array once.
    droppedFiles = Array.from(e.dataTransfer?.files ?? [])
    importerOpen = true
  }

  const databases = $derived(duck((s) => s.databases))
  const loading = $derived(duck((s) => s.isLoadingDbTablesFetch))
  const fetchError = $derived(duck((s) => s.schemaFetchError))
  const collapsed = $derived(!drawer && (isExplorerCollapsed() || narrow))
  const width = $derived(collapsed ? COLLAPSED_WIDTH : getExplorerWidth())

  $effect(() => {
    const mq = matchMedia(NARROW_QUERY)
    const update = () => (narrow = mq.matches)
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  })

  function refresh() {
    void duckActions().fetchDatabasesAndTablesInfo()
  }

  function onResizeStart(e: MouseEvent) {
    e.preventDefault()
    dragging = true
    document.addEventListener('mousemove', onResizeMove)
    document.addEventListener('mouseup', onResizeEnd)
  }

  function onResizeMove(e: MouseEvent) {
    if (!panelEl) return
    const next = e.clientX - panelEl.getBoundingClientRect().left
    // Dragging well past the minimum reads as "close it".
    if (next < EXPLORER_MIN_WIDTH / 2) {
      setExplorerCollapsed(true)
      onResizeEnd()
      return
    }
    setExplorerWidth(next)
  }

  function onResizeEnd() {
    dragging = false
    document.removeEventListener('mousemove', onResizeMove)
    document.removeEventListener('mouseup', onResizeEnd)
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={panelEl}
  class="relative flex h-full shrink-0 flex-col border-r border-edge-subtle bg-sidebar {dragging ? '' : 'transition-[width] duration-150'} {dropActive ? 'ring-1 ring-inset ring-accent' : ''}"
  style={drawer ? 'width: 100%' : `width: ${width}px`}
  ondragover={onDragOver}
  ondragleave={() => (dropActive = false)}
  ondrop={onDrop}
>
  {#if collapsed}
    <div class="flex h-9 items-center justify-center">
      <Button icon variant="ghost" size="xs" onclick={() => setExplorerCollapsed(false)} title="Show explorer (⌘B)" aria-label="Show explorer" disabled={narrow}>
        <PanelLeftOpen size={14} />
      </Button>
    </div>
  {:else}
    <div class="flex h-9 shrink-0 items-center gap-1 border-b border-edge-subtle pl-1.5 pr-1.5">
      <ConnectionSwitcher class="min-w-0" />
      <div class="ml-auto flex items-center">
        {#if canImport}
          <Button icon variant="ghost" size="xs" onclick={() => (importerOpen = true)} title="Import data" aria-label="Import data">
            <Upload size={13} />
          </Button>
        {/if}
        <Button icon variant="ghost" size="xs" onclick={refresh} title="Refresh schema" aria-label="Refresh schema" disabled={loading}>
          <RefreshCw size={13} class={loading ? 'animate-spin' : ''} />
        </Button>
        {#if !drawer}
          <Button icon variant="ghost" size="xs" onclick={() => setExplorerCollapsed(true)} title="Hide explorer (⌘B)" aria-label="Hide explorer">
            <PanelLeftClose size={14} />
          </Button>
        {/if}
      </div>
    </div>

    <div class="relative shrink-0 px-2 py-2">
      <Search size={13} class="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-fg-4" />
      <input
        class="ds-input-sm pl-7"
        type="search"
        placeholder="Search tables and columns"
        aria-label="Search tables and columns"
        bind:value={search}
      />
    </div>

    <div class="min-h-0 flex-1 overflow-auto">
      {#if fetchError}
        <EmptyState size="compact" icon={Database} title="Could not load schema" description={fetchError} primary={{ label: 'Retry', onclick: refresh }} />
      {:else if loading && databases.length === 0}
        <div class="flex justify-center py-8"><Spinner /></div>
      {:else if databases.length === 0}
        <EmptyState
          size="compact"
          icon={Database}
          title="No data yet"
          description="Drop a file here, import one, or run CREATE TABLE."
          primary={canImport ? { label: 'Import data', onclick: () => (importerOpen = true) } : undefined}
        />
      {:else}
        <SchemaTree {search} />
      {/if}

      {#if canImport && foldersSupported}
        <div class="border-t border-edge-subtle">
          <FolderBrowser />
        </div>
      {/if}
    </div>

    {#if !drawer}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="absolute -right-0.5 top-0 z-10 h-full w-1 cursor-col-resize hover:bg-accent/50 {dragging ? 'bg-accent/50' : ''}"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize explorer"
      onmousedown={onResizeStart}
      ondblclick={() => setExplorerWidth(EXPLORER_DEFAULT_WIDTH)}
    ></div>
    {/if}
  {/if}
</div>

<FileImporter open={importerOpen} initialFiles={droppedFiles} onclose={() => (importerOpen = false)} />
