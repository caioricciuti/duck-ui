<script lang="ts">
  import {
    SquareTerminal, NotebookPen, FlaskConical, LayoutDashboard, Radio, Brain, Server, PackageCheck, Star, BookOpen,
    ExternalLink, Database, Building2, ChartColumn, Logs, Bot, ArrowUpRight, Play,
  } from 'lucide-svelte'
  import ProfileAvatar from '../profile/ProfileAvatar.svelte'
  import { duck, duckActions } from '../../stores/duck.svelte'
  import * as toast from '../../stores/toast.svelte'
  import { demoDatasets, type DemoDataset } from '@/lib/demoDatasets'
  import { stageRemoteTextFile } from '@/services/duckdb/utils'
  import { getUiConfig } from '@/lib/appConfig'
  import { goTo } from '../../stores/router.svelte'
  import { openShareLive } from '../../stores/overlays.svelte'

  const ui = getUiConfig()
  const version = __DUCK_UI_VERSION__
  const releaseDate = __DUCK_UI_RELEASE_DATE__

  const db = $derived(duck((s) => s.db))
  const supportsFileImport = $derived(duck((s) => s.currentSession?.capabilities.supportsFileImport ?? false))
  const profile = $derived(duck((s) => s.currentProfile))

  let openingDemo = $state<string | null>(null)


  const quickStart = $derived([
    {
      title: 'SQL query',
      description: 'Write and run SQL on DuckDB WASM.',
      icon: SquareTerminal,
      run: () => duckActions().createTab('sql'),
    },
    {
      title: 'Notebook',
      description: 'SQL, Python and markdown cells in one document.',
      icon: NotebookPen,
      run: () => duckActions().createTab('notebook'),
    },
    {
      title: 'Dashboards',
      description: 'Reports as markdown with live SQL, charts and inputs.',
      icon: LayoutDashboard,
      run: () => goTo('dashboards'),
    },
    {
      title: 'Share live',
      description: 'Invite another browser into your workspace. No server.',
      icon: Radio,
      run: openShareLive,
    },
    ...(ui.hideBrain
      ? []
      : [
          {
            title: 'Duck Brain',
            description: 'Ask questions in plain language, get SQL back.',
            icon: Brain,
            run: () => duckActions().toggleBrainPanel(),
          },
        ]),
    {
      title: 'Explore with examples',
      description: 'Open a sample query over a public Parquet file.',
      icon: FlaskConical,
      run: () =>
        duckActions().createTab(
          'sql',
          "\nSELECT * FROM 'https://blobs.duckdb.org/stations.parquet' LIMIT 1000;\n",
          'Duck UI Explore',
        ),
    },
    ...(ui.hideConnections
      ? []
      : [
          {
            title: 'Connect local DuckDB',
            description: 'Query your own DuckDB instance over the HTTP server extension.',
            icon: Server,
            run: () => goTo('connections'),
          },
        ]),
  ])

  const resources = [
    { title: 'Star us on GitHub', description: 'Support the project with a star.', link: 'https://github.com/caioricciuti/duck-ui', icon: Star },
    { title: 'DuckDB docs', description: 'The DuckDB documentation.', link: 'https://duckdb.org/docs/', icon: BookOpen },
    { title: 'Duck-UI documentation', description: 'Learn how to make the most of Duck-UI.', link: 'https://docs.duckui.com/', icon: ExternalLink },
  ]

  const products = [
    { title: 'CH-UI', description: 'Your ClickHouse, one workspace: SQL editor, dashboards, pipelines, governance, scheduling, and an AI copilot.', link: 'https://ch-ui.com?utm_source=duck-ui&utm_medium=app&utm_campaign=cross-promo', icon: Database },
    { title: 'Caio Ricciuti', description: 'Data engineering and analytics solutions.', link: 'https://caioricciuti.com?utm_source=duck-ui&utm_medium=app&utm_campaign=cross-promo', icon: Building2 },
    { title: 'Dev Cockpit', description: 'Get under the hood of your Apple Silicon.', link: 'https://devcockpit.app?utm_source=duck-ui&utm_medium=app&utm_campaign=cross-promo', icon: Logs },
  ]

  async function openDemo(dataset: DemoDataset) {
    openingDemo = dataset.id
    try {
      // CSV demos are downloaded in JS and registered in the virtual filesystem,
      // then the query is pointed at that local name: reading a remote CSV over
      // httpfs mis-detects the dialect (see stageRemoteTextFile). Staging only
      // applies to an engine that runs here. A remote server fetches the URL
      // itself and keeps the original query.
      let query = dataset.query
      if (dataset.stage && db && supportsFileImport) {
        try {
          const localName = await stageRemoteTextFile(db, dataset.stage.url)
          if (localName) query = query.split(dataset.stage.url).join(localName)
        } catch (error) {
          console.error('Failed to stage demo dataset:', error)
          toast.error("Couldn't download the demo dataset. Check your connection and try again.")
          return
        }
      }

      const { createTab, updateTabChartConfig, executeQuery } = duckActions()
      const tabId = createTab('sql', query, dataset.name)
      if (!tabId) return
      if (dataset.chartConfig) updateTabChartConfig(tabId, dataset.chartConfig)
      // Auto-run so the user lands on populated results immediately.
      executeQuery(query, tabId).catch(console.error)
    } finally {
      openingDemo = null
    }
  }

  const card = 'group flex items-start gap-3 rounded-lg border border-edge bg-surface p-3 text-left transition-colors hover:border-edge-strong hover:bg-hover disabled:pointer-events-none disabled:opacity-60'
  const iconBox = 'flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-2 text-fg-3 group-hover:text-accent'
</script>

<div class="h-full overflow-auto">
  <div class="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-8">
    <header class="flex items-center gap-4">
      <ProfileAvatar avatarEmoji="logo" size="xl" />
      <div class="min-w-0">
        <h1 class="text-xl text-fg">
          {profile ? `Welcome back, ${profile.name}` : 'Welcome to Duck-UI'}
        </h1>
        <p class="text-[13px] text-fg-3">
          DuckDB in your browser. Your data never leaves this tab.
        </p>
      </div>
      <span class="ml-auto shrink-0 font-mono text-[11px] text-fg-4" title="Released {releaseDate}">v{version}</span>
    </header>

    <section>
      <h2 class="mb-2 text-xs font-medium text-fg-3">Quick start</h2>
      <div class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {#each quickStart as action}
          <button class={card} onclick={action.run}>
            <span class={iconBox}><action.icon size={16} /></span>
            <span class="min-w-0">
              <span class="block text-[13px] font-medium text-fg">{action.title}</span>
              <span class="mt-0.5 block text-xs leading-relaxed text-fg-3">{action.description}</span>
            </span>
          </button>
        {/each}
      </div>
    </section>

    <section>
      <h2 class="mb-2 text-xs font-medium text-fg-3">Try a dataset</h2>
      <div class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {#each demoDatasets as dataset (dataset.id)}
          <button class={card} disabled={openingDemo !== null} onclick={() => openDemo(dataset)}>
            <span class={iconBox}><Play size={14} class={openingDemo === dataset.id ? 'animate-pulse text-accent' : ''} /></span>
            <span class="min-w-0">
              <span class="block text-[13px] font-medium text-fg">{dataset.name}</span>
              <span class="mt-0.5 block text-xs leading-relaxed text-fg-3">{dataset.description}</span>
              <span class="mt-1.5 block text-[11px] text-fg-4">{dataset.rows} · {dataset.source}</span>
            </span>
          </button>
        {/each}
      </div>
    </section>

    <section>
      <h2 class="mb-2 text-xs font-medium text-fg-3">Resources</h2>
      <div class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {#each resources as item}
          <a class={card} href={item.link} target="_blank" rel="noopener noreferrer">
            <span class={iconBox}><item.icon size={16} /></span>
            <span class="min-w-0">
              <span class="flex items-center gap-1 text-[13px] font-medium text-fg">
                {item.title}
                <ArrowUpRight size={12} class="text-fg-4" />
              </span>
              <span class="mt-0.5 block text-xs leading-relaxed text-fg-3">{item.description}</span>
            </span>
          </a>
        {/each}
      </div>
    </section>

    <section>
      <h2 class="mb-2 text-xs font-medium text-fg-3">More from the author</h2>
      <div class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {#each products as item}
          <a class={card} href={item.link} target="_blank" rel="noopener noreferrer">
            <span class={iconBox}><item.icon size={16} /></span>
            <span class="min-w-0">
              <span class="flex items-center gap-1 text-[13px] font-medium text-fg">
                {item.title}
                <ArrowUpRight size={12} class="text-fg-4" />
              </span>
              <span class="mt-0.5 block text-xs leading-relaxed text-fg-3">{item.description}</span>
            </span>
          </a>
        {/each}
      </div>
    </section>
  </div>
</div>
