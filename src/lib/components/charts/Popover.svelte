<script lang="ts">
  import type { Snippet } from 'svelte'

  interface Props {
    open?: boolean
    /** Which edge of the trigger the panel lines up with. */
    align?: 'start' | 'end'
    /** Accessible name of the panel. */
    label: string
    panelClass?: string
    class?: string
    trigger: Snippet<[{ open: boolean; toggle: () => void }]>
    children: Snippet
  }

  let {
    open = $bindable(false),
    align = 'start',
    label,
    panelClass = 'w-64',
    class: cls = '',
    trigger,
    children,
  }: Props = $props()

  let root = $state<HTMLDivElement | null>(null)

  const toggle = () => (open = !open)

  function onWindowPointerDown(e: PointerEvent) {
    if (open && root && !root.contains(e.target as Node)) open = false
  }

  function onWindowKeydown(e: KeyboardEvent) {
    if (open && e.key === 'Escape') open = false
  }
</script>

<svelte:window onpointerdown={onWindowPointerDown} onkeydown={onWindowKeydown} />

<div bind:this={root} class="relative {cls}">
  {@render trigger({ open, toggle })}
  {#if open}
    <div
      role="dialog"
      aria-label={label}
      class="surface-card absolute top-full z-50 mt-1 rounded-md p-3 {align === 'end' ? 'right-0' : 'left-0'} {panelClass}"
    >
      {@render children()}
    </div>
  {/if}
</div>
