<script lang="ts">
  import { tick, untrack } from 'svelte'
  import { Import } from 'lucide-svelte'
  import Button from '../common/Button.svelte'
  import Input from '../common/Input.svelte'
  import FormField from '../common/FormField.svelte'
  import ImportModeSwitch from '../importer/ImportModeSwitch.svelte'
  import { trapFocus } from '../../utils/focus-trap'
  import { generateTableName, type ImportOptions } from '@/lib/fileImporter/folderImport'
  import type { ImportMode } from '@/lib/fileImporter/types'

  interface Props {
    open: boolean
    fileName: string
    /** Viewport position of the trigger; the popover opens to its right. */
    x: number
    y: number
    onimport: (options: ImportOptions) => void
    onclose: () => void
  }

  let { open, fileName, x, y, onimport, onclose }: Props = $props()

  let tableName = $state('')
  let importMode = $state<ImportMode>('table')
  let panelEl: HTMLDivElement | undefined = $state()
  let left = $state(0)
  let top = $state(0)

  $effect(() => {
    if (!open) return
    // Reset to defaults when opening
    tableName = generateTableName(fileName)
    importMode = 'table'
    left = x
    top = y
    untrack(() => void tick().then(reposition))
  })

  function reposition() {
    if (!panelEl) return
    const rect = panelEl.getBoundingClientRect()
    const pad = 8
    left = Math.min(Math.max(x, pad), window.innerWidth - rect.width - pad)
    top = Math.min(Math.max(y, pad), window.innerHeight - rect.height - pad)
  }

  function submit() {
    const name = tableName.trim()
    if (!name) return
    onimport({ tableName: name, importMode })
    onclose()
  }

  function onKeydown(e: KeyboardEvent) {
    if (!open || e.key !== 'Escape') return
    e.preventDefault()
    onclose()
  }
</script>

<svelte:window onkeydown={onKeydown} onresize={reposition} />

{#if open}
  <div class="fixed inset-0 z-[60]" role="presentation" onclick={onclose}></div>
  <div
    bind:this={panelEl}
    class="surface-card fixed z-[61] flex w-72 flex-col gap-3 rounded-md p-3"
    style="left:{left}px;top:{top}px;box-shadow: var(--shadow-popover)"
    role="dialog"
    aria-label="Import options for {fileName}"
    tabindex="-1"
    use:trapFocus
  >
    <div class="min-w-0">
      <h4 class="text-[13px] font-semibold text-fg">Import options</h4>
      <p class="truncate text-xs text-fg-3" title={fileName}>{fileName}</p>
    </div>

    <FormField controlWidth="full" label="Name" for="folder-import-name">
      <Input
        id="folder-import-name"
        size="sm"
        mono
        bind:value={tableName}
        placeholder="table_name"
        onkeydown={(e) => e.key === 'Enter' && submit()}
      />
    </FormField>

    <div>
      <p class="mb-1 text-xs font-medium text-fg-2">Mode</p>
      <ImportModeSwitch block label="Mode" value={importMode} onchange={(mode) => (importMode = mode)} />
      <p class="mt-1 text-[11px] text-fg-3">
        {importMode === 'table' ? 'Copies data into DuckDB (faster queries)' : 'Links to file (fresh data, less memory)'}
      </p>
    </div>

    <Button class="w-full" size="sm" onclick={submit} disabled={!tableName.trim()}>
      <Import size={13} />
      {importMode === 'table' ? 'Import' : 'Link'}
    </Button>
  </div>
{/if}
