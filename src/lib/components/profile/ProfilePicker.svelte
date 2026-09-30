<script lang="ts">
  import { untrack } from 'svelte'
  import { Lock, UserPlus } from 'lucide-svelte'
  import type { Profile } from '@/store/types'
  import Modal from '../common/Modal.svelte'
  import Button from '../common/Button.svelte'
  import Input from '../common/Input.svelte'
  import FormField from '../common/FormField.svelte'
  import Spinner from '../common/Spinner.svelte'
  import ProfileAvatar from './ProfileAvatar.svelte'
  import ProfileEditor, { type ProfileValues } from './ProfileEditor.svelte'
  import { formatRelativeTime } from '../../utils/format'

  interface Props {
    profiles: Profile[]
    onselect: (profileId: string, password?: string) => Promise<void>
    oncreate: (name: string, password?: string, avatarEmoji?: string) => Promise<string>
  }

  let { profiles, onselect, oncreate }: Props = $props()

  let locked = $state<Profile | null>(null)
  let password = $state('')
  let passwordError = $state('')
  let creating = $state(untrack(() => profiles.length === 0))
  let busy = $state(false)
  let error = $state('')

  function message(e: unknown): string {
    return e instanceof Error ? e.message : 'Something went wrong'
  }

  async function select(profile: Profile) {
    error = ''
    if (profile.hasPassword) {
      locked = profile
      password = ''
      passwordError = ''
      return
    }
    busy = true
    try {
      await onselect(profile.id)
    } catch (e) {
      error = message(e)
    } finally {
      busy = false
    }
  }

  async function unlock(e: SubmitEvent) {
    e.preventDefault()
    if (!locked || !password) return
    busy = true
    passwordError = ''
    try {
      await onselect(locked.id, password)
      locked = null
    } catch (err) {
      passwordError = message(err)
    } finally {
      busy = false
    }
  }

  async function create(values: ProfileValues) {
    busy = true
    error = ''
    try {
      await oncreate(values.name, values.password, values.avatarEmoji)
      creating = false
    } catch (e) {
      error = message(e)
    } finally {
      busy = false
    }
  }
</script>

<div class="relative flex h-full items-center justify-center overflow-auto bg-canvas px-6 py-10">
  <div class="pointer-events-none absolute left-1/2 top-1/3 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/10 blur-[140px]"></div>

  <div class="relative w-full max-w-3xl text-center">
    <ProfileAvatar avatarEmoji="logo" size="xl" class="mx-auto" />
    <h1 class="mt-5 text-2xl font-semibold text-fg">
      {profiles.length === 0 ? 'Welcome to Duck-UI' : 'Choose profile'}
    </h1>
    <p class="mt-1 text-[13px] text-fg-3">
      {profiles.length === 0
        ? 'Create a profile to keep your queries, connections and settings in this browser.'
        : 'Everything stays in this browser.'}
    </p>

    {#if error}
      <p class="mt-4 text-[13px] text-danger" role="alert">{error}</p>
    {/if}

    {#if profiles.length > 0}
      <div class="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {#each profiles as profile (profile.id)}
          <button
            class="group flex flex-col items-center gap-2 rounded-lg border border-edge bg-surface px-4 py-5 transition-colors hover:border-accent disabled:pointer-events-none disabled:opacity-50"
            disabled={busy}
            onclick={() => select(profile)}
          >
            <ProfileAvatar avatarEmoji={profile.avatarEmoji} size="lg" />
            <span class="flex items-center gap-1.5 text-[13px] font-medium text-fg">
              {profile.name}
              {#if profile.hasPassword}<Lock size={12} class="text-fg-3" aria-label="Password protected" />{/if}
            </span>
            <span class="text-xs text-fg-3">Active {formatRelativeTime(profile.lastActive)}</span>
          </button>
        {/each}
      </div>

      <div class="mt-6 flex items-center justify-center gap-3">
        {#if busy}<Spinner size="sm" />{/if}
        <Button variant="outline" onclick={() => (creating = true)} disabled={busy}>
          <UserPlus size={14} />
          New profile
        </Button>
      </div>
    {:else}
      <div class="mt-8">
        <Button onclick={() => (creating = true)}>
          <UserPlus size={14} />
          Create profile
        </Button>
      </div>
    {/if}
  </div>
</div>

<Modal open={creating} title="New profile" size="sm" onclose={() => (creating = false)}>
  <ProfileEditor mode="create" loading={busy} onsave={create} oncancel={() => (creating = false)} />
</Modal>

<Modal
  open={locked !== null}
  title={locked ? `Unlock ${locked.name}` : ''}
  description="Enter the profile password."
  size="sm"
  onclose={() => (locked = null)}
>
  <form class="flex flex-col gap-4" onsubmit={unlock}>
    <FormField controlWidth="full" label="Password" for="unlock-password" error={passwordError}>
      <Input id="unlock-password" type="password" bind:value={password} invalid={!!passwordError} autocomplete="current-password" />
    </FormField>
    <div class="flex justify-end gap-2">
      <Button variant="ghost" onclick={() => (locked = null)}>Cancel</Button>
      <Button type="submit" disabled={!password} loading={busy}>Unlock</Button>
    </div>
  </form>
</Modal>
