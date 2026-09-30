<script lang="ts">
  import { untrack } from 'svelte'
  import Modal from '../common/Modal.svelte'
  import Button from '../common/Button.svelte'
  import Input from '../common/Input.svelte'
  import Textarea from '../common/Textarea.svelte'
  import FormField from '../common/FormField.svelte'
  import { duck, duckActions } from '../../stores/duck.svelte'
  import { success, error as toastError } from '../../stores/toast.svelte'
  import { saveQuery, type SavedQuery } from '@/services/persistence/repositories/savedQueryRepository'

  interface Props {
    open: boolean
    onclose: () => void
    /** The SQL to store. */
    sql: string
    /** Prefills the name field, usually the tab title. */
    defaultTitle?: string
    onsaved?: (query: SavedQuery) => void
  }

  let { open, onclose, sql, defaultTitle = '', onsaved }: Props = $props()

  let name = $state('')
  let description = $state('')
  let saving = $state(false)
  let nameInput: HTMLInputElement | undefined = $state()

  const profileId = $derived(duck((s) => s.currentProfileId))
  const canSave = $derived(!!name.trim() && !!profileId)

  // Reset the form each time the dialog opens, not while the user types.
  $effect(() => {
    if (!open) return
    untrack(() => {
      name = defaultTitle
      description = ''
    })
    // After the modal's focus trap, which lands on the close button.
    const frame = requestAnimationFrame(() => {
      nameInput?.focus()
      nameInput?.select()
    })
    return () => cancelAnimationFrame(frame)
  })

  async function save(e?: SubmitEvent) {
    e?.preventDefault()
    if (!canSave || !profileId || saving) return
    saving = true
    try {
      const saved = await saveQuery(profileId, {
        name: name.trim(),
        sqlText: sql,
        description: description.trim() || undefined,
      })
      duckActions().bumpSavedQueriesVersion()
      success('Query saved')
      onsaved?.(saved)
      onclose()
    } catch {
      toastError('Failed to save query')
    } finally {
      saving = false
    }
  }
</script>

<Modal {open} title="Save query" size="sm" {onclose}>
  <form id="save-query-form" class="flex flex-col gap-4" onsubmit={save}>
    <FormField controlWidth="full" label="Name" for="query-name">
      <Input id="query-name" bind:ref={nameInput} bind:value={name} placeholder="Query name" />
    </FormField>
    <FormField controlWidth="full" label="Description (optional)" for="query-description">
      <Textarea id="query-description" bind:value={description} placeholder="What does this query do?" rows={2} />
    </FormField>
  </form>
  {#snippet footer()}
    <Button size="sm" variant="ghost" onclick={onclose} disabled={saving}>Cancel</Button>
    <Button size="sm" type="submit" form="save-query-form" disabled={!canSave} loading={saving}>Save</Button>
  {/snippet}
</Modal>
