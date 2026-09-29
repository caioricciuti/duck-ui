<script lang="ts">
  import { tick } from 'svelte'
  import {
    Search, Plus, Table2, Moon, Sun, SquareTerminal, Home, NotebookPen, RefreshCw, PanelLeft, Bookmark, History, LayoutDashboard,
  } from 'lucide-svelte'
  import { closeCommandPalette, isCommandPaletteOpen } from '../../stores/command-palette.svelte'
  import { duck, duckActions } from '../../stores/duck.svelte'
  import { getTheme, toggleTheme } from '../../stores/theme.svelte'
  import { toggleExplorer } from '../../stores/layout.svelte'
  import { trapFocus } from '../../utils/focus-trap'
  import { qualifyTable } from '@/lib/sqlSanitize'
  import { goTo, goWorkspace } from '../../stores/router.svelte'
  import { NAV_GROUPS, PAGE_ROUTES, PAGE_SECTIONS, visibleRoutes } from '@/lib/routes'
  import { getSavedQueries, type SavedQuery } from '@/services/persistence/repositories/savedQueryRepository'
  import { searchHistory, type HistoryEntry } from '@/services/persistence/repositories/queryHistoryRepository'

  type Group = 'actions' | 'pages' | 'tabs' | 'saved' | 'dashboards' | 'tables' | 'history'

  interface CommandItem {
    id: string
    group: Group
    label: string
    sub?: string
    keywords?: string
    shortcut?: string
    icon: typeof Search
    run: () => void
  }

  const GROUP_LABEL: Record<Group, string> = {
    actions: 'Quick actions', pages: 'Pages', tabs: 'Open tabs', saved: 'Saved queries',
    dashboards: 'Dashboards', tables: 'Tables', history: 'Recent queries',
  }
  const GROUP_ORDER: Group[] = ['actions', 'tabs', 'saved', 'dashboards', 'tables', 'pages', 'history']
  const MAX_PER_GROUP = 12
  /** Before anything is typed the menu is a starting point, not a listing. */
  const MAX_PER_GROUP_IDLE = 5
  const HISTORY_LOOKBACK = 200

  let inputEl: HTMLInputElement | undefined = $state()
  let listEl: HTMLDivElement | undefined = $state()
  let query = $state('')
  let selectedIdx = $state(0)

  const open = $derived(isCommandPaletteOpen())
  const tabs = $derived(duck((s) => s.tabs))
  const databases = $derived(duck((s) => s.databases))
  const dashboards = $derived(duck((s) => s.dashboards))
  const profileId = $derived(duck((s) => s.currentProfileId))

  let savedQueries = $state.raw<SavedQuery[]>([])
  let recentQueries = $state.raw<HistoryEntry[]>([])

  // Read when the menu opens, so it always reflects what was just saved or run.
  $effect(() => {
    if (!open || !profileId) return
    let stale = false
    void getSavedQueries(profileId)
      .then((list) => {
        if (!stale) savedQueries = list
      })
      .catch(() => {})
    void searchHistory(profileId, { status: 'succeeded', limit: HISTORY_LOOKBACK })
      .then((page) => {
        if (stale) return
        // The same query run ten times is one entry here.
        const seen = new Set<string>()
        recentQueries = page.entries.filter((entry) => {
          const key = entry.sql_text.trim()
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
      })
      .catch(() => {})
    return () => {
      stale = true
    }
  })

  const oneLine = (sql: string) => sql.replace(/\s+/g, ' ').trim()

  function scoreMatch(text: string, term: string): number {
    if (!term) return 1
    let ti = 0, score = 0
    const lt = text.toLowerCase(), lq = term.toLowerCase()
    for (let i = 0; i < lt.length && ti < lq.length; i++) {
      if (lt[i] === lq[ti]) {
        score += i > 0 && (lt[i - 1] === ' ' || lt[i - 1] === '.') ? 5 : 2
        ti++
      }
    }
    if (ti !== lq.length) return -1
    if (lt.startsWith(lq)) score += 25
    if (lt.includes(` ${lq}`) || lt.includes(`.${lq}`)) score += 10
    return score
  }

  /** Opens a tab and brings the workspace forward, in case a page is showing. */
  function inWorkspace(action: () => void): () => void {
    return () => {
      goWorkspace()
      action()
    }
  }

  function openHome() {
    const existing = tabs.find((t) => t.type === 'home')
    if (existing) duckActions().setActiveTab(existing.id)
    else duckActions().createTab('home', '', 'Home')
  }

  const items = $derived.by((): CommandItem[] => {
    const list: CommandItem[] = [
      { id: 'new-query', group: 'actions', label: 'New query', icon: Plus, shortcut: '⌥N', keywords: 'sql editor tab', run: inWorkspace(() => duckActions().createTab('sql')) },
      { id: 'new-notebook', group: 'actions', label: 'New notebook', icon: NotebookPen, keywords: 'python markdown cells', run: inWorkspace(() => duckActions().createTab('notebook')) },
      { id: 'home', group: 'actions', label: 'Home', icon: Home, keywords: 'start welcome', run: inWorkspace(openHome) },
      { id: 'explorer', group: 'actions', label: 'Toggle explorer', icon: PanelLeft, shortcut: '⌘B', keywords: 'sidebar schema panel', run: inWorkspace(toggleExplorer) },
      { id: 'refresh', group: 'actions', label: 'Refresh schema', icon: RefreshCw, keywords: 'reload tables databases', run: () => void duckActions().fetchDatabasesAndTablesInfo() },
      { id: 'theme', group: 'actions', label: getTheme() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme', icon: getTheme() === 'dark' ? Sun : Moon, keywords: 'dark light mode appearance', run: toggleTheme },
    ]

    for (const group of NAV_GROUPS) {
      for (const route of visibleRoutes(group)) {
        const meta = PAGE_ROUTES[route]
        list.push({ id: `page:${route}`, group: 'pages', label: meta.label, sub: group.label, keywords: meta.description, icon: meta.icon, run: () => goTo(route) })
        for (const section of PAGE_SECTIONS[route] ?? []) {
          list.push({ id: `page:${route}:${section.id}`, group: 'pages', label: `${meta.label}: ${section.label}`, sub: group.label, icon: meta.icon, run: () => goTo(route, section.id) })
        }
      }
    }

    for (const tab of tabs) {
      list.push({
        id: `tab:${tab.id}`,
        group: 'tabs',
        label: tab.title,
        sub: tab.type,
        icon: SquareTerminal,
        run: inWorkspace(() => duckActions().setActiveTab(tab.id)),
      })
    }

    for (const query of savedQueries) {
      list.push({
        id: `saved:${query.id}`,
        group: 'saved',
        label: query.name,
        sub: oneLine(query.sql_text).slice(0, 90),
        keywords: query.sql_text,
        icon: Bookmark,
        run: inWorkspace(() => duckActions().createTab('sql', query.sql_text, query.name)),
      })
    }

    for (const dashboard of dashboards) {
      list.push({
        id: `dashboard:${dashboard.id}`,
        group: 'dashboards',
        label: dashboard.name,
        icon: LayoutDashboard,
        run: inWorkspace(() => duckActions().openDashboardTab(dashboard.id, dashboard.name)),
      })
    }

    for (const entry of recentQueries) {
      const text = oneLine(entry.sql_text)
      list.push({
        id: `history:${entry.id}`,
        group: 'history',
        label: text.slice(0, 90),
        sub: text.length > 90 ? text.slice(90, 200) : undefined,
        keywords: entry.sql_text,
        icon: History,
        run: inWorkspace(() => duckActions().createTab('sql', entry.sql_text)),
      })
    }

    for (const db of databases) {
      for (const table of db.tables) {
        list.push({
          id: `table:${db.name}.${table.schema}.${table.name}`,
          group: 'tables',
          label: table.name,
          sub: `${db.name}.${table.schema}`,
          keywords: table.columns.map((c) => c.name).join(' '),
          icon: Table2,
          run: () => {
            goWorkspace()
            const sql = `SELECT * FROM ${qualifyTable(db.name, table.schema, table.name)} LIMIT 100`
            const { createTab, executeQuery } = duckActions()
            const tabId = createTab('sql', sql, table.name)
            if (tabId) void executeQuery(sql, tabId)
          },
        })
      }
    }
    return list
  })

  const grouped = $derived.by(() => {
    const term = query.trim()
    const scored = items
      .map((item) => ({
        item,
        score: Math.max(scoreMatch(item.label, term), scoreMatch(`${item.sub ?? ''} ${item.keywords ?? ''}`, term) - 5),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)

    return GROUP_ORDER.map((group) => ({
      group,
      items: scored
        .filter((entry) => entry.item.group === group)
        .slice(0, term || group === 'actions' ? MAX_PER_GROUP : MAX_PER_GROUP_IDLE)
        .map((entry) => entry.item),
    })).filter((g) => g.items.length > 0)
  })

  const flat = $derived(grouped.flatMap((g) => g.items))

  $effect(() => {
    if (!open) return
    query = ''
    selectedIdx = 0
    void tick().then(() => inputEl?.focus())
  })

  $effect(() => {
    // Typing changes the list under the cursor; start from the top again.
    void query
    selectedIdx = 0
  })

  function runCommand(item: CommandItem) {
    closeCommandPalette()
    item.run()
  }

  async function move(delta: number) {
    if (flat.length === 0) return
    selectedIdx = (selectedIdx + delta + flat.length) % flat.length
    await tick()
    listEl?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      void move(1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      void move(-1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = flat[selectedIdx]
      if (item) runCommand(item)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      closeCommandPalette()
    }
  }
</script>

{#if open}
  <div class="fixed inset-0 z-[80] bg-black/50" onclick={closeCommandPalette} role="presentation"></div>

  <div class="pointer-events-none fixed inset-0 z-[81] flex items-start justify-center px-4 pt-[10vh]">
    <div
      class="surface-card pointer-events-auto flex max-h-[70vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl"
      style="box-shadow: var(--shadow-modal)"
      role="dialog"
      aria-modal="true"
      aria-label="Command menu"
      tabindex="-1"
      use:trapFocus
      onkeydown={onKeydown}
    >
      <div class="flex items-center gap-2.5 border-b border-edge-subtle px-4">
        <Search size={15} class="shrink-0 text-fg-3" />
        <input
          bind:this={inputEl}
          bind:value={query}
          class="h-11 w-full bg-transparent text-sm text-fg placeholder:text-fg-4 focus:outline-none"
          placeholder="Search tables, tabs and actions"
          aria-label="Search tables, tabs and actions"
          autocomplete="off"
          spellcheck="false"
        />
      </div>

      <div bind:this={listEl} class="min-h-0 flex-1 overflow-auto p-1.5">
        {#if flat.length === 0}
          <div class="px-3 py-8 text-center text-[13px] text-fg-3">No match for "{query}"</div>
        {:else}
          {#each grouped as g (g.group)}
            <div class="flex items-center gap-2 px-2 pb-1 pt-2">
              <span class="text-[10px] font-medium uppercase tracking-wide text-fg-3">{GROUP_LABEL[g.group]}</span>
              <span class="text-[10px] text-fg-4">{g.items.length}</span>
            </div>
            {#each g.items as item (item.id)}
              {@const idx = flat.indexOf(item)}
              {@const active = idx === selectedIdx}
              <button
                class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors {active ? 'bg-accent-soft text-accent' : 'text-fg-2 hover:bg-hover'}"
                data-active={active}
                onclick={() => runCommand(item)}
                onmouseenter={() => (selectedIdx = idx)}
              >
                <item.icon size={15} class={active ? 'text-accent' : 'text-fg-3'} />
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-medium">{item.label}</span>
                  {#if item.sub}
                    <span class="block truncate text-[11px] text-fg-3">{item.sub}</span>
                  {/if}
                </span>
                {#if item.shortcut}
                  <span class="shrink-0 rounded border border-edge px-1.5 py-0.5 font-mono text-[10px] text-fg-3">{item.shortcut}</span>
                {/if}
              </button>
            {/each}
          {/each}
        {/if}
      </div>

      <div class="border-t border-edge-subtle px-3 py-2 text-[11px] text-fg-3">
        <span class="font-medium">↑↓</span> navigate · <span class="font-medium">↵</span> run · <span class="font-medium">esc</span> close
      </div>
    </div>
  </div>
{/if}
