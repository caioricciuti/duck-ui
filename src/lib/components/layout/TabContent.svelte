<script lang="ts">
  import HomeTab from '../workspace/HomeTab.svelte'
  import { openShareLive } from '../../stores/overlays.svelte'
  import SqlTab from '../workspace/SqlTab.svelte'
  import Lazy from '../common/Lazy.svelte'
  import { duck, duckActions } from '../../stores/duck.svelte'
  import { paneOf, visibleTabs } from '@/store/tabPanes'

  interface Props {
    /** Two panes side by side. On a phone the tabs share one pane whatever was saved. */
    split: boolean
  }

  let { split }: Props = $props()

  const tabs = $derived(duck((s) => s.tabs))
  const activeTabId = $derived(duck((s) => s.activeTabId))
  const leftTabId = $derived(duck((s) => visibleTabs(s).left))
  const rightTabId = $derived(duck((s) => visibleTabs(s).right))

  // Working in a pane makes its tab the active one.
  function focus(tabId: string) {
    if (duckActions().activeTabId !== tabId) duckActions().setActiveTab(tabId)
  }
</script>

<!-- Every tab stays mounted and is hidden when inactive, so a running query
     or an unsaved editor state survives switching tabs. The panels are cells
     of the workspace grid: a tab that moves to the other pane changes its
     column and keeps its state, where two lists would mount it again.
     Clipped, not hidden: a hidden box still scrolls when focus lands on
     something past its edge, which shifts the whole tab sideways. -->
{#each tabs as tab (tab.id)}
  {@const visible = split ? tab.id === leftTabId || tab.id === rightTabId : tab.id === activeTabId}
  <div
    class="min-h-0 min-w-0 overflow-clip"
    style="grid-row: 2; grid-column: {split && paneOf(tab) === 'right' ? 3 : 1}"
    hidden={!visible}
    role="tabpanel"
    aria-label={tab.title}
    onpointerdowncapture={() => focus(tab.id)}
    onfocusin={() => focus(tab.id)}
  >
    {#if tab.type === 'home'}
      <HomeTab />
    {:else if tab.type === 'sql'}
      <SqlTab tabId={tab.id} />
    {:else if tab.type === 'notebook'}
      <Lazy load={() => import('../notebook/NotebookTab.svelte')} props={{ tabId: tab.id }} />
    {:else if tab.type === 'table'}
      <Lazy load={() => import('../workspace/TableTab.svelte')} props={{ tabId: tab.id, visible }} />
    {:else if tab.type === 'dashboard'}
      <Lazy load={() => import('../dashboard/DashboardTab.svelte')} props={{ tabId: tab.id, onsharelive: openShareLive }} />
    {/if}
  </div>
{/each}
