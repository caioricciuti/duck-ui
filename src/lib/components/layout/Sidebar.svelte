<script lang="ts">
  import Button from '../common/Button.svelte'
  import ProfileAvatar from '../profile/ProfileAvatar.svelte'
  import { duck, duckActions } from '../../stores/duck.svelte'
  import { toggleTheme, getTheme } from '../../stores/theme.svelte'
  import { openCommandPalette } from '../../stores/command-palette.svelte'
  import { isExplorerCollapsed, toggleExplorer } from '../../stores/layout.svelte'
  import { getUiConfig } from '@/lib/appConfig'
  import type { EditorTabType } from '@/store/types'
  import {
    Home, Database, Cable, Settings, Sun, Moon, Search, SquareTerminal, NotebookPen, CircleHelp,
  } from 'lucide-svelte'

  const ui = getUiConfig()

  const tabs = $derived(duck((s) => s.tabs))
  const activeTabId = $derived(duck((s) => s.activeTabId))
  const activeType = $derived(tabs.find((t) => t.id === activeTabId)?.type)
  const profile = $derived(duck((s) => s.currentProfile))
  const connection = $derived(duck((s) => s.currentConnection))
  const online = $derived(duck((s) => s.isInitialized && !s.error))
  const explorerOpen = $derived(!isExplorerCollapsed())

  function openOrFocus(type: EditorTabType, title: string) {
    const existing = tabs.find((t) => t.type === type)
    if (existing) duckActions().setActiveTab(existing.id)
    else duckActions().createTab(type, '', title)
  }

  const railButton = 'relative mt-1 inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors'
  const idle = 'text-fg-3 hover:bg-hover hover:text-fg'
</script>

{#snippet marker()}
  <span class="absolute -left-2 top-1.5 bottom-1.5 w-0.5 rounded-full bg-accent"></span>
{/snippet}

<nav class="flex h-full w-12 shrink-0 flex-col items-center border-r border-edge-subtle bg-sidebar py-2" aria-label="Primary">
  <Button icon variant="ghost" size="sm" onclick={openCommandPalette} title="Search or run a command (⌘K)" aria-label="Command menu">
    <Search size={15} />
  </Button>

  <span class="my-1.5 h-px w-5 bg-edge"></span>

  <button
    class="{railButton} mt-0 {activeType === 'home' ? 'bg-active text-accent' : idle}"
    onclick={() => openOrFocus('home', 'Home')}
    title="Home"
    aria-label="Home"
    aria-current={activeType === 'home' ? 'page' : undefined}
  >
    {#if activeType === 'home'}{@render marker()}{/if}
    <Home size={16} />
  </button>

  <button
    class="{railButton} {activeType === 'sql' ? 'bg-active text-fg' : idle}"
    onclick={() => duckActions().createTab('sql')}
    title="New query (⌥N)"
    aria-label="New query"
  >
    {#if activeType === 'sql'}{@render marker()}{/if}
    <SquareTerminal size={16} />
  </button>

  <button
    class="{railButton} {activeType === 'notebook' ? 'bg-active text-fg' : idle}"
    onclick={() => duckActions().createTab('notebook')}
    title="New notebook"
    aria-label="New notebook"
  >
    {#if activeType === 'notebook'}{@render marker()}{/if}
    <NotebookPen size={16} />
  </button>

  <button
    class="{railButton} {explorerOpen ? 'text-fg' : idle}"
    onclick={toggleExplorer}
    title="{explorerOpen ? 'Hide' : 'Show'} explorer (⌘B)"
    aria-label="{explorerOpen ? 'Hide' : 'Show'} explorer"
    aria-pressed={explorerOpen}
  >
    <Database size={16} />
  </button>

  {#if !ui.hideConnections}
    <button
      class="{railButton} {activeType === 'connections' ? 'bg-active text-fg' : idle}"
      onclick={() => openOrFocus('connections', 'Connections')}
      title="Connections"
      aria-label="Connections"
      aria-current={activeType === 'connections' ? 'page' : undefined}
    >
      {#if activeType === 'connections'}{@render marker()}{/if}
      <Cable size={16} />
    </button>
  {/if}

  <div class="flex-1"></div>

  {#if !ui.hideSettings}
    <button
      class="{railButton} {activeType === 'settings' ? 'bg-active text-fg' : idle}"
      onclick={() => openOrFocus('settings', 'Settings')}
      title="Settings"
      aria-label="Settings"
      aria-current={activeType === 'settings' ? 'page' : undefined}
    >
      {#if activeType === 'settings'}{@render marker()}{/if}
      <Settings size={16} />
    </button>
  {/if}

  <span class="my-1.5 h-px w-5 bg-edge"></span>

  <span
    class="my-1 h-1.5 w-1.5 rounded-full {online ? 'bg-success' : 'bg-danger'}"
    title="{connection?.name ?? 'DuckDB'}: {online ? 'connected' : 'disconnected'}"
    role="img"
    aria-label={online ? 'Connected' : 'Disconnected'}
  ></span>

  <Button icon variant="ghost" size="sm" onclick={toggleTheme} title="Toggle theme" aria-label="Toggle theme">
    {#if getTheme() === 'dark'}<Sun size={15} />{:else}<Moon size={15} />{/if}
  </Button>

  <a
    href="https://duckui.com"
    target="_blank"
    rel="noopener noreferrer"
    class="inline-flex h-7 w-7 items-center justify-center rounded-md text-fg-3 hover:bg-hover hover:text-fg"
    title="Documentation"
    aria-label="Documentation"
  >
    <CircleHelp size={15} />
  </a>

  {#if profile && !ui.hideSettings}
    <button
      class="mt-1 inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-hover"
      onclick={() => openOrFocus('settings', 'Settings')}
      title={profile.name}
      aria-label="Profile: {profile.name}"
    >
      <ProfileAvatar avatarEmoji={profile.avatarEmoji} size="sm" />
    </button>
  {/if}
</nav>
