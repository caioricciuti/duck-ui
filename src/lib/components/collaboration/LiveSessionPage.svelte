<script lang="ts">
  import { Check, Copy, ExternalLink, Eye, GitFork, Cpu, Unplug, UserMinus, X } from 'lucide-svelte'
  import PageHeader from '../common/PageHeader.svelte'
  import PageBody from '../common/PageBody.svelte'
  import Panel from '../common/Panel.svelte'
  import Badge from '../common/Badge.svelte'
  import Button from '../common/Button.svelte'
  import Input from '../common/Input.svelte'
  import FormField from '../common/FormField.svelte'
  import HostSession from './HostSession.svelte'
  import JoinByCode from './JoinByCode.svelte'
  import ForkDialog from './ForkDialog.svelte'
  import { duck, duckActions } from '../../stores/duck.svelte'
  import * as toast from '../../stores/toast.svelte'
  import { safePeerColor } from '@/lib/editor/collaboration'
  import { sessionPhase } from '@/lib/sessionPhase'
  import { PAGE_ROUTES } from '@/lib/routes'
  import type { SharedCapability } from '@/services/collaboration/capabilities/capability'

  /*
   * Live sessions as a page (§23, §44).
   *
   * Hosting, joining and the running session used to hide behind a rail menu,
   * a sheet and a popover. One page says what a session is before asking for
   * anything, and keeps everything about a running one in the same place.
   * Leaving the page never ends a session: the rail icon shows it from
   * anywhere.
   */
  const uid = $props.id()
  const session = $derived(duck((s) => s.session))
  const phase = $derived(sessionPhase(session))
  const isHost = $derived(session.role === 'host')
  // A host is in a session from the moment an invite exists, a guest from the
  // moment there is a code to send back.
  const hosting = $derived(isHost && Boolean(session.inviteUrl) && phase !== 'dropped')
  const guesting = $derived(
    session.role === 'guest' && phase !== 'dropped' && (phase !== 'idle' || Boolean(session.answerCode)),
  )
  const sessionTitle = $derived(session.sessionName || 'Live session')

  let forking = $state<SharedCapability | null>(null)
  let copied = $state(false)

  const FACTS = [
    {
      icon: Eye,
      title: 'They see your workspace',
      text: 'Tabs, editors and dashboards, with a cursor for each person. Your data only if you share it.',
    },
    {
      icon: Cpu,
      title: 'Queries run in your browser',
      text: 'What a guest runs on shared tables executes here, read-only, and the result streams straight to them.',
    },
    {
      icon: Unplug,
      title: 'No server in between',
      text: 'The two browsers connect directly. The invite and the reply travel by hand, over a channel you already trust.',
    },
  ]

  async function end() {
    await duckActions().endLiveSession()
  }

  async function copyAnswer() {
    try {
      await navigator.clipboard.writeText(session.answerCode ?? '')
      copied = true
      setTimeout(() => (copied = false), 1500)
      toast.success('Copied. Send this back to the host')
    } catch {
      toast.error('Could not copy. Select the text and copy it manually')
    }
  }
</script>

{#snippet sessionDetails()}
  <Panel title={sessionTitle} description={isHost ? "You're hosting" : `Hosted by ${session.hostName}`}>
    <div class="flex flex-col gap-4">
      <section class="flex flex-col gap-1" aria-label="Participants">
        <p class="text-[11px] font-medium uppercase tracking-wide text-fg-3">Participants</p>
        {#if session.participants.length === 0}
          <p class="text-xs text-fg-3">{isHost ? 'Waiting for someone to join...' : 'Connecting to the session...'}</p>
        {:else}
          {#each session.participants as person (person.peerId)}
            <div class="flex h-7 items-center gap-2 text-[13px] text-fg">
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
                  title="Remove from the session"
                  aria-label="Remove {person.displayName} from the session"
                >
                  <UserMinus size={13} />
                </Button>
              {/if}
            </div>
          {/each}
        {/if}
      </section>

      <section class="flex flex-col gap-1" aria-label="Shared data">
        <p class="text-[11px] font-medium uppercase tracking-wide text-fg-3">Shared data</p>
        {#if session.sharedCapabilities.length === 0}
          <p class="text-xs text-fg-3">
            {isHost ? 'Nothing. Guests see the workspace and cannot query your data.' : 'The host has not shared any data.'}
          </p>
        {/if}
        {#each session.sharedCapabilities as capability (capability.id)}
          <div class="flex items-center justify-between gap-2">
            <div class="min-w-0">
              <p class="truncate text-[13px] text-fg">{capability.name}</p>
              <p class="text-xs text-fg-3">Read-only</p>
            </div>
            {#if session.role === 'guest'}
              <Button size="xs" variant="outline" onclick={() => (forking = capability)} aria-label="Fork {capability.name}">
                <GitFork size={13} />
                Fork
              </Button>
            {:else if isHost}
              <Button
                size="xs"
                variant="ghost"
                onclick={() => duckActions().revokeCapability(capability.id)}
                aria-label="Withdraw access to {capability.name}"
              >
                <X size={13} />
                Withdraw
              </Button>
            {/if}
          </div>
        {/each}
      </section>
    </div>
  </Panel>
{/snippet}

<PageHeader title={PAGE_ROUTES.live.label} subtitle={PAGE_ROUTES.live.description}>
  {#snippet meta()}
    {#if phase === 'connected'}
      <Badge tone="success" dot>Live</Badge>
    {:else if phase === 'waiting'}
      <Badge tone="warning" dot>Waiting</Badge>
    {:else if phase === 'dropped'}
      <Badge tone="danger" dot>Dropped</Badge>
    {/if}
  {/snippet}
  {#snippet actions()}
    {#if hosting || guesting}
      <Button size="sm" variant="danger" onclick={end}>{isHost ? 'End session' : 'Leave'}</Button>
    {/if}
  {/snippet}
</PageHeader>

<PageBody>
  <div class="max-w-5xl">
    {#if !session.isWebRtcSupported}
      <Panel title="Live sharing isn't available">
        <p class="text-[13px] text-fg-2">
          This browser doesn't support the peer connections a live session needs. Everything else in Duck-UI works
          normally, and you can still share a snapshot link.
        </p>
        <p class="mt-2 text-xs text-fg-3">Try a current version of Chrome, Edge, Firefox or Safari.</p>
      </Panel>
    {:else if phase === 'dropped'}
      <Panel title="The live session dropped">
        <p class="max-w-[64ch] text-[13px] text-fg-2">
          Your workspace, results and any forked tables are untouched. They live in this browser. To reconnect,
          {session.role === 'guest' ? 'ask the host for a fresh invite' : 'send a fresh invite'}; rejoining brings the
          shared workspace back where it was.
        </p>
        {#if session.error}
          <p class="mt-2 text-xs text-danger" role="alert">{session.error}</p>
        {/if}
        <!-- Ending clears what is left of the old session, and the page goes
             back to its two cards: host a new one, or paste a new code. -->
        <Button size="sm" class="mt-4" onclick={end}>
          {session.role === 'guest' ? 'Rejoin with a new code' : 'Start a new session'}
        </Button>
      </Panel>
    {:else if hosting}
      <div class="grid items-start gap-4 lg:grid-cols-2">
        <Panel title="Invite" description="Each invite works once, for one person.">
          <HostSession />
        </Panel>
        {@render sessionDetails()}
      </div>
    {:else if guesting}
      <div class="grid items-start gap-4 lg:grid-cols-2">
        {@render sessionDetails()}
        {#if phase !== 'connected' && session.answerCode}
          <Panel title="Finish joining" description="The host pastes this code to connect the two browsers.">
            <FormField label="Send this code back to {session.hostName}" for="{uid}-answer" controlWidth="full">
              <div class="flex gap-2">
                <Input id="{uid}-answer" readonly mono class="text-xs" value={session.answerCode ?? ''} />
                <Button icon variant="outline" onclick={copyAnswer} aria-label="Copy connection code">
                  {#if copied}<Check size={14} />{:else}<Copy size={14} />{/if}
                </Button>
              </div>
            </FormField>
          </Panel>
        {/if}
      </div>
    {:else}
      <ul class="mb-5 grid gap-4 sm:grid-cols-3">
        {#each FACTS as fact (fact.title)}
          <li class="flex gap-2.5">
            <fact.icon size={15} strokeWidth={1.75} class="mt-0.5 shrink-0 text-accent" />
            <div>
              <p class="text-[13px] font-medium text-fg">{fact.title}</p>
              <p class="mt-0.5 text-xs leading-relaxed text-fg-3">{fact.text}</p>
            </div>
          </li>
        {/each}
      </ul>

      <div class="grid items-start gap-4 lg:grid-cols-2">
        <Panel title="Host a session" description="Invite someone into this workspace. You choose what data they can query.">
          <HostSession />
        </Panel>
        <Panel title="Join a session" description="Paste the link or the code someone sent you. Nothing runs until you confirm.">
          <JoinByCode />
        </Panel>
      </div>

      <a
        class="mt-5 inline-flex items-center gap-1.5 text-xs text-fg-3 hover:text-fg"
        href="https://docs.duckui.com/docs/live-sessions/"
        target="_blank"
        rel="noopener noreferrer"
      >
        How live sessions work
        <ExternalLink size={12} />
      </a>
    {/if}
  </div>
</PageBody>

{#if forking}
  <ForkDialog capability={forking} open onclose={() => (forking = null)} />
{/if}
