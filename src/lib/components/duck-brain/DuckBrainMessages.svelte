<script lang="ts">
  import { tick } from 'svelte'
  import { ArrowDown, Bot, Columns3, Table2, User } from 'lucide-svelte'
  import AssistantMessage from './AssistantMessage.svelte'
  import StreamingMarkdown from './StreamingMarkdown.svelte'
  import type { DuckBrainMessage } from '@/store'
  import { splitMentions } from '@/lib/duckBrain/chatText'

  interface Props {
    messages: DuckBrainMessage[]
    streamingContent: string
    generating: boolean
    onexecute?: (messageId: string, sql: string) => void
    oninsert?: (sql: string) => void
    onopenintab?: (sql: string) => void
  }

  let { messages, streamingContent, generating, onexecute, oninsert, onopenintab }: Props = $props()

  // Distance from the bottom, in px, under which the list counts as "at the bottom".
  const PIN_THRESHOLD = 48

  let scroller = $state<HTMLDivElement | null>(null)
  let inner = $state<HTMLDivElement | null>(null)
  // True while the list follows new content. Scrolling up releases it.
  let pinned = $state(true)

  function scrollToBottom() {
    if (scroller) scroller.scrollTop = scroller.scrollHeight
  }

  function handleScroll() {
    if (!scroller) return
    pinned = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < PIN_THRESHOLD
  }

  // Follow every change of height (tokens, a result grid, a resize of the
  // sheet) instead of every change of data, and only while pinned.
  $effect(() => {
    if (!scroller || !inner) return
    const observer = new ResizeObserver(() => {
      if (pinned) scrollToBottom()
    })
    observer.observe(inner)
    observer.observe(scroller)
    scrollToBottom()
    return () => observer.disconnect()
  })

  // Sending a message always brings the list back to the bottom.
  $effect(() => {
    if (messages[messages.length - 1]?.role !== 'user') return
    pinned = true
    void tick().then(scrollToBottom)
  })

  function jumpToLatest() {
    pinned = true
    scrollToBottom()
  }

  function formatTime(date: Date): string {
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
</script>

{#if messages.length === 0 && !generating}
  <div class="flex min-h-0 flex-1 items-center justify-center p-4">
    <div class="text-center text-fg-3">
      <Bot size={40} class="mx-auto mb-3 opacity-50" />
      <p class="text-[13px] font-medium text-fg-2">Hi! I'm Duck Brain</p>
      <p class="mt-1 text-xs">Ask me to write SQL queries for your data</p>
    </div>
  </div>
{:else}
  <div class="relative flex min-h-0 flex-1 flex-col">
    <div bind:this={scroller} class="min-h-0 flex-1 overflow-y-auto" onscroll={handleScroll}>
      <div bind:this={inner} class="space-y-4 p-3" role="log" aria-label="Conversation">
        {#each messages as message (message.id)}
          <div class="flex gap-2.5 {message.role === 'user' ? 'justify-end' : 'justify-start'}">
            {#if message.role === 'assistant'}
              <div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft">
                <Bot size={15} class="text-accent" />
              </div>
            {/if}

            <div class="flex min-w-0 max-w-[85%] flex-col gap-2 {message.role === 'user' ? 'items-end' : 'items-stretch'}">
              {#if message.role === 'user'}
                <div class="rounded-lg rounded-br-sm bg-accent px-3 py-2 text-accent-fg">
                  <p class="whitespace-pre-wrap break-words text-[13px]">
                    {#each splitMentions(message.content) as part}{#if part.type === 'mention'}<span
                          class="mx-0.5 inline-flex items-center gap-1 rounded-sm bg-accent-fg/15 px-1.5 py-0.5 align-baseline text-xs font-medium"
                          >{#if part.isColumn}<Columns3 size={12} />{:else}<Table2 size={12} />{/if}{part.value}</span
                        >{:else}{part.value}{/if}{/each}
                  </p>
                </div>
              {:else}
                <AssistantMessage {message} {onexecute} {oninsert} {onopenintab} />
              {/if}

              <span class="px-1 text-[10px] text-fg-3">{formatTime(message.timestamp)}</span>
            </div>

            {#if message.role === 'user'}
              <div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg-2">
                <User size={15} />
              </div>
            {/if}
          </div>
        {/each}

        {#if generating}
          <div class="flex justify-start gap-2.5" aria-live="off">
            <div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft">
              <Bot size={15} class="text-accent {streamingContent ? 'animate-pulse' : ''}" />
            </div>
            {#if streamingContent}
              <div class="min-w-0 max-w-[85%] rounded-lg rounded-bl-sm bg-surface-2 px-3 py-2">
                <StreamingMarkdown content={streamingContent} />
              </div>
            {:else}
              <div class="rounded-lg rounded-bl-sm bg-surface-2 px-3 py-2.5" role="status" aria-label="Duck Brain is thinking">
                <div class="flex gap-1">
                  <span class="h-2 w-2 animate-bounce rounded-full bg-fg-4"></span>
                  <span class="h-2 w-2 animate-bounce rounded-full bg-fg-4 [animation-delay:150ms]"></span>
                  <span class="h-2 w-2 animate-bounce rounded-full bg-fg-4 [animation-delay:300ms]"></span>
                </div>
              </div>
            {/if}
          </div>
        {/if}
      </div>
    </div>

    {#if !pinned}
      <button
        type="button"
        class="surface-card absolute bottom-2 left-1/2 inline-flex h-7 -translate-x-1/2 items-center gap-1.5 rounded-full px-2.5 text-xs text-fg-2 hover:text-fg"
        onclick={jumpToLatest}
      >
        <ArrowDown size={13} />
        Latest
      </button>
    {/if}
  </div>
{/if}
