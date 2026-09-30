<script lang="ts">
  import { renderMarkdown } from '../brain/brain-markdown'
  import { findStableBoundary } from '@/lib/duckBrain/chatText'

  interface Props {
    /** Full text received so far. Grows by a token at a time. */
    content: string
  }

  let { content }: Props = $props()

  // Settled blocks are parsed once and never touched again. Only the tail,
  // the block still being written, is parsed again, at most once per frame.
  let blocks = $state.raw<string[]>([])
  let tailHtml = $state('')

  let settled = ''
  let latest = ''
  let frame = 0

  function flush() {
    frame = 0
    // A text that does not extend the settled part belongs to a new response.
    if (!latest.startsWith(settled)) {
      settled = ''
      blocks = []
    }
    const rest = latest.slice(settled.length)
    const cut = findStableBoundary(rest)
    if (cut > 0) {
      const chunk = rest.slice(0, cut)
      settled += chunk
      blocks = [...blocks, renderMarkdown(chunk)]
    }
    tailHtml = renderMarkdown(rest.slice(cut))
  }

  $effect(() => {
    latest = content
    if (!frame) frame = requestAnimationFrame(flush)
  })

  $effect(() => () => cancelAnimationFrame(frame))
</script>

<div class="prose-brain min-w-0 break-words text-[13px] text-fg">
  {#each blocks as html, i (i)}
    <div>{@html html}</div>
  {/each}
  <div>{@html tailHtml}</div>
  <span class="inline-block h-3.5 w-1 animate-pulse rounded-sm bg-accent align-middle" aria-hidden="true"></span>
</div>
