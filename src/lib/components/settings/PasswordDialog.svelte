<script lang="ts">
  import type { Profile } from '@/store/types'
  import Modal from '../common/Modal.svelte'
  import Button from '../common/Button.svelte'
  import Input from '../common/Input.svelte'
  import FormField from '../common/FormField.svelte'
  import ProfileAvatar from '../profile/ProfileAvatar.svelte'

  interface Props {
    open: boolean
    profile: Profile
    /** Reject to show "Incorrect password" and keep the dialog open. */
    onsubmit: (password: string) => Promise<void>
    onclose: () => void
  }

  let { open, profile, onsubmit, onclose }: Props = $props()

  const FORM_ID = `unlock-form-${Math.random().toString(36).slice(2, 8)}`

  let password = $state('')
  let error = $state('')
  let loading = $state(false)

  async function submit(e: SubmitEvent) {
    e.preventDefault()
    if (!password.trim() || loading) return
    loading = true
    error = ''
    try {
      await onsubmit(password)
      password = ''
    } catch {
      error = 'Incorrect password'
    } finally {
      loading = false
    }
  }

  function close() {
    password = ''
    error = ''
    onclose()
  }
</script>

<Modal {open} title="Unlock Profile" description="Enter your password to unlock this profile" size="sm" onclose={close}>
  <form id={FORM_ID} class="flex flex-col gap-4" onsubmit={submit}>
    <div class="flex flex-col items-center gap-2">
      <ProfileAvatar avatarEmoji={profile.avatarEmoji} size="xl" />
      <span class="text-[13px] font-medium text-fg">{profile.name}</span>
    </div>
    <FormField controlWidth="full" label="Password" for="settings-unlock-password" {error}>
      <Input
        id="settings-unlock-password"
        type="password"
        bind:value={password}
        placeholder="Enter password"
        invalid={!!error}
        autocomplete="current-password"
      />
    </FormField>
  </form>
  {#snippet footer()}
    <Button size="sm" variant="ghost" onclick={close} disabled={loading}>Cancel</Button>
    <Button size="sm" type="submit" form={FORM_ID} disabled={!password.trim()} {loading}>Unlock</Button>
  {/snippet}
</Modal>
