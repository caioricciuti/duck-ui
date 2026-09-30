<script lang="ts">
  import { untrack } from 'svelte'
  import { Info } from 'lucide-svelte'
  import Sheet from '../common/Sheet.svelte'
  import Button from '../common/Button.svelte'
  import Input from '../common/Input.svelte'
  import Select from '../common/Select.svelte'
  import FormField from '../common/FormField.svelte'
  import { duck } from '../../stores/duck.svelte'
  import {
    defaultConnectionDraft,
    draftFromValues,
    validateConnectionDraft,
    type ConnectionDraft,
    type ConnectionField,
    type ConnectionFormValues,
  } from './connectionSchema'

  interface Props {
    open: boolean
    editMode?: boolean
    initialValues?: ConnectionFormValues
    onsubmit: (values: ConnectionFormValues) => Promise<void>
    onclose: () => void
  }

  let { open, editMode = false, initialValues, onsubmit, onclose }: Props = $props()

  const FORM_ID = `connection-form-${Math.random().toString(36).slice(2, 8)}`
  const HTTP_SERVER_SNIPPET = `INSTALL httpserver FROM community;
LOAD httpserver;
SELECT httpserve_start('0.0.0.0', 9999, '');`

  const scopeOptions = [
    { value: 'External', label: 'DuckDB HTTP Server' },
    { value: 'OPFS', label: 'Browser Storage (OPFS)' },
  ]
  const authOptions = [
    { value: 'none', label: 'None' },
    { value: 'password', label: 'Username/Password' },
    { value: 'api_key', label: 'API Key' },
  ]

  let draft = $state<ConnectionDraft>(defaultConnectionDraft())
  let touched = $state<Partial<Record<ConnectionField, boolean>>>({})
  let submitted = $state(false)
  let submitting = $state(false)

  const connecting = $derived(duck((s) => s.isLoadingExternalConnection))
  const busy = $derived(connecting || submitting)
  const validation = $derived(validateConnectionDraft(draft))

  // Seed the form each time the sheet opens, so an edit shows the connection
  // being edited and an add starts from the defaults again.
  $effect(() => {
    if (!open) return
    untrack(() => {
      draft = initialValues ? draftFromValues(initialValues) : defaultConnectionDraft()
      touched = {}
      submitted = false
    })
  })

  function errorFor(field: ConnectionField): string {
    if (validation.ok) return ''
    if (!submitted && !touched[field]) return ''
    return validation.errors[field] ?? ''
  }

  function touch(field: ConnectionField) {
    touched[field] = true
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault()
    submitted = true
    if (!validation.ok || busy) return
    submitting = true
    try {
      await onsubmit(validation.values)
      onclose()
    } catch {
      // The store already reported the failure. Keep the sheet open so the
      // values can be corrected instead of typed again.
    } finally {
      submitting = false
    }
  }
</script>

<Sheet
  {open}
  size="sm"
  title={editMode ? 'Edit Connection' : 'Add New Connection'}
  description={editMode ? 'Modify existing connection details.' : 'Connect to a DuckDB instance or browser storage.'}
  {onclose}
>
  <form id={FORM_ID} class="flex flex-col gap-4" novalidate onsubmit={submit}>
    <FormField controlWidth="full" label="Connection Name" for="connection-name" error={errorFor('name')}>
      <Input
        id="connection-name"
        bind:value={draft.name}
        placeholder="My Database"
        invalid={!!errorFor('name')}
        autocomplete="off"
        oninput={() => touch('name')}
      />
    </FormField>

    <FormField controlWidth="full" label="Connection Type" for="connection-scope">
      <Select id="connection-scope" bind:value={draft.scope} options={scopeOptions} />
    </FormField>

    {#if draft.scope === 'External'}
      <div class="flex gap-2 rounded-md bg-surface-2 p-3 text-xs text-fg-2">
        <Info size={14} class="mt-0.5 shrink-0 text-fg-3" />
        <div class="min-w-0 flex-1 space-y-1">
          <p>Start HTTP server in DuckDB:</p>
          <pre class="overflow-x-auto rounded-sm bg-canvas px-2 py-1 font-mono text-[10px] leading-relaxed text-fg">{HTTP_SERVER_SNIPPET}</pre>
        </div>
      </div>

      <FormField
        controlWidth="full"
        label="Host URL"
        for="connection-host"
        hint="Full URL including protocol (http/https)"
        error={errorFor('host')}
      >
        <Input
          id="connection-host"
          type="url"
          bind:value={draft.host}
          placeholder="http://localhost:9999"
          invalid={!!errorFor('host')}
          autocomplete="off"
          spellcheck={false}
          oninput={() => touch('host')}
        />
      </FormField>

      <FormField controlWidth="full" label="Database (optional)" for="connection-database">
        <Input id="connection-database" bind:value={draft.database} placeholder="my_database" autocomplete="off" spellcheck={false} />
      </FormField>

      <FormField controlWidth="full" label="Authentication" for="connection-auth">
        <Select id="connection-auth" bind:value={draft.authMode} options={authOptions} />
      </FormField>

      {#if draft.authMode === 'password'}
        <div class="grid grid-cols-2 gap-3">
          <FormField controlWidth="full" label="Username" for="connection-user">
            <Input id="connection-user" bind:value={draft.user} placeholder="user" autocomplete="off" spellcheck={false} />
          </FormField>
          <FormField controlWidth="full" label="Password" for="connection-password">
            <Input id="connection-password" type="password" bind:value={draft.password} placeholder="********" autocomplete="off" />
          </FormField>
        </div>
      {/if}

      {#if draft.authMode === 'api_key'}
        <FormField controlWidth="full" label="API Key" for="connection-api-key">
          <Input id="connection-api-key" type="password" bind:value={draft.apiKey} placeholder="Enter API key" autocomplete="off" />
        </FormField>
      {/if}
    {:else}
      <div class="flex gap-2 rounded-md bg-surface-2 p-3 text-xs text-fg-2">
        <Info size={14} class="mt-0.5 shrink-0 text-fg-3" />
        <p>Data persists in your browser across sessions.</p>
      </div>

      <FormField
        controlWidth="full"
        label="Database File"
        for="connection-path"
        hint="Filename for your database (e.g., data.db)"
        error={errorFor('path')}
      >
        <Input
          id="connection-path"
          bind:value={draft.path}
          placeholder="my_data.db"
          invalid={!!errorFor('path')}
          autocomplete="off"
          spellcheck={false}
          oninput={() => touch('path')}
        />
      </FormField>
    {/if}
  </form>

  {#snippet footer()}
    <Button size="sm" variant="outline" onclick={onclose} disabled={busy}>Cancel</Button>
    <Button size="sm" type="submit" form={FORM_ID} disabled={busy}>
      {connecting ? 'Connecting...' : editMode ? 'Update' : 'Connect'}
    </Button>
  {/snippet}
</Sheet>
