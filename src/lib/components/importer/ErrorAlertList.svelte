<script lang="ts">
  import { AlertTriangle, FileWarning } from 'lucide-svelte'
  import { getErrorSuggestion } from '@/lib/fileImporter/helpers'
  import type { UploadError } from '@/lib/fileImporter/types'

  interface Props {
    errors: UploadError[]
    /** Upload tab: prefix the file name and honor the warning severity. */
    detailed?: boolean
  }

  let { errors, detailed = false }: Props = $props()
</script>

<div class="flex flex-col gap-2" role="alert">
  {#each errors as error (error.id)}
    {@const suggestion = getErrorSuggestion(error.message)}
    {@const warning = detailed && error.severity === 'warning'}
    <div class="rounded-md border p-3 text-[13px] {warning ? 'border-warning/30 bg-warning-soft' : 'border-danger/30 bg-danger-soft'}">
      <p class="flex items-center gap-1.5 text-xs font-semibold {warning ? 'text-warning' : 'text-danger'}">
        {#if warning}<FileWarning size={13} />{:else}<AlertTriangle size={13} />{/if}
        {warning ? 'Warning' : 'Error'}
      </p>
      <p class="mt-1 break-words text-fg-2">
        {detailed && error.file ? `${error.file}: ${error.message}` : error.message}
      </p>
      {#if suggestion}
        <p class="mt-2 border-t border-edge-subtle pt-2 text-xs text-fg-3">
          <strong class="font-semibold text-fg-2">Suggestion:</strong>
          {suggestion}
        </p>
      {/if}
    </div>
  {/each}
</div>
