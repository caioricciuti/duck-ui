<script lang="ts">
  import HomeTab from '../workspace/HomeTab.svelte'
  import PendingTab from '../workspace/PendingTab.svelte'
  import SqlTab from '../workspace/SqlTab.svelte'
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
      <PendingTab name="Notebooks" />
    {:else if tab.type === 'dashboard'}
      <PendingTab name="Dashboards" />
    {/if}
  </div>
{/each}
