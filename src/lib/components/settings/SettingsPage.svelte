<script lang="ts">
  import PageHeader from '../common/PageHeader.svelte'
  import PageBody from '../common/PageBody.svelte'
  import AISettings from './AISettings.svelte'
  import GeneralSettings from './GeneralSettings.svelte'
  import PerformanceSettings from './PerformanceSettings.svelte'
  import ProfileSettings from './ProfileSettings.svelte'
  import ProjectTransfer from './ProjectTransfer.svelte'
  import { getSection } from '../../stores/router.svelte'
  import { sectionsFor } from '@/lib/routes'

  const section = $derived(getSection() ?? 'profile')
  const label = $derived(sectionsFor('settings').find((s) => s.id === section)?.label ?? '')
</script>

<PageHeader title="Settings" subtitle={label} />

<PageBody>
  <div class="max-w-3xl">
    {#if section === 'general'}
      <GeneralSettings />
    {:else if section === 'ai'}
      <AISettings />
    {:else if section === 'performance'}
      <PerformanceSettings />
    {:else if section === 'project'}
      <ProjectTransfer />
    {:else}
      <ProfileSettings />
    {/if}
  </div>
</PageBody>
