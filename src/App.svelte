<script lang="ts">
  import { onMount } from 'svelte'
  import Toast from './lib/components/common/Toast.svelte'
  import Spinner from './lib/components/common/Spinner.svelte'
  import Button from './lib/components/common/Button.svelte'
  import Shell from './lib/components/layout/Shell.svelte'
  import ProfilePicker from './lib/components/profile/ProfilePicker.svelte'
  import ProfileAvatar from './lib/components/profile/ProfileAvatar.svelte'
  import EmbedView from './lib/components/embed/EmbedView.svelte'
  import { isEmbedPath } from './lib/urlLoaders'
  import { duck, duckActions } from './lib/stores/duck.svelte'
  import { syncThemeFromStorage } from './lib/stores/theme.svelte'
  import { startUpdateChecks } from './lib/stores/update.svelte'
  import { bootProfile, selectProfile, createAndLoadProfile } from './lib/boot'
  import type { Profile } from './store/types'

  type Stage = 'profile' | 'picker' | 'engine'

  // The embed viewer is a public, profile-free widget: it starts the engine
  // but skips the profile (no picker, no persistence, no autosave).
  const embed = isEmbedPath()

  let stage = $state<Stage>('profile')
  let pickerProfiles = $state<Profile[]>([])

  const initialized = $derived(duck((s) => s.isInitialized))
  const engineLoading = $derived(duck((s) => s.isLoading))
  const engineError = $derived(duck((s) => s.error))

  function startEngine() {
    // The profile loader writes the saved theme to storage.
    syncThemeFromStorage()
    stage = 'engine'
    void duckActions().initialize()
  }

  onMount(async () => {
    // Every screen, the embed included, registers the worker: it is what
    // caches the app for offline use and what announces a new version.
    void startUpdateChecks()
    if (embed) return
    try {
      const boot = await bootProfile()
      if (boot.kind === 'picker') {
        pickerProfiles = boot.profiles
        stage = 'picker'
        return
      }
    } catch (error) {
      // Persistence is optional: the engine still works without a profile.
      console.error('[boot] Failed to initialize profile:', error)
    }
    startEngine()
  })

  async function onSelectProfile(id: string, password?: string) {
    await selectProfile(id, password)
    startEngine()
  }

  async function onCreateProfile(name: string, password?: string, avatarEmoji?: string) {
    const id = await createAndLoadProfile(name, password, avatarEmoji)
    startEngine()
    return id
  }
</script>

<Toast />

{#if embed}
  <EmbedView />
{:else if stage === 'picker'}
  <ProfilePicker profiles={pickerProfiles} onselect={onSelectProfile} oncreate={onCreateProfile} />
{:else if stage === 'engine' && initialized && !engineLoading}
  <Shell />
{:else if stage === 'engine' && engineError && !engineLoading}
  <div class="flex h-full flex-col items-center justify-center gap-3 px-6 text-center" role="alert">
    <ProfileAvatar avatarEmoji="logo" size="lg" />
    <h1 class="text-[15px] text-fg">DuckDB failed to start</h1>
    <p class="max-w-[60ch] text-[13px] text-fg-3">{engineError}</p>
    <Button onclick={() => window.location.reload()}>Try again</Button>
  </div>
{:else}
  <div class="flex h-full flex-col items-center justify-center gap-3">
    <ProfileAvatar avatarEmoji="logo" size="lg" />
    <Spinner size="lg" />
    <p class="text-xs text-fg-3">{stage === 'profile' ? 'Loading profile...' : 'Initializing DuckDB...'}</p>
  </div>
{/if}
