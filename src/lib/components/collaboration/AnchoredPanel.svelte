<script lang="ts">
  import { tick } from 'svelte'
  import type { Snippet } from 'svelte'

  interface Props {
    open: boolean
    /** The element the panel hangs off. */
    anchor: HTMLElement | null
    /** Accessible name of the panel. */
    label: string
    class?: string
    onclose: () => void
    children: Snippet
  }

  /*
   * A panel positioned against the viewport rather than its parent. The
   * indicator lives in a 48px rail or a crowded tab bar, and a panel laid out
   * inside either would be clipped by it.
   */
  let { open, anchor, label, class: cls = 'w-72', onclose, children }: Props = $props()

  const GAP = 6
  const PAD = 8
  /** Anchors this close to the left edge sit in the rail, so open sideways. */
  const RAIL_WIDTH = 80

  let panel = $state<HTMLDivElement | null>(null)
  let left = $state(0)
  let top = $state(0)

  function clamp(value: number, max: number): number {
    return Math.max(PAD, Math.min(value, max))
  }

  function position() {
    if (!anchor || !panel) return
    const a = anchor.getBoundingClientRect()
    const p = panel.getBoundingClientRect()
    const maxLeft = window.innerWidth - p.width - PAD
    const maxTop = window.innerHeight - p.height - PAD

    if (a.left < RAIL_WIDTH) {
      left = clamp(a.right + GAP, maxLeft)
      top = clamp(a.bottom - p.height, maxTop)
      return
    }
    const below = a.bottom + GAP
    left = clamp(a.right - p.width, maxLeft)
    top = clamp(below + p.height > window.innerHeight - PAD ? a.top - p.height - GAP : below, maxTop)
  }

  $effect(() => {
    if (!open || !panel) return
    // The content decides the size, and it renders after the panel node.
    void tick().then(position)
    const observer = new ResizeObserver(position)
    observer.observe(panel)
    return () => observer.disconnect()
  })

  function onWindowPointerDown(e: PointerEvent) {
    if (!open) return
    const target = e.target as Node
    if (panel?.contains(target) || anchor?.contains(target)) return
    onclose()
  }

  function onWindowKeydown(e: KeyboardEvent) {
    if (open && e.key === 'Escape') onclose()
  }
</script>

<svelte:window onpointerdown={onWindowPointerDown} onkeydown={onWindowKeydown} onresize={position} />

{#if open}
  <div
    bind:this={panel}
    role="dialog"
    aria-label={label}
    class="surface-card fixed z-[60] rounded-md p-3 {cls}"
    style="left:{left}px;top:{top}px"
  >
    {@render children()}
  </div>
{/if}
