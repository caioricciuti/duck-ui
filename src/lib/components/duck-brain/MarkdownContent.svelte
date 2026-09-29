<script lang="ts">
  import { renderMarkdown } from '../brain/brain-markdown'
  import { stripCodeBlocks } from '@/lib/duckBrain/chatText'

  interface Props {
    content: string
    /** Drop fenced code blocks, for messages whose SQL is shown as its own block. */
    skipCodeBlocks?: boolean
    class?: string
  }

  let { content, skipCodeBlocks = false, class: cls = '' }: Props = $props()

  const processed = $derived(skipCodeBlocks ? stripCodeBlocks(content) : content)
  // Model output is untrusted. renderMarkdown sanitizes it with DOMPurify.
  const html = $derived(processed ? renderMarkdown(processed) : '')
</script>

{#if html}
  <div class="prose-brain min-w-0 break-words text-[13px] text-fg {cls}">
    {@html html}
  </div>
{/if}
