<script lang="ts">
  import HomeTab from '../workspace/HomeTab.svelte'
  import { openShareLive } from '../../stores/overlays.svelte'
  import SqlTab from '../workspace/SqlTab.svelte'
  import Lazy from '../common/Lazy.svelte'
  import { duck } from '../../stores/duck.svelte'

  const tabs = $derived(duck((s) => s.tabs))
  const activeTabId = $derived(duck((s) => s.activeTabId))
</script>

<!-- Every tab stays mounted and is hidden when inactive, so a running query
     or an unsaved editor state survives switching tabs. -->
{#each tabs as tab (tab.id)}
  <div class="h-full min-h-0" hidden={tab.id !== activeTabId} role="tabpanel" aria-label={tab.title}>
    {#if tab.type === 'home'}
      <HomeTab />
    {:else if tab.type === 'sql'}
      <SqlTab tabId={tab.id} />
    {:else if tab.type === 'notebook'}
      <Lazy load={() => import('../notebook/NotebookTab.svelte')} props={{ tabId: tab.id }} />
    {:else if tab.type === 'dashboard'}
      <Lazy load={() => import('../dashboard/DashboardTab.svelte')} props={{ tabId: tab.id, onsharelive: openShareLive }} />
    {/if}
  </div>
{/each}
