<script lang="ts">
  import HomeTab from '../workspace/HomeTab.svelte'
  import PendingTab from '../workspace/PendingTab.svelte'
  import { duck } from '../../stores/duck.svelte'
  import type { EditorTabType } from '@/store/types'

  const tabs = $derived(duck((s) => s.tabs))
  const activeTabId = $derived(duck((s) => s.activeTabId))

  const PENDING: Record<Exclude<EditorTabType, 'home'>, string> = {
    sql: 'The SQL editor',
    notebook: 'Notebooks',
    dashboard: 'Dashboards',
    connections: 'Connections',
    settings: 'Settings',
  }
</script>

<!-- Every tab stays mounted and is hidden when inactive, so a running query
     or an unsaved editor state survives switching tabs. -->
{#each tabs as tab (tab.id)}
  <div class="h-full min-h-0" hidden={tab.id !== activeTabId} role="tabpanel" aria-label={tab.title}>
    {#if tab.type === 'home'}
      <HomeTab />
    {:else}
      <PendingTab name={PENDING[tab.type]} />
    {/if}
  </div>
{/each}
