<script lang="ts">
  import { Check, Copy, ShieldCheck, UserPlus, Waypoints } from 'lucide-svelte'
  import Sheet from '../common/Sheet.svelte'
  import Button from '../common/Button.svelte'
  import Input from '../common/Input.svelte'
  import Textarea from '../common/Textarea.svelte'
  import FormField from '../common/FormField.svelte'
  import { duck, duckActions } from '../../stores/duck.svelte'
  import * as toast from '../../stores/toast.svelte'
  import type { ShareSelection } from '@/services/collaboration/liveSession'
  import { isTurnConfigured, verifyTurnRelay, type TurnCheckResult } from '@/services/collaboration/signaling/client'

  interface Props {
    open: boolean
    onclose: () => void
  }

  /*
   * Host flow for "Share Live" (§44).
   *
   * Deliberately explicit about data access. The default is NO data access:
   * sharing a workspace and sharing your database are different decisions, and
   * conflating them is how people accidentally hand over more than they meant.
   *
   * Closing the sheet never ends a live session. The session panel stays
   * reachable from the indicator.
   */
  let { open, onclose }: Props = $props()

  type ShareMode = 'none' | 'all' | 'selected'

  const MODES: { id: ShareMode; label: string; hint: string }[] = [
    { id: 'none', label: 'No data access', hint: 'They see the workspace. They cannot query your data.' },
    {
      id: 'all',
      label: 'All data',
      hint: 'Every table on this connection, including ones you add while the session is running. Read-only, copied into an isolated engine.',
    },
    {
      id: 'selected',
      label: 'Share selected tables',
      hint: 'Read-only. Copied into an isolated engine, so the rest of your data stays out of reach.',
    },
  ]

  const uid = $props.id()
  const session = $derived(duck((s) => s.session))
  const profileName = $derived(duck((s) => s.currentProfile?.name))

  let sessionNameDraft = $state<string | null>(null)
  let tables = $state<ShareSelection[]>([])
  let selected = $state<ReadonlySet<string>>(new Set())
  let shareMode = $state<ShareMode>('none')
  let rowLimit = $state(100_000)
  let guestCode = $state('')
  let copied = $state(false)
  let turnCheck = $state<TurnCheckResult | 'checking' | null>(null)

  const sessionName = $derived(sessionNameDraft ?? `${profileName ?? 'My'} session`)
  const isStarting = $derived(session.status === 'connecting')
  const hasInvite = $derived(Boolean(session.inviteUrl))
  const isConnected = $derived(session.status === 'connected')
  const people = $derived(session.participants.length)

  $effect(() => {
    if (!open) return
    let cancelled = false
    void duckActions()
      .listShareableTables()
      .then((list) => {
        if (!cancelled) tables = list
      })
    return () => {
      cancelled = true
    }
  })

  function toggleTable(name: string) {
    const next = new Set(selected)
    if (!next.delete(name)) next.add(name)
    selected = next
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value)
      copied = true
      setTimeout(() => (copied = false), 1500)
      toast.success('Copied')
    } catch {
      toast.error('Could not copy. Select the text and copy it manually')
    }
  }

  async function start() {
    const shared = shareMode === 'selected' ? tables.filter((t) => selected.has(t.exposedName)) : []
    await duckActions().startLiveSession({
      sessionName: sessionName.trim() || 'Live session',
      shared,
      shareAll: shareMode === 'all',
      maxResultRows: rowLimit,
    })
  }

  async function connect() {
    await duckActions().acceptGuestCode(guestCode)
    guestCode = ''
  }

  async function end() {
    await duckActions().endLiveSession()
    onclose()
  }

  async function testRelay() {
    turnCheck = 'checking'
    turnCheck = await verifyTurnRelay()
  }
</script>

{#snippet rowLimitField(id: string)}
  <FormField label="Result limit (rows)" for={id} controlWidth="sm">
    <Input
      {id}
      type="number"
      size="sm"
      min={100}
      step={1000}
      value={rowLimit}
      oninput={(e) => (rowLimit = Number(e.currentTarget.value))}
    />
  </FormField>
{/snippet}

{#if !session.isWebRtcSupported}
  <Sheet
    {open}
    {onclose}
    title="Live sharing isn't available"
    description="This browser doesn't support the peer connections a live session needs. Everything else in Duck-UI works normally, and you can still share a snapshot link."
  >
    <p class="text-xs text-fg-3">Try a current version of Chrome, Edge, Firefox or Safari.</p>
  </Sheet>
{:else}
  <Sheet
    {open}
    {onclose}
    title="Share Live"
    description="Someone else joins your workspace from their own browser. Queries they run execute here, in your browser, and results stream straight to them."
  >
    {#if !hasInvite}
      <div class="flex flex-col gap-5">
        <FormField label="Session name" for="{uid}-name" controlWidth="full">
          <Input
            id="{uid}-name"
            value={sessionName}
            placeholder="Q3 analysis"
            oninput={(e) => (sessionNameDraft = e.currentTarget.value)}
          />
        </FormField>

        <fieldset class="flex flex-col gap-3">
          <legend class="mb-2 text-xs font-medium text-fg-2">Data access</legend>
          {#each MODES as mode (mode.id)}
            <label class="flex cursor-pointer items-start gap-2">
              <input
                type="radio"
                class="ds-radio mt-0.5"
                name="{uid}-mode"
                value={mode.id}
                checked={shareMode === mode.id}
                onchange={() => (shareMode = mode.id)}
              />
              <span class="grid gap-0.5">
                <span class="text-[13px] font-medium leading-none text-fg">{mode.label}</span>
                <span class="text-xs text-fg-3">{mode.hint}</span>
              </span>
            </label>
          {/each}
        </fieldset>

        {#if shareMode === 'all'}
          <div class="flex flex-col gap-2 rounded-md border border-edge-subtle p-3">
            {@render rowLimitField(`${uid}-limit-all`)}
            <p class="text-xs text-fg-3">
              {#if tables.length === 0}
                Nothing here yet. Tables you create or import will be shared as they appear.
              {:else}
                {tables.length} {tables.length === 1 ? 'table' : 'tables'} now, plus whatever you add later.
              {/if}
            </p>
          </div>
        {/if}

        {#if shareMode === 'selected'}
          <div class="flex flex-col gap-3 rounded-md border border-edge-subtle p-3">
            <p class="text-[11px] font-medium uppercase tracking-wide text-fg-3">Tables</p>
            <div class="flex max-h-40 flex-col gap-2 overflow-y-auto pr-3">
              {#if tables.length === 0}
                <p class="text-xs text-fg-3">No tables to share on this connection.</p>
              {/if}
              {#each tables as table (table.qualifiedName)}
                <label class="ds-checkbox-label">
                  <input
                    type="checkbox"
                    class="ds-checkbox"
                    checked={selected.has(table.exposedName)}
                    onchange={() => toggleTable(table.exposedName)}
                  />
                  <span class="font-mono text-xs">{table.exposedName}</span>
                </label>
              {/each}
            </div>
            {@render rowLimitField(`${uid}-limit`)}
          </div>
        {/if}

        <div class="flex items-start gap-2 rounded-md bg-surface-2 p-3 text-xs text-fg-3">
          <ShieldCheck size={14} class="mt-0.5 shrink-0 text-success" />
          <span>Database passwords and API keys never leave this browser, whatever you share here.</span>
        </div>

        {#if isTurnConfigured()}
          <div class="flex items-start gap-2 text-xs text-fg-3">
            <Waypoints size={14} class="mt-0.5 shrink-0" />
            <span class="flex-1">
              {#if turnCheck === null}
                This deployment has a TURN relay for strict networks.
                <button type="button" class="underline underline-offset-2 hover:text-fg" onclick={testRelay}>Test it</button>
              {:else if turnCheck === 'checking'}
                Asking the relay for a candidate...
              {:else}
                <span class={turnCheck.reachable ? 'text-success' : 'text-danger'}>{turnCheck.detail}</span>
              {/if}
            </span>
          </div>
        {/if}
      </div>
    {:else}
      <div class="flex flex-col gap-5">
        <FormField label="1. Send them this link" for="{uid}-invite" controlWidth="full">
          <div class="flex gap-2">
            <Input id="{uid}-invite" readonly mono class="text-xs" value={session.inviteUrl ?? ''} />
            <Button icon variant="outline" onclick={() => copy(session.inviteUrl ?? '')} aria-label="Copy invite link">
              {#if copied}<Check size={14} />{:else}<Copy size={14} />{/if}
            </Button>
          </div>
        </FormField>

        <FormField
          label="2. Paste the code they send back"
          for="{uid}-code"
          controlWidth="full"
          hint="Two links, no server. Nothing about this session touches the internet beyond your browsers finding each other."
        >
          <Textarea id="{uid}-code" mono rows={4} bind:value={guestCode} placeholder="Paste their connection code here" />
        </FormField>
        <Button class="w-full" onclick={connect} disabled={!guestCode.trim()} loading={isStarting}>Connect</Button>

        {#if isConnected}
          <div class="flex flex-col items-start gap-2 rounded-md border border-success/40 bg-success-soft p-3 text-[13px] text-fg">
            <p>Connected · {people} {people === 1 ? 'person' : 'people'} in this session</p>
            <p class="text-xs text-fg-3">Each invite works once. To add someone else, create a new one.</p>
            <Button size="sm" variant="outline" onclick={() => duckActions().inviteAnotherGuest()} disabled={isStarting}>
              <UserPlus size={13} />
              Invite someone else
            </Button>
          </div>
        {/if}

        {#if session.error}
          <p class="text-xs text-danger" role="alert">{session.error}</p>
        {/if}
      </div>
    {/if}

    {#snippet footer()}
      {#if !hasInvite}
        <Button onclick={start} loading={isStarting} disabled={shareMode === 'selected' && selected.size === 0}>
          Create session
        </Button>
      {:else}
        <Button variant="outline" onclick={end}>End session</Button>
      {/if}
    {/snippet}
  </Sheet>
{/if}
