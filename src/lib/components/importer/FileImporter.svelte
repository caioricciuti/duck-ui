<script lang="ts">
  import { untrack } from 'svelte'
  import { Upload, Link, Code } from 'lucide-svelte'
  import Sheet from '../common/Sheet.svelte'
  import Tabs from '../common/Tabs.svelte'
  import PreviewPanel from './PreviewPanel.svelte'
  import QueryTab from './QueryTab.svelte'
  import UploadTab from './UploadTab.svelte'
  import UrlTab from './UrlTab.svelte'
  import { duck } from '../../stores/duck.svelte'
  import { getUiConfig } from '@/lib/appConfig'
  import { createLocalFileImport } from '@/lib/fileImporter/localFileImport.svelte'
  import { createQueryImport } from '@/lib/fileImporter/queryImport.svelte'
  import { createUrlImport } from '@/lib/fileImporter/urlImport.svelte'
  import type { ImporterContext } from '@/lib/fileImporter/context'
  import type { ImportMode, UploadError } from '@/lib/fileImporter/types'

  interface Props {
    open: boolean
    onclose: () => void
    /** Files dropped elsewhere (the explorer column) to queue when the sheet opens. */
    initialFiles?: File[]
  }

  let { open, onclose, initialFiles }: Props = $props()

  let activeTab = $state('upload')
  let errors = $state.raw<UploadError[]>([])
  let importMode = $state<ImportMode>('table')

  const ctx: ImporterContext = {
    getImportMode: () => importMode,
    getErrors: () => errors,
    setErrors: (next) => (errors = next),
    close: () => onclose(),
  }

  const local = createLocalFileImport(ctx)
  const url = createUrlImport(ctx)
  const query = createQueryImport(ctx)

  // Kiosk mode and connections that cannot register files hide every import
  // affordance. The openers check this too; this is the backstop.
  const supportsFileImport = $derived(duck((s) => s.currentSession?.capabilities.supportsFileImport ?? false))
  const canImport = $derived(supportsFileImport && !getUiConfig().hideImport)

  const tabs = [
    { id: 'upload', label: 'Upload files', icon: Upload },
    { id: 'url', label: 'From URL', icon: Link },
    { id: 'query', label: 'From query', icon: Code },
  ]

  let consumed: File[] | undefined

  $effect(() => {
    if (!open || !canImport || !initialFiles?.length || initialFiles === consumed) return
    const incoming = initialFiles
    consumed = incoming
    untrack(() => {
      activeTab = 'upload'
      local.addFiles(incoming)
    })
  })

  const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files') ?? false

  function onDragOver(e: DragEvent) {
    if (!hasFiles(e)) return
    // Always claimed, so a missed drop does not make the browser open the file.
    e.preventDefault()
    if (url.isPreviewMode) return
    local.handleDragOver(e)
  }

  function onDrop(e: DragEvent) {
    if (!hasFiles(e)) return
    e.preventDefault()
    if (url.isPreviewMode) return
    activeTab = 'upload'
    local.handleDrop(e)
  }
</script>

<Sheet open={open && canImport} title={url.isPreviewMode ? 'Preview data' : 'Import data'} size="lg" {onclose}>
  <div
    class="flex min-h-full flex-col gap-4"
    role="presentation"
    ondragover={onDragOver}
    ondragleave={local.handleDragLeave}
    ondrop={onDrop}
  >
    {#if url.isPreviewMode && url.previewData}
      <PreviewPanel {url} previewData={url.previewData} {errors} />
    {:else}
      <Tabs items={tabs} value={activeTab} onchange={(id) => (activeTab = id)} />
      {#if activeTab === 'upload'}
        <UploadTab {local} {importMode} onmodechange={(mode) => (importMode = mode)} {errors} />
      {:else if activeTab === 'url'}
        <UrlTab {url} {importMode} onmodechange={(mode) => (importMode = mode)} {errors} />
      {:else}
        <QueryTab {query} {importMode} onmodechange={(mode) => (importMode = mode)} {errors} />
      {/if}
    {/if}
  </div>
</Sheet>
