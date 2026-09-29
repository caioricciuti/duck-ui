<script lang="ts">
  import SettingsPage from '../settings/SettingsPage.svelte'
  import ExtensionsPage from '../settings/ExtensionsPage.svelte'
  import ConnectionsPage from '../connections/ConnectionsPage.svelte'
  import SavedQueriesPage from '../saved-queries/SavedQueriesPage.svelte'
  import DashboardsPage from '../dashboard/DashboardsPage.svelte'
  import QueryHistoryPage from '../history/QueryHistoryPage.svelte'
  import { getRoute } from '../../stores/router.svelte'

  const route = $derived(getRoute())
</script>

<!-- Keyed so a page starts clean each time it is opened. -->
{#key route}
  {#if route === 'settings'}
    <SettingsPage />
  {:else if route === 'extensions'}
    <ExtensionsPage />
  {:else if route === 'connections'}
    <ConnectionsPage />
  {:else if route === 'dashboards'}
    <DashboardsPage />
  {:else if route === 'saved-queries'}
    <SavedQueriesPage />
  {:else if route === 'history'}
    <QueryHistoryPage />
  {/if}
{/key}
