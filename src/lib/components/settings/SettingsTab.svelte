<script lang="ts">
  import { Bot, Gauge, FolderArchive, Puzzle, SlidersHorizontal, User } from 'lucide-svelte'
  import SectionHeader from '../common/SectionHeader.svelte'
  import Tabs, { type TabItem } from '../common/Tabs.svelte'
  import { duck } from '../../stores/duck.svelte'
  import AISettings from './AISettings.svelte'
  import ExtensionsSettings from './ExtensionsSettings.svelte'
  import GeneralSettings from './GeneralSettings.svelte'
  import PerformanceSettings from './PerformanceSettings.svelte'
  import ProfileSettings from './ProfileSettings.svelte'
  import ProjectTransfer from './ProjectTransfer.svelte'

  type Section = 'profile' | 'ai' | 'general' | 'performance' | 'project' | 'extensions'

  const sections: (TabItem & { id: Section })[] = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'ai', label: 'AI', icon: Bot },
    { id: 'general', label: 'General', icon: SlidersHorizontal },
    { id: 'performance', label: 'Performance', icon: Gauge },
    { id: 'project', label: 'Project', icon: FolderArchive },
    { id: 'extensions', label: 'Extensions', icon: Puzzle },
  ]

  let active = $state<Section>('profile')

  // Remount the extension list when the active connection changes. Each
  // connection has its own set of installed/loaded extensions.
  const currentSessionId = $derived(duck((s) => s.currentSession?.id))
</script>

<div class="flex h-full flex-col">
  <div class="shrink-0 px-6 pt-6">
    <div class="mx-auto max-w-3xl">
      <SectionHeader level="page" title="Settings" description="Profile, AI provider and engine preferences for this browser." class="mb-3" />
      <div class="overflow-x-auto">
        <Tabs items={sections} value={active} onchange={(id) => (active = id as Section)} />
      </div>
    </div>
  </div>

  <div class="min-h-0 flex-1 overflow-auto px-6 py-6">
    <div class="mx-auto max-w-3xl" role="tabpanel" aria-label={sections.find((s) => s.id === active)?.label}>
      {#if active === 'profile'}
        <ProfileSettings />
      {:else if active === 'ai'}
        <AISettings />
      {:else if active === 'general'}
        <GeneralSettings />
      {:else if active === 'performance'}
        <PerformanceSettings />
      {:else if active === 'project'}
        <ProjectTransfer />
      {:else}
        {#key currentSessionId ?? 'none'}
          <ExtensionsSettings />
        {/key}
      {/if}
    </div>
  </div>
</div>
