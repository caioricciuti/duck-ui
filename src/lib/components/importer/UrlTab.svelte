<script lang="ts">
  import { Link, Eye } from 'lucide-svelte'
  import Button from '../common/Button.svelte'
  import Input from '../common/Input.svelte'
  import FormField from '../common/FormField.svelte'
  import ErrorAlertList from './ErrorAlertList.svelte'
  import ImportModeSwitch from './ImportModeSwitch.svelte'
  import type { UrlImport } from '@/lib/fileImporter/urlImport.svelte'
  import type { ImportMode, UploadError } from '@/lib/fileImporter/types'

  interface Props {
    url: UrlImport
    importMode: ImportMode
    onmodechange: (mode: ImportMode) => void
    errors: UploadError[]
  }

  let { url, importMode, onmodechange, errors }: Props = $props()

  const busy = $derived(url.isUrlImporting || url.isPreviewing)
</script>

<!-- "From URL" tab: import or preview a remote CSV/JSON/Parquet file. -->
<div class="flex flex-col gap-4">
  <div>
    <h3 class="text-[13px] font-semibold text-fg">Import from URL</h3>
    <p class="mt-1 text-[13px] text-fg-3">
      DuckDB can directly read files from HTTP/HTTPS URLs. Supports CSV, JSON, and Parquet files.
    </p>
  </div>

  <FormField controlWidth="full" label="File URL" for="url-input" hint="Enter a direct URL to a CSV, JSON, or Parquet file">
    <Input id="url-input" type="url" bind:value={url.urlInput} placeholder="https://example.com/data.csv" disabled={busy} />
  </FormField>

  <FormField controlWidth="full" label="Name" for="url-table-name">
    <Input id="url-table-name" mono bind:value={url.urlTableName} placeholder="my_table" disabled={busy} />
  </FormField>

  <div>
    <p class="mb-1 text-xs font-medium text-fg-2">Import mode</p>
    <ImportModeSwitch block value={importMode} onchange={onmodechange} disabled={busy} />
    <p class="mt-1 text-xs text-fg-3">
      {importMode === 'view'
        ? 'View references URL directly (fresh data, less memory)'
        : 'Table copies data into DuckDB (faster queries)'}
    </p>
  </div>

  {#if errors.length > 0}
    <ErrorAlertList {errors} />
  {/if}

  <div class="flex gap-2">
    <Button class="flex-1" variant="outline" onclick={url.handlePreview} disabled={url.isUrlImporting} loading={url.isPreviewing}>
      {#if url.isPreviewing}
        Loading preview...
      {:else}
        <Eye size={14} />
        Preview
      {/if}
    </Button>
    <Button class="flex-1" onclick={url.handleUrlImport} disabled={url.isPreviewing} loading={url.isUrlImporting}>
      {#if url.isUrlImporting}
        Importing...
      {:else}
        <Link size={14} />
        Import directly
      {/if}
    </Button>
  </div>
</div>
