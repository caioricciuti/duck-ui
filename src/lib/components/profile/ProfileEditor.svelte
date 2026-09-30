<script lang="ts">
  import { untrack } from 'svelte'
  import Button from '../common/Button.svelte'
  import Input from '../common/Input.svelte'
  import FormField from '../common/FormField.svelte'
  import ProfileAvatar from './ProfileAvatar.svelte'

  export interface ProfileValues {
    name: string
    avatarEmoji: string
    password?: string
  }

  interface Props {
    mode: 'create' | 'edit'
    initialValues?: { name: string; avatarEmoji: string }
    loading?: boolean
    onsave: (values: ProfileValues) => void
    oncancel?: () => void
  }

  let { mode, initialValues, loading = false, onsave, oncancel }: Props = $props()

  const AVATAR_OPTIONS = [
    'logo',
    '\u{1F986}', '\u{1F424}', '\u{1F985}', '\u{1F427}', '\u{1F989}', '\u{1F426}', '\u{1F99C}',
    '\u{1F438}', '\u{1F43B}', '\u{1F98A}', '\u{1F431}', '\u{1F436}', '\u{1F43C}', '\u{1F981}',
    '\u{1F428}', '\u{1F42F}', '\u{1F430}', '\u{1F419}', '\u{1F98B}', '\u{1F31F}',
  ]
  const MIN_PASSWORD_LENGTH = 4

  // Initial values seed the form once; later prop changes must not overwrite typing.
  let name = $state(untrack(() => initialValues?.name ?? ''))
  let avatarEmoji = $state(untrack(() => initialValues?.avatarEmoji ?? 'logo'))
  let passwordEnabled = $state(false)
  let password = $state('')
  let confirmPassword = $state('')

  const passwordTooShort = $derived(passwordEnabled && password.length > 0 && password.length < MIN_PASSWORD_LENGTH)
  const passwordMismatch = $derived(passwordEnabled && confirmPassword.length > 0 && password !== confirmPassword)
  const valid = $derived(
    name.trim().length > 0 &&
      (!passwordEnabled || (password.length >= MIN_PASSWORD_LENGTH && password === confirmPassword)),
  )

  function submit(e: SubmitEvent) {
    e.preventDefault()
    if (!valid) return
    onsave({
      name: name.trim(),
      avatarEmoji,
      ...(passwordEnabled && password ? { password } : {}),
    })
  }
</script>

<form class="flex flex-col gap-4 text-left" onsubmit={submit}>
  <FormField controlWidth="full" label="Avatar">
    <div class="flex flex-wrap gap-1" role="radiogroup" aria-label="Avatar">
      {#each AVATAR_OPTIONS as option}
        <button
          type="button"
          role="radio"
          aria-checked={avatarEmoji === option}
          aria-label={option === 'logo' ? 'Duck-UI logo' : option}
          class="inline-flex h-9 w-9 items-center justify-center rounded-md border transition-colors {avatarEmoji === option ? 'border-accent bg-accent-soft' : 'border-transparent hover:bg-hover'}"
          onclick={() => (avatarEmoji = option)}
        >
          <ProfileAvatar avatarEmoji={option} size="md" />
        </button>
      {/each}
    </div>
  </FormField>

  <FormField controlWidth="full" label="Name" for="profile-name">
    <Input id="profile-name" bind:value={name} placeholder="Your name" maxlength={50} required autocomplete="off" />
  </FormField>

  {#if mode === 'create'}
    <label class="ds-checkbox-label">
      <input type="checkbox" class="ds-checkbox" bind:checked={passwordEnabled} />
      Password protection
    </label>

    {#if passwordEnabled}
      <FormField controlWidth="full" label="Password" for="profile-password" error={passwordTooShort ? `At least ${MIN_PASSWORD_LENGTH} characters` : ''}>
        <Input id="profile-password" type="password" bind:value={password} invalid={passwordTooShort} autocomplete="new-password" />
      </FormField>
      <FormField controlWidth="full" label="Confirm password" for="profile-password-confirm" error={passwordMismatch ? 'Passwords do not match' : ''}>
        <Input id="profile-password-confirm" type="password" bind:value={confirmPassword} invalid={passwordMismatch} autocomplete="new-password" />
      </FormField>
      <p class="text-xs text-fg-3">
        The password encrypts saved credentials and API keys. It cannot be recovered if lost.
      </p>
    {/if}
  {/if}

  <div class="flex justify-end gap-2 pt-1">
    {#if oncancel}
      <Button variant="ghost" onclick={oncancel}>Cancel</Button>
    {/if}
    <Button type="submit" disabled={!valid} {loading}>
      {mode === 'create' ? 'Create profile' : 'Save'}
    </Button>
  </div>
</form>
