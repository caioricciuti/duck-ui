<script lang="ts">
  import { untrack } from 'svelte'
  import { Info, Plus, RefreshCw, Trash2 } from 'lucide-svelte'
  import type { QuackAttachmentState } from '@/store/types'
  import Badge from '../common/Badge.svelte'
  import Button from '../common/Button.svelte'
  import ConfirmDialog from '../common/ConfirmDialog.svelte'
  import FormField from '../common/FormField.svelte'
  import Input from '../common/Input.svelte'
  import Panel from '../common/Panel.svelte'
  import Sheet from '../common/Sheet.svelte'
  import { duck, duckActions } from '../../stores/duck.svelte'

  const FORM_ID = 'quack-attach-form'
  const SERVER_SNIPPET = `INSTALL quack;
LOAD quack;
CALL quack_serve('quack:localhost', token := 'your-token');`

  interface Props {
    /** The attach sheet is open. Bindable, so "Add connection" can open it. */
    attaching?: boolean
  }

  let { attaching = $bindable(false) }: Props = $props()

  const attachments = $derived(duck((s) => s.quackAttachments))
  const engineReady = $derived(duck((s) => s.isInitialized))

  let alias = $state('')
  let host = $state('')
  let token = $state('')
  let error = $state('')
  let busy = $state(false)
  let pending = $state<string | null>(null)
  let detachTarget = $state<QuackAttachmentState | null>(null)

  // Fresh fields each time the sheet opens, whoever opened it.
  $effect(() => {
    if (!attaching) return
    untrack(() => {
      alias = ''
      host = 'localhost:9494'
      token = ''
      error = ''
    })
  })

  async function submit(e: SubmitEvent) {
    e.preventDefault()
    if (busy) return
    busy = true
    error = ''
    try {
      await duckActions().attachQuack({ alias, host, token })
      attaching = false
    } catch (err) {
      // Shown in the sheet so the values can be fixed rather than retyped.
      error = err instanceof Error ? err.message : String(err)
    } finally {
      busy = false
      token = attaching ? token : ''
    }
  }

  async function reconnect(name: string) {
    pending = name
    try {
      await duckActions().reconnectQuack(name)
    } finally {
      pending = null
    }
  }

  async function confirmDetach() {
    const target = detachTarget
    detachTarget = null
    if (!target) return
    pending = target.alias
    try {
      await duckActions().detachQuack(target.alias)
    } finally {
      pending = null
    }
  }
</script>

<Panel
  title="Remote DuckDB (Quack)"
  description="Databases on a DuckDB server, attached next to your local data so one query can join both"
  padding="none"
  class="mt-4"
>
  {#snippet actions()}
    <Button size="sm" variant="outline" disabled={!engineReady} onclick={() => (attaching = true)}>
      <Plus size={14} />
      Attach
    </Button>
  {/snippet}

  {#if attachments.length === 0}
    <p class="px-4 py-6 text-sm text-fg-3">
      Nothing attached. Start a server with <code class="font-mono text-fg-2">quack_serve</code> and attach it here.
    </p>
  {:else}
    <div class="ds-table-wrap pt-3">
      <table class="ds-table">
        <thead>
          <tr class="ds-table-head-row">
            <th class="ds-table-th">Database</th>
            <th class="ds-table-th">Host</th>
            <th class="ds-table-th">Status</th>
            <th class="ds-table-th-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each attachments as attachment (attachment.alias)}
            <tr class="ds-table-row">
              <td class="ds-td-strong">{attachment.alias}</td>
              <td class="ds-td-mono">quack:{attachment.host}</td>
              <td class="ds-td">
                {#if attachment.status === 'attached'}
                  <Badge tone="success" dot>Attached</Badge>
                {:else}
                  <Badge tone="danger" dot title={attachment.error}>Failed</Badge>
                {/if}
              </td>
              <td class="ds-td">
                <div class="flex items-center justify-end gap-1.5">
                  <Button
                    icon
                    size="sm"
                    variant="ghost"
                    disabled={pending !== null}
                    aria-label={`Reconnect ${attachment.alias}`}
                    onclick={() => reconnect(attachment.alias)}
                  >
                    <RefreshCw size={14} class={pending === attachment.alias ? 'animate-spin' : ''} />
                  </Button>
                  <Button
                    icon
                    size="sm"
                    variant="ghost"
                    disabled={pending !== null}
                    aria-label={`Detach ${attachment.alias}`}
                    onclick={() => (detachTarget = attachment)}
                  >
                    <Trash2 size={14} class="text-danger" />
                  </Button>
                </div>
              </td>
            </tr>
            {#if attachment.status === 'failed' && attachment.error}
              <tr>
                <td colspan="4" class="px-4 pb-3 text-xs break-words text-danger">{attachment.error}</td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</Panel>

<Sheet
  open={attaching}
  size="sm"
  title="Attach remote DuckDB"
  description="Over Quack, DuckDB's client-server protocol. The token is stored encrypted in this browser."
  onclose={() => (attaching = false)}
>
  <form id={FORM_ID} class="flex flex-col gap-4" novalidate onsubmit={submit}>
    <div class="flex gap-2 rounded-md bg-surface-2 p-3 text-xs text-fg-2">
      <Info size={14} class="mt-0.5 shrink-0 text-fg-3" />
      <div class="min-w-0 flex-1 space-y-1">
        <p>On the server, with DuckDB 1.5.2 or later:</p>
        <pre class="overflow-x-auto rounded-sm bg-canvas px-2 py-1 font-mono text-[10px] leading-relaxed text-fg">{SERVER_SNIPPET}</pre>
        <p>Anything beyond localhost needs HTTPS in front of it, for example nginx or Caddy.</p>
      </div>
    </div>

    <FormField controlWidth="full" label="Name" for="quack-alias" hint="How the database is called in SQL and the explorer">
      <Input id="quack-alias" bind:value={alias} placeholder="remote" autocomplete="off" spellcheck={false} />
    </FormField>

    <FormField controlWidth="full" label="Host" for="quack-host" hint="host or host:port, as in quack:host:port">
      <Input id="quack-host" bind:value={host} placeholder="localhost:9494" autocomplete="off" spellcheck={false} />
    </FormField>

    <FormField controlWidth="full" label="Token" for="quack-token">
      <Input id="quack-token" type="password" bind:value={token} autocomplete="off" />
    </FormField>

    {#if error}
      <p role="alert" class="text-xs break-words text-danger">{error}</p>
    {/if}
  </form>

  {#snippet footer()}
    <Button size="sm" variant="outline" onclick={() => (attaching = false)} disabled={busy}>Cancel</Button>
    <Button size="sm" type="submit" form={FORM_ID} disabled={busy}>{busy ? 'Attaching...' : 'Attach'}</Button>
  {/snippet}
</Sheet>

<ConfirmDialog
  open={detachTarget !== null}
  title="Detach database"
  description={detachTarget
    ? `Detach "${detachTarget.alias}" and forget its token? The data stays on the server.`
    : ''}
  confirmLabel="Detach"
  destructive
  onconfirm={confirmDetach}
  oncancel={() => (detachTarget = null)}
/>
