<script lang="ts">
  import { Trash2, UserPlus } from 'lucide-svelte'
  import type { Profile } from '@/store/types'
  import Button from '../common/Button.svelte'
  import ConfirmDialog from '../common/ConfirmDialog.svelte'
  import Modal from '../common/Modal.svelte'
  import SectionHeader from '../common/SectionHeader.svelte'
  import ProfileAvatar from '../profile/ProfileAvatar.svelte'
  import ProfileEditor, { type ProfileValues } from '../profile/ProfileEditor.svelte'
  import { duck, duckActions } from '../../stores/duck.svelte'
  import * as toast from '../../stores/toast.svelte'
  import PasswordDialog from './PasswordDialog.svelte'

  const currentProfile = $derived(duck((s) => s.currentProfile))
  const currentProfileId = $derived(duck((s) => s.currentProfileId))
  const profiles = $derived(duck((s) => s.profiles))
  const otherProfiles = $derived(profiles.filter((p) => p.id !== currentProfileId))

  let saving = $state(false)
  let creating = $state(false)
  let showCreate = $state(false)
  let showDeleteConfirm = $state(false)
  let deleting = $state(false)
  let switchTarget = $state<Profile | null>(null)
  let showPassword = $state(false)
  let pendingDeleteId = $state<string | null>(null)

  async function saveProfile(values: ProfileValues) {
    saving = true
    try {
      await duckActions().updateProfile({ name: values.name, avatarEmoji: values.avatarEmoji })
      toast.success('Profile updated')
    } catch {
      toast.error('Failed to update profile')
    } finally {
      saving = false
    }
  }

  async function createProfile(values: ProfileValues) {
    creating = true
    try {
      await duckActions().createProfile(values.name, values.password, values.avatarEmoji)
      showCreate = false
      toast.success(`Profile "${values.name}" created`)
    } catch {
      toast.error('Failed to create profile')
    } finally {
      creating = false
    }
  }

  function switchProfile(profile: Profile) {
    if (profile.hasPassword) {
      switchTarget = profile
      showPassword = true
    } else {
      void duckActions().switchProfile(profile.id)
    }
  }

  async function deleteProfile() {
    showDeleteConfirm = false
    if (!currentProfileId || profiles.length <= 1) return
    const other = profiles.find((p) => p.id !== currentProfileId)
    if (!other) return

    // The app always needs an active profile, so deleting the current one
    // means landing on another first. A protected one asks for its password.
    if (other.hasPassword) {
      pendingDeleteId = currentProfileId
      switchTarget = other
      showPassword = true
      return
    }

    deleting = true
    try {
      const deletingId = currentProfileId
      const { switchProfile: doSwitch, deleteProfile: doDelete } = duckActions()
      await doSwitch(other.id)
      await doDelete(deletingId)
      toast.success('Profile deleted')
    } catch {
      toast.error('Failed to delete profile')
    } finally {
      deleting = false
    }
  }

  async function submitPassword(password: string) {
    if (!switchTarget) return
    const { switchProfile: doSwitch, deleteProfile: doDelete } = duckActions()
    try {
      if (pendingDeleteId) {
        deleting = true
        await doSwitch(switchTarget.id, password)
        await doDelete(pendingDeleteId)
        pendingDeleteId = null
        toast.success('Profile deleted')
        deleting = false
      } else {
        await doSwitch(switchTarget.id, password)
      }
      showPassword = false
    } catch {
      toast.error(pendingDeleteId ? 'Failed to delete profile' : 'Incorrect password')
      pendingDeleteId = null
      deleting = false
    }
  }

  function closePassword() {
    showPassword = false
    pendingDeleteId = null
  }
</script>

<div class="flex flex-col gap-6">
  {#if currentProfile}
    <section>
      <SectionHeader title="Your profile" description="Name and avatar shown across the app." />
      <!-- The editor seeds its fields once, so a different profile needs a fresh one. -->
      {#key currentProfile.id}
        <ProfileEditor
          mode="edit"
          initialValues={{ name: currentProfile.name, avatarEmoji: currentProfile.avatarEmoji }}
          loading={saving}
          onsave={saveProfile}
        />
      {/key}
    </section>
  {/if}

  <section class="border-t border-edge-subtle pt-6">
    <SectionHeader title="Profiles" description="Each profile keeps its own connections, queries and settings.">
      {#snippet actions()}
        <Button size="sm" variant="outline" onclick={() => (showCreate = true)}>
          <UserPlus size={14} />
          Create New Profile
        </Button>
      {/snippet}
    </SectionHeader>

    {#if otherProfiles.length > 0}
      <ul class="flex flex-col gap-2">
        {#each otherProfiles as profile (profile.id)}
          <li>
            <button
              type="button"
              class="flex w-full items-center gap-3 rounded-md border border-edge-subtle bg-surface p-2.5 text-left transition-colors hover:border-edge hover:bg-hover"
              onclick={() => switchProfile(profile)}
            >
              <ProfileAvatar avatarEmoji={profile.avatarEmoji} size="md" />
              <span class="min-w-0 flex-1 truncate text-[13px] font-medium text-fg">{profile.name}</span>
              <span class="text-xs text-fg-3">Switch</span>
            </button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="text-xs text-fg-3">No other profiles yet.</p>
    {/if}
  </section>

  <section class="border-t border-edge-subtle pt-6">
    <h2 class="mb-3 text-[13px] font-semibold text-danger">Danger Zone</h2>
    <Button
      size="sm"
      variant="danger"
      disabled={profiles.length <= 1 || deleting}
      loading={deleting}
      onclick={() => (showDeleteConfirm = true)}
    >
      <Trash2 size={14} />
      Delete Profile
    </Button>
    {#if profiles.length <= 1}
      <p class="mt-2 text-xs text-fg-3">Cannot delete the only profile. Create another profile first.</p>
    {/if}
  </section>
</div>

<ConfirmDialog
  open={showDeleteConfirm}
  title="Delete Profile"
  description={`This will permanently delete "${currentProfile?.name ?? ''}" and all associated data including saved connections, query history, and AI configurations. This action cannot be undone.`}
  confirmLabel="Delete"
  destructive
  onconfirm={deleteProfile}
  oncancel={() => (showDeleteConfirm = false)}
/>

<Modal open={showCreate} title="Create Profile" size="sm" onclose={() => (showCreate = false)}>
  <ProfileEditor mode="create" loading={creating} onsave={createProfile} oncancel={() => (showCreate = false)} />
</Modal>

{#if switchTarget}
  <PasswordDialog open={showPassword} profile={switchTarget} onsubmit={submitPassword} onclose={closePassword} />
{/if}
