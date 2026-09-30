<script lang="ts">
  import type { Snippet } from 'svelte'
  import { Radio } from 'lucide-svelte'
  import { duck } from '../../stores/duck.svelte'
  import { sessionPhase } from '@/lib/sessionPhase'

  /*
   * The rail button for live sessions (§23).
   *
   * It opens the Live session page like any other rail icon, and it is also
   * where a running session stays visible from every screen: green while
   * connected, with the number of guests, amber while an invite is waiting,
   * red after the link dropped. Quiet when idle, which is most of the time.
   */
  interface Props {
    active: boolean
    onclick: () => void
    class?: string
    /** The rail's active marker. */
    children?: Snippet
  }

  let { active, onclick, class: cls = '', children }: Props = $props()

  const session = $derived(duck((s) => s.session))
  const phase = $derived(sessionPhase(session))
  const guests = $derived(session.participants.filter((person) => !person.isHost).length)

  const status = $derived(
    phase === 'dropped'
      ? 'session disconnected'
      : phase === 'waiting'
        ? 'waiting to connect'
        : phase === 'connected'
          ? session.sessionName || 'in a session'
          : '',
  )
  const label = $derived(status ? `Share live: ${status}` : 'Share live')
  const tone = $derived(
    phase === 'dropped' ? 'text-danger' : phase === 'waiting' ? 'text-warning' : phase === 'connected' ? 'text-success' : '',
  )
</script>

<button class={cls} {onclick} title={label} aria-label={label} aria-current={active ? 'page' : undefined}>
  {@render children?.()}
  <Radio size={16} class={tone} />
  {#if phase === 'waiting'}
    <span class="absolute right-1 top-1 flex h-1.5 w-1.5">
      <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-warning opacity-75"></span>
      <span class="relative inline-flex h-1.5 w-1.5 rounded-full bg-warning"></span>
    </span>
  {:else if phase === 'connected' && guests > 0}
    <span
      class="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-success px-1 text-[9px] font-medium tabular-nums text-canvas"
    >
      {guests}
    </span>
  {/if}
</button>
