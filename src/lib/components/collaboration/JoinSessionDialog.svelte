<script lang="ts">
  import { onMount } from 'svelte'
  import { Check, Copy, Lock } from 'lucide-svelte'
  import Sheet from '../common/Sheet.svelte'
  import Button from '../common/Button.svelte'
  import Input from '../common/Input.svelte'
  import FormField from '../common/FormField.svelte'
  import Spinner from '../common/Spinner.svelte'
  import { duck, duckActions } from '../../stores/duck.svelte'
  import * as toast from '../../stores/toast.svelte'
  import {
    clearInviteHash,
    decodeInvite,
    subscribeToInvites,
    type ManualInvite,
  } from '@/services/collaboration/signaling/manualSignaling'

  /*
   * Guest flow (§45).
   *
   * Mounted once and driven by the URL. Nothing runs on arrival: opening an
   * invite shows what the session is and who is hosting it, and waits. No SQL
   * is executed, no local file is read, and no data access exists until the
   * host grants it after the connection is up.
   */
  const uid = $props.id()
  const session = $derived(duck((s) => s.session))

  let invite = $state<ManualInvite | null>(null)
  let inviteCode = $state<string | null>(null)
  let dismissed = $state(false)
  let copied = $state(false)

  const isConnecting = $derived(session.status === 'connecting')
  // The code appears the moment it exists. Waiting for "connected" would mean
  // waiting for the host to paste a code the guest has not been shown yet.
  const hasCode = $derived(Boolean(session.answerCode) && session.role === 'guest')
  const isConnected = $derived(session.status === 'connected' && session.role === 'guest')
  const host = $derived(invite?.hostDisplayName ?? '')

  onMount(() => {
    let cancelled = false

    // Subscribed, not read once: pasting an invite while already on the page
    // changes only the fragment, which does not reload anything.
    const unsubscribe = subscribeToInvites((encoded) => {
      void (async () => {
        const decoded = await decodeInvite<ManualInvite>(encoded)
        if (cancelled) return
        if (!decoded || !('offer' in decoded)) {
          toast.error("That invite link isn't readable")
          clearInviteHash()
          return
        }
        invite = decoded
        // A different invite is a new offer to consider, even if the last
        // one was dismissed.
        if (inviteCode !== encoded) dismissed = false
        inviteCode = encoded
      })()
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  })

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value)
      copied = true
      setTimeout(() => (copied = false), 1500)
      toast.success('Copied. Send this back to the host')
    } catch {
      toast.error('Could not copy. Select the text and copy it manually')
    }
  }

  function hide() {
    clearInviteHash()
    dismissed = true
  }

  async function decline() {
    await duckActions().endLiveSession()
    hide()
  }

  // Once a code exists the guest is in, or about to be. Closing the sheet
  // from its X, the backdrop or Escape must then only hide it, never leave.
  function close() {
    if (hasCode) hide()
    else void decline()
  }
</script>

{#if invite}
  <Sheet open={!dismissed} onclose={close} title="Join “{invite.sessionName}”" description="Hosted by {host}">
    {#if !hasCode}
      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-2 rounded-md border border-edge-subtle p-3 text-[13px] text-fg">
          <p>This session can share workspace state with your browser.</p>
          <div class="flex items-start gap-2 text-xs text-fg-3">
            <Lock size={14} class="mt-0.5 shrink-0 text-success" />
            <span>
              Your own data stays private. Nothing runs and no file is read until you join, and any shared data
              appears only if {host} grants it.
            </span>
          </div>
        </div>

        {#if session.error}
          <p class="text-xs text-danger" role="alert">{session.error}</p>
        {/if}
      </div>
    {:else}
      <div class="flex flex-col gap-4">
        <FormField label="Send this code back to {host}" for="{uid}-answer" controlWidth="full">
          <div class="flex gap-2">
            <Input id="{uid}-answer" readonly mono class="text-xs" value={session.answerCode ?? ''} />
            <Button icon variant="outline" onclick={() => copy(session.answerCode ?? '')} aria-label="Copy connection code">
              {#if copied}<Check size={14} />{:else}<Copy size={14} />{/if}
            </Button>
          </div>
        </FormField>

        {#if isConnected}
          <p class="flex items-center gap-1.5 text-xs text-success">
            <Check size={14} />
            Connected to {host}
          </p>
        {:else}
          <p class="flex items-center gap-1.5 text-xs text-fg-3">
            <Spinner size="sm" class="h-3.5 w-3.5" />
            Waiting for {host} to paste it...
          </p>
        {/if}

        {#if session.sharedCapabilities.length > 0}
          <div class="rounded-md border border-success/40 bg-success-soft p-3 text-[13px] text-fg">
            <p class="font-medium">Shared data available</p>
            <ul class="mt-1 flex flex-col gap-0.5 text-xs">
              {#each session.sharedCapabilities as capability (capability.id)}
                <li>
                  {capability.name} · read-only{capability.policy.maxResultRows
                    ? ` · up to ${capability.policy.maxResultRows.toLocaleString()} rows`
                    : ''}
                </li>
              {/each}
            </ul>
          </div>
        {/if}

        {#if session.error}
          <p class="text-xs text-danger" role="alert">{session.error}</p>
        {/if}
      </div>
    {/if}

    {#snippet footer()}
      {#if !hasCode}
        <Button variant="ghost" onclick={decline}>Not now</Button>
        <Button onclick={() => inviteCode && duckActions().joinLiveSession(inviteCode)} loading={isConnecting}>Join</Button>
      {:else}
        <Button variant="outline" onclick={hide}>{isConnected ? 'Open workspace' : 'Hide'}</Button>
      {/if}
    {/snippet}
  </Sheet>
{/if}
