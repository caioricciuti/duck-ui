<script lang="ts">
  import { Check, Copy, FileInput, FilePlus2, Play } from 'lucide-svelte'
  import Button from '../common/Button.svelte'
  import Spinner from '../common/Spinner.svelte'
  import ResultsArtifact from './ResultsArtifact.svelte'
  import * as toast from '../../stores/toast.svelte'
  import type { QueryResultArtifact } from '@/store'

  interface Props {
    sql: string
    messageId: string
    queryResult?: QueryResultArtifact
    onexecute?: (messageId: string, sql: string) => void
    /** Replace the query of the SQL tab under the sheet. Absent when there is none. */
    oninsert?: (sql: string) => void
    onopenintab?: (sql: string) => void
  }

  let { sql, messageId, queryResult, onexecute, oninsert, onopenintab }: Props = $props()

  let copied = $state(false)
  let copiedTimer: ReturnType<typeof setTimeout> | undefined

  const running = $derived(queryResult?.status === 'running')

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(sql)
      copied = true
      toast.success('SQL copied to clipboard')
      clearTimeout(copiedTimer)
      copiedTimer = setTimeout(() => (copied = false), 2000)
    } catch {
      toast.error('Failed to copy')
    }
  }

  function handleExecute() {
    if (onexecute && !running) onexecute(messageId, sql)
  }

  $effect(() => () => clearTimeout(copiedTimer))
</script>

<div class="space-y-2">
  <div class="overflow-hidden rounded-md border border-edge-subtle bg-surface">
    <!-- SQL from the model is rendered as text, never as HTML. -->
    <pre class="overflow-x-auto p-3 text-xs leading-relaxed"><code class="whitespace-pre-wrap break-words font-mono text-fg">{sql}</code></pre>

    <div class="flex flex-wrap items-center gap-1 border-t border-edge-subtle bg-surface-2 p-1.5">
      <Button variant="ghost" size="sm" onclick={handleCopy}>
        {#if copied}
          <Check size={13} />
          Copied
        {:else}
          <Copy size={13} />
          Copy
        {/if}
      </Button>

      {#if oninsert}
        <Button variant="ghost" size="sm" title="Replace the query in the current SQL tab" onclick={() => oninsert(sql)}>
          <FileInput size={13} />
          Insert
        </Button>
      {/if}

      {#if onopenintab}
        <Button variant="ghost" size="sm" title="Open this query in a new SQL tab" onclick={() => onopenintab(sql)}>
          <FilePlus2 size={13} />
          New tab
        </Button>
      {/if}

      {#if onexecute}
        <Button variant="ghost" size="sm" class="text-accent hover:text-accent" disabled={running} onclick={handleExecute}>
          {#if running}
            <Spinner size="sm" class="h-3.5 w-3.5" />
            Running...
          {:else}
            <Play size={13} />
            Run
          {/if}
        </Button>
      {/if}
    </div>
  </div>

  {#if queryResult && queryResult.status !== 'pending'}
    <ResultsArtifact {queryResult} onretry={handleExecute} />
  {/if}
</div>
