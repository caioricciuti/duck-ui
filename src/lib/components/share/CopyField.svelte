<script lang="ts">
  import { Check, Copy } from 'lucide-svelte'
  import Button from '../common/Button.svelte'

  interface Props {
    value: string
    /** Accessible name of the text, which has no visible label of its own. */
    label: string
    rows?: number
    /** Still being built: the text is a placeholder and cannot be copied. */
    busy?: boolean
    copied?: boolean
    oncopy: () => void
  }

  let { value, label, rows = 2, busy = false, copied = false, oncopy }: Props = $props()
</script>

<div class="flex items-stretch gap-2">
  <textarea
    readonly
    {rows}
    {value}
    aria-label={label}
    class="w-full resize-none rounded-md border border-edge bg-surface px-2.5 py-2 font-mono text-xs leading-relaxed text-fg transition-colors hover:border-edge-strong focus:border-accent focus:outline-none"
    onfocus={(e) => e.currentTarget.select()}
  ></textarea>
  <Button icon class="h-auto w-10" onclick={oncopy} disabled={busy} loading={busy} aria-label="Copy {label}">
    <!-- While busy the button shows its own spinner. -->
    {#if copied}
      <Check size={14} />
    {:else if !busy}
      <Copy size={14} />
    {/if}
  </Button>
</div>
