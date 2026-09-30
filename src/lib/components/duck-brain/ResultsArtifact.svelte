<script lang="ts">
  import { AlertCircle, RotateCcw, Table2 } from 'lucide-svelte'
  import Badge from '../common/Badge.svelte'
  import Button from '../common/Button.svelte'
  import Spinner from '../common/Spinner.svelte'
  import VirtualTable from '../table/VirtualTable.svelte'
  import type { QueryResultArtifact } from '@/store'
  import { toTableData } from '@/lib/duckBrain/chatText'

  interface Props {
    queryResult: QueryResultArtifact
    onretry?: () => void
  }

  let { queryResult, onretry }: Props = $props()

  // Matches the grid: 34 px rows under a 36 px header.
  const ROW_HEIGHT = 34
  const HEADER_HEIGHT = 36
  const MAX_HEIGHT = 280
  const EMPTY_HEIGHT = 190

  const result = $derived(queryResult.status === 'success' ? queryResult.data : undefined)
  const table = $derived(result ? toTableData(result) : null)
  const height = $derived(
    table && table.data.length > 0
      ? Math.min(MAX_HEIGHT, HEADER_HEIGHT + table.data.length * ROW_HEIGHT + 2)
      : EMPTY_HEIGHT,
  )
</script>

{#if queryResult.status === 'running'}
  <div class="flex items-center gap-2 rounded-md border border-edge-subtle bg-surface p-2.5" role="status">
    <Spinner size="sm" class="text-accent" />
    <span class="text-[13px] text-fg-3">Executing query...</span>
  </div>
{:else if queryResult.status === 'error'}
  <div class="rounded-md border border-danger/40 bg-danger-soft p-2.5" role="alert">
    <div class="flex items-start gap-2">
      <AlertCircle size={15} class="mt-0.5 shrink-0 text-danger" />
      <div class="min-w-0 flex-1">
        <p class="text-[13px] font-medium text-danger">Query failed</p>
        <p class="mt-1 break-words text-xs text-fg-2">{queryResult.error || 'Unknown error occurred'}</p>
      </div>
      {#if onretry}
        <Button variant="ghost" size="sm" onclick={onretry}>
          <RotateCcw size={13} />
          Retry
        </Button>
      {/if}
    </div>
  </div>
{:else if result && table}
  <div class="overflow-hidden rounded-md border border-edge-subtle bg-surface">
    <div class="flex items-center gap-2 border-b border-edge-subtle bg-surface-2 px-2.5 py-1.5">
      <Table2 size={14} class="text-fg-3" />
      <span class="text-xs font-medium text-fg">Results</span>
      <Badge tone="neutral">
        {result.rowCount.toLocaleString()} row{result.rowCount !== 1 ? 's' : ''}
      </Badge>
      {#if result.truncated}
        <Badge tone="warning" title="The engine stopped at the row limit. This is only the first part of the result.">
          truncated
        </Badge>
      {/if}
    </div>
    <div class="flex min-h-0 flex-col" style="height:{height}px">
      <VirtualTable meta={table.meta} data={table.data} />
    </div>
  </div>
{/if}
