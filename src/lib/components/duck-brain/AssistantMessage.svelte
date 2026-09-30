<script lang="ts">
  import MarkdownContent from './MarkdownContent.svelte'
  import DuckBrainCodeBlock from './DuckBrainCodeBlock.svelte'
  import { parseMessageSegments } from '../brain/brain-markdown'
  import { stripCodeBlocks } from '@/lib/duckBrain/chatText'
  import type { DuckBrainMessage } from '@/store'

  interface Props {
    message: DuckBrainMessage
    onexecute?: (messageId: string, sql: string) => void
    oninsert?: (sql: string) => void
    onopenintab?: (sql: string) => void
  }

  let { message, onexecute, oninsert, onopenintab }: Props = $props()

  // Derived from the strings, not the message object: running a query replaces
  // the object with a new one, and that must not parse the markdown again.
  const content = $derived(message.content)
  const sql = $derived(message.sql)

  // With extracted SQL the prose is shown without its code blocks and the SQL
  // gets one interactive block. Without it, any ```sql fence still left in the
  // text becomes an interactive block in place.
  const prose = $derived(sql ? stripCodeBlocks(content) : '')
  const segments = $derived(sql ? [] : parseMessageSegments(content))
  const lastSqlIndex = $derived(segments.map((segment) => segment.type).lastIndexOf('sql'))
</script>

{#if sql}
  {#if prose}
    <div class="rounded-lg rounded-bl-sm bg-surface-2 px-3 py-2">
      <MarkdownContent content={prose} />
    </div>
  {/if}
  <DuckBrainCodeBlock {sql} messageId={message.id} queryResult={message.queryResult} {onexecute} {oninsert} {onopenintab} />
{:else}
  {#each segments as segment, i (i)}
    {#if segment.type === 'sql'}
      <!-- A message holds one query result, it is shown under the last block. -->
      <DuckBrainCodeBlock
        sql={segment.content}
        messageId={message.id}
        queryResult={i === lastSqlIndex ? message.queryResult : undefined}
        {onexecute}
        {oninsert}
        {onopenintab}
      />
    {:else if segment.html?.trim()}
      <div class="rounded-lg rounded-bl-sm bg-surface-2 px-3 py-2">
        <div class="prose-brain min-w-0 break-words text-[13px] text-fg">
          <!-- segment.html comes from renderMarkdown, sanitized with DOMPurify -->
          {@html segment.html}
        </div>
      </div>
    {/if}
  {/each}
{/if}
