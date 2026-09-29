<script lang="ts">
  import { GitFork, KeyRound, Radio, UserMinus, UserPlus, X } from 'lucide-svelte'
  import Button from '../common/Button.svelte'
  import Tooltip from '../common/Tooltip.svelte'
  import ContextMenu, { type ContextMenuItem } from '../common/ContextMenu.svelte'
  import AnchoredPanel from './AnchoredPanel.svelte'
  import ShareLiveDialog from './ShareLiveDialog.svelte'
  import JoinByCodeDialog from './JoinByCodeDialog.svelte'
  import ForkDialog from './ForkDialog.svelte'
  import { duck, duckActions } from '../../stores/duck.svelte'
  import { safePeerColor } from '@/lib/editor/collaboration'
  import type { SharedCapability } from '@/services/collaboration/capabilities/capability'

  /*
   * Live-session status (§23).
   *
   * Icon-only, like every other control in the rail: a label keyed off a
   * viewport breakpoint cannot see the width of the column it sits in, so
   * the label belongs in a tooltip.
   *
   * Restrained when idle, which is most of the time: one quiet button, and no
   * collaboration machinery running behind it at all.
   */
  const session = $derived(duck((s) => s.session))

  let anchor = $state<HTMLSpanElement | null>(null)
  let panelOpen = $state(false)
  let menuOpen = $state(false)
  let menuAt = $state({ x: 0, y: 0 })
  let shareOpen = $state(false)
  let joinOpen = $state(false)
  let forking = $state<SharedCapability | null>(null)

  const isLive = $derived(
    session.status === 'connected' || session.status === 'awaiting-guest' || session.status === 'awaiting-host',
  )
  // The link died after a session was up (network drop, host gone). Manual
  // signaling cannot silently re-pair, a rejoin needs a fresh invite, so be
  // explicit about what happened and what survives: everything local.
  const dropped = $derived(session.role !== null && (session.status === 'disconnected' || session.status === 'failed'))
  const waiting = $derived(session.status === 'awaiting-guest' || session.status === 'awaiting-host')
  const guests = $derived(session.participants.filter((person) => !person.isHost).length)
  const isHost = $derived(session.role === 'host')
  const sessionTitle = $derived(session.sessionName || 'Live session')

  const buttonLabel = $derived(dropped ? 'Session disconnected' : isLive ? 'Session details' : 'Live session')
  const tooltip = $derived(
    dropped ? 'Session disconnected' : !isLive ? 'Share Live' : waiting ? 'Waiting to connect' : sessionTitle,
  )
  const tone = $derived(dropped ? 'text-danger' : !isLive ? '' : waiting ? 'text-warning' : 'text-success')

  const menuItems: ContextMenuItem[] = [
    { id: 'host', label: 'Share Live: host a session', icon: Radio, onSelect: () => openShare() },
    // An invite normally arrives as a link, but a link can be mangled by
    // whatever carried it. The code alone is always enough.
    { id: 'join', label: 'Join with an invite code', icon: KeyRound, onSelect: () => openJoin() },
  ]

  // The panel and the dialogs never show together: the dialog is modal, and
  // two open dialogs would leave the one behind unreachable.
  function openShare() {
    panelOpen = false
    shareOpen = true
  }

  function openJoin() {
    panelOpen = false
    joinOpen = true
  }

  function openFork(capability: SharedCapability) {
    panelOpen = false
    forking = capability
  }

  function onTrigger() {
    if (dropped || isLive) {
      panelOpen = !panelOpen
      return
    }
    const rect = anchor?.getBoundingClientRect()
    if (!rect) return
    // Beside the button in the rail, under it anywhere else.
    menuAt = rect.left < 80 ? { x: rect.right + 6, y: rect.top } : { x: rect.left, y: rect.bottom + 4 }
    menuOpen = true
  }

  async function end() {
    panelOpen = false
    await duckActions().endLiveSession()
  }

  async function endAnd(next: () => void) {
    await end()
    next()
  }

  // The session can end from the other side while the panel is open.
  $effect(() => {
    if (!dropped && !isLive) panelOpen = false
  })
</script>

<span bind:this={anchor} class="inline-flex">
  <Tooltip text={tooltip}>
    <Button
      icon
      variant="ghost"
      size="sm"
      class="relative"
      aria-label={buttonLabel}
      aria-expanded={panelOpen || menuOpen}
      onclick={onTrigger}
    >
      <Radio size={15} class={tone} />
      {#if isLive && waiting}
        <span class="absolute right-1 top-1 flex h-1.5 w-1.5">
          <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-warning opacity-75"></span>
          <span class="relative inline-flex h-1.5 w-1.5 rounded-full bg-warning"></span>
        </span>
      {:else if isLive && guests > 0}
        <span
          class="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-success px-1 text-[9px] font-medium tabular-nums text-canvas"
        >
          {guests}
        </span>
      {/if}
    </Button>
  </Tooltip>
</span>

<ContextMenu open={menuOpen} x={menuAt.x} y={menuAt.y} items={menuItems} onclose={() => (menuOpen = false)} />

<AnchoredPanel open={panelOpen} {anchor} label={buttonLabel} onclose={() => (panelOpen = false)}>
  {#if dropped}
    <div class="flex flex-col gap-3">
      <div>
        <p class="text-[13px] font-medium text-fg">The live session dropped</p>
        <p class="mt-1 text-xs text-fg-3">
          Your workspace, results and any forked tables are untouched. They live in this browser. To reconnect,
          {session.role === 'guest' ? 'ask the host for a fresh invite' : 'send a fresh invite'}; rejoining brings the
          shared workspace back where it was.
        </p>
      </div>
      <div class="flex gap-2">
        {#if session.role === 'guest'}
          <Button size="sm" class="flex-1" onclick={() => endAnd(openJoin)}>Rejoin with a new code</Button>
        {:else}
          <Button size="sm" class="flex-1" onclick={() => endAnd(openShare)}>Start a new session</Button>
        {/if}
        <Button size="sm" variant="outline" onclick={end}>Dismiss</Button>
      </div>
    </div>
  {:else}
    <div class="flex flex-col gap-3">
      <div>
        <p class="truncate text-[13px] font-medium text-fg">{sessionTitle}</p>
        <p class="text-xs text-fg-3">{isHost ? "You're hosting" : `Hosted by ${session.hostName}`}</p>
      </div>

      <div class="flex flex-col gap-1">
        <p class="text-[11px] font-medium uppercase tracking-wide text-fg-3">Participants</p>
        {#if session.participants.length === 0}
          <p class="text-xs text-fg-3">{isHost ? 'Waiting for someone to join...' : 'Connecting to the session...'}</p>
        {:else}
          {#each session.participants as person (person.peerId)}
            <div class="flex h-6 items-center gap-2 text-[13px] text-fg">
              <span class="h-2 w-2 shrink-0 rounded-full" style="background-color: {safePeerColor(person.color)}"></span>
              <span class="min-w-0 flex-1 truncate">{person.displayName}</span>
              {#if person.isHost}
                <span class="text-xs text-fg-3">host</span>
              {/if}
              {#if isHost && !person.isHost}
                <Button
                  icon
                  size="xs"
                  variant="ghost"
                  onclick={() => duckActions().removeParticipant(person.peerId)}
                  aria-label="Remove {person.displayName} from the session"
                >
                  <UserMinus size={13} />
                </Button>
              {/if}
            </div>
          {/each}
        {/if}
      </div>

      {#if session.sharedCapabilities.length > 0}
        <div class="flex flex-col gap-1">
          <p class="text-[11px] font-medium uppercase tracking-wide text-fg-3">Shared data</p>
          {#each session.sharedCapabilities as capability (capability.id)}
            <div class="flex items-center justify-between gap-2">
              <div class="min-w-0">
                <p class="truncate text-[13px] text-fg">{capability.name}</p>
                <p class="text-xs text-fg-3">Read-only</p>
              </div>
              {#if session.role === 'guest'}
                <Button icon size="xs" variant="ghost" onclick={() => openFork(capability)} aria-label="Fork {capability.name}">
                  <GitFork size={13} />
                </Button>
              {:else if isHost}
                <Button
                  icon
                  size="xs"
                  variant="ghost"
                  onclick={() => duckActions().revokeCapability(capability.id)}
                  aria-label="Withdraw access to {capability.name}"
                >
                  <X size={13} />
                </Button>
              {/if}
            </div>
          {/each}
        </div>
      {/if}

      <div class="flex gap-2 pt-1">
        {#if isHost}
          <Button size="sm" variant="outline" class="flex-1" onclick={openShare}>
            <UserPlus size={13} />
            Invite
          </Button>
        {/if}
        <Button size="sm" variant="danger" class="flex-1" onclick={end}>{isHost ? 'End session' : 'Leave'}</Button>
      </div>
    </div>
  {/if}
</AnchoredPanel>

<ShareLiveDialog open={shareOpen} onclose={() => (shareOpen = false)} />
<JoinByCodeDialog open={joinOpen} onclose={() => (joinOpen = false)} />
{#if forking}
  <ForkDialog capability={forking} open onclose={() => (forking = null)} />
{/if}
