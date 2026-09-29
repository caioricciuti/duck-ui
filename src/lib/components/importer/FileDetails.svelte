<script lang="ts">
  import { FileWarning, FileCheck, X, File as FileIcon, Calendar, HardDrive, RefreshCw } from 'lucide-svelte'
  import Button from '../common/Button.svelte'
  import Input from '../common/Input.svelte'
  import FormField from '../common/FormField.svelte'
  import Badge from '../common/Badge.svelte'
  import CsvOptionsPanel from './CsvOptionsPanel.svelte'
  import { formatFileSize } from '@/lib/fileImporter/helpers'
  import { tableNameError } from '@/lib/fileImporter/context'
  import type { CsvImportOptions, FileImportState } from '@/lib/fileImporter/types'

  interface Props {
    file: File
    tableName: string
    ontablenamechange: (name: string) => void
    status: FileImportState
    onremove: () => void
    onretry: () => void
    csvOptions?: CsvImportOptions
    oncsvoptionschange?: (options: CsvImportOptions) => void
  }

  let { file, tableName, ontablenamechange, status, onremove, onretry, csvOptions, oncsvoptionschange }: Props = $props()

  const iconTones: Record<string, string> = {
    csv: 'text-success',
    json: 'text-warning',
    parquet: 'text-info',
    arrow: 'text-accent',
    duckdb: 'text-accent',
    xlsx: 'text-info',
  }

  const fileType = $derived(file.name.split('.').pop()?.toLowerCase() ?? '')
  const idSuffix = $derived(file.name.replace(/[^a-zA-Z0-9_-]/g, '-'))
  const busy = $derived(status.status === 'uploading' || status.status === 'processing')
  const nameError = $derived(tableNameError(tableName))
  const lastModified = $derived(
    new Date(file.lastModified).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
  )

  function changeCsvOption(key: keyof CsvImportOptions, value: string | boolean | number | undefined) {
    if (oncsvoptionschange && csvOptions) oncsvoptionschange({ ...csvOptions, [key]: value })
  }
</script>

<div class="rounded-md border border-edge bg-surface p-3">
  <div class="flex items-start gap-3">
    <FileIcon size={22} strokeWidth={1.5} class="mt-0.5 shrink-0 {iconTones[fileType] ?? 'text-fg-3'}" />

    <div class="min-w-0 flex-1">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <h3 class="truncate text-[13px] font-medium text-fg" title={file.name}>{file.name}</h3>
          <div class="mt-1 flex flex-wrap items-center gap-3 text-xs text-fg-3">
            <span class="inline-flex items-center gap-1" title="File size">
              <HardDrive size={12} />
              {formatFileSize(file.size)}
            </span>
            <span class="inline-flex items-center gap-1" title="Last modified">
              <Calendar size={12} />
              {lastModified}
            </span>
            <Badge class="uppercase">{fileType}</Badge>
          </div>
        </div>
        <div class="flex shrink-0 items-center">
          {#if status.status === 'error'}
            <Button icon variant="ghost" size="xs" onclick={onretry} aria-label="Retry {file.name}" title="Retry">
              <RefreshCw size={13} />
            </Button>
          {/if}
          <Button icon variant="ghost" size="xs" onclick={onremove} aria-label="Remove {file.name}" title="Remove file">
            <X size={13} />
          </Button>
        </div>
      </div>

      <FormField
        class="mt-3"
        label="Table name"
        for="table-{idSuffix}"
        required
        error={nameError ?? undefined}
        hint="This name will be used to reference the table in SQL queries"
      >
        <Input
          id="table-{idSuffix}"
          size="sm"
          mono
          required
          value={tableName}
          placeholder="Enter table name"
          invalid={!!nameError}
          disabled={busy}
          oninput={(e) => ontablenamechange(e.currentTarget.value)}
        />
      </FormField>

      {#if fileType === 'csv' && csvOptions}
        <CsvOptionsPanel {idSuffix} disabled={busy} {csvOptions} onchange={changeCsvOption} />
      {/if}

      {#if status.status === 'uploading' && status.progress !== undefined}
        <div class="mt-3">
          <span class="text-xs text-fg-3">Uploading... {status.progress}%</span>
          <div
            class="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={status.progress}
            aria-label="Upload progress for {file.name}"
          >
            <div class="h-full bg-accent transition-[width]" style="width: {status.progress}%"></div>
          </div>
        </div>
      {/if}

      {#if status.status === 'success'}
        <p class="mt-3 flex items-center gap-1.5 rounded-md bg-success-soft px-2 py-1.5 text-xs text-success">
          <FileCheck size={13} />
          Successfully imported
        </p>
      {/if}

      {#if status.status === 'error' && status.error}
        <p class="mt-3 flex items-start gap-1.5 rounded-md bg-danger-soft px-2 py-1.5 text-xs text-danger" role="alert">
          <FileWarning size={13} class="mt-0.5 shrink-0" />
          <span class="min-w-0 break-words">{status.error}</span>
        </p>
      {/if}
    </div>
  </div>
</div>
