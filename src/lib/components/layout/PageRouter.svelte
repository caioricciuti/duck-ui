<script lang="ts">
  import type { Component } from 'svelte'
  import Lazy from '../common/Lazy.svelte'
  import { getRoute } from '../../stores/router.svelte'
  import type { PageRoute } from '@/lib/routes'

  type Loader = () => Promise<{ default: Component<Record<string, never>> }>

  const PAGES: Record<PageRoute, Loader> = {
    dashboards: () => import('../dashboard/DashboardsPage.svelte'),
    'saved-queries': () => import('../saved-queries/SavedQueriesPage.svelte'),
    history: () => import('../history/QueryHistoryPage.svelte'),
    connections: () => import('../connections/ConnectionsPage.svelte'),
    extensions: () => import('../settings/ExtensionsPage.svelte'),
    settings: () => import('../settings/SettingsPage.svelte'),
  }

  const route = $derived(getRoute())
</script>

<!-- Keyed so a page starts clean each time it is opened. -->
{#key route}
  {#if route !== 'workspace'}
    <Lazy load={PAGES[route]} props={{}} />
  {/if}
{/key}
