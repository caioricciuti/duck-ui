<script lang="ts">
  import { BadgeCheck, ChartColumn, Check, CodeXml, Info, Link2, Play, SlidersHorizontal } from 'lucide-svelte'
  import Sheet from '../common/Sheet.svelte'
  import Tabs from '../common/Tabs.svelte'
  import Input from '../common/Input.svelte'
  import Select from '../common/Select.svelte'
  import CopyField from './CopyField.svelte'
  import * as toast from '../../stores/toast.svelte'
  import { buildShareLinks, queryReproducesForViewers, type ShareLinks, type SharedParam } from '@/lib/share'
  import { buildDeepLink, buildBadgeMarkdown, extractRemoteSources, inferFormat, type SourceFormat } from '@/lib/deepLink'
  import type { EditorTab } from '@/store/types'

  interface Props {
    open: boolean
    onclose: () => void
    /** The tab to share. Null while nothing is selected. */
    tab: EditorTab | null
  }

  /*
   * Visible share experience: builds the link and embed snippet, shows
   * exactly what travels (query and chart config, encoded in the URL, nothing
   * is uploaded), and lets the user copy either. Flags when the analysis reads
   * local-only data and therefore won't reproduce for a viewer.
   */
  let { open, onclose, tab }: Props = $props()

  type ParamType = SharedParam['type']
  type CopyTarget = 'link' | 'iframe' | 'deep' | 'badge'

  const NUMERIC_TYPE = /int|float|double|decimal|hugeint|numeric|real/i
  const SECTIONS = [
    { id: 'link', label: 'Link', icon: Link2 },
    { id: 'embed', label: 'Embed', icon: CodeXml },
    { id: 'badge', label: 'Badge', icon: BadgeCheck },
  ]
  const PARAM_TYPES: { value: ParamType; label: string }[] = [
    { value: 'select', label: 'Dropdown' },
    { value: 'search', label: 'Search' },
    { value: 'range', label: 'Range' },
  ]
  const BADGE_FORMATS: { value: SourceFormat; label: string }[] = [
    { value: 'parquet', label: 'Parquet' },
    { value: 'csv', label: 'CSV' },
    { value: 'json', label: 'JSON' },
    { value: 'duckdb', label: 'DuckDB' },
  ]

  const uid = $props.id()

  let section = $state('link')
  let links = $state<ShareLinks | null>(null)
  let building = $state(false)
  let copied = $state<CopyTarget | null>(null)
  let params = $state.raw<SharedParam[]>([])
  let badgeDataUrl = $state<string | null>(null)
  let badgeFormat = $state<SourceFormat>('parquet')

  const tabId = $derived(tab?.id)
  const hasChart = $derived(!!tab?.chartConfig)
  const sql = $derived(typeof tab?.content === 'string' ? tab.content : '')
  const reproduces = $derived(sql ? queryReproducesForViewers(sql) : true)

  // "Open in Duck-UI" badge: prefill data URLs from the query itself.
  const detectedSources = $derived(extractRemoteSources(sql))
  const badgeInput = $derived(badgeDataUrl ?? detectedSources.join(', '))
  const dataUrls = $derived(
    badgeInput
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  )
  // Derive from the build base, not the current path: /a share links would
  // otherwise produce /a/badge.svg and /a/?load=... URLs.
  const appOrigin = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}`
  // Extension-less URLs (common on R2) need an explicit format or openers
  // get a link that silently does nothing.
  const needsFormat = $derived(dataUrls.some((url) => !inferFormat(url)))
  const deepLink = $derived(
    dataUrls.length > 0
      ? buildDeepLink(`${appOrigin}/`, dataUrls, sql, { format: needsFormat ? badgeFormat : undefined })
      : null,
  )
  const badgeMarkdown = $derived(deepLink ? buildBadgeMarkdown(deepLink, appOrigin) : null)

  // Result columns available to expose as interactive embed filters.
  const columns = $derived.by(() => {
    const names = tab?.result?.columns ?? []
    const types = tab?.result?.columnTypes ?? []
    return names.map((name, i) => ({ name, type: types[i] ?? '' }))
  })

  // A different tab, or the sheet opening again, starts from a clean slate.
  $effect(() => {
    void tabId
    void open
    params = []
    links = null
    copied = null
    badgeDataUrl = null
    section = 'link'
  })

  $effect(() => {
    if (!open || !tab) {
      building = false
      return
    }
    let cancelled = false
    building = true
    buildShareLinks(tab, true, params)
      .then((built) => {
        if (!cancelled) links = built
      })
      .catch((err) => {
        console.error('Failed to build share link:', err)
        if (!cancelled) toast.error('Failed to build share link')
      })
      .finally(() => {
        if (!cancelled) building = false
      })
    return () => {
      cancelled = true
    }
  })

  function toggleParam(column: string, type: string) {
    if (params.some((p) => p.column === column)) {
      params = params.filter((p) => p.column !== column)
      return
    }
    const defaultType: ParamType = NUMERIC_TYPE.test(type) ? 'range' : 'select'
    params = [...params, { column, type: defaultType }]
  }

  function setParamType(column: string, type: ParamType) {
    params = params.map((p) => (p.column === column ? { ...p, type } : p))
  }

  async function copy(text: string, which: CopyTarget) {
    try {
      await navigator.clipboard.writeText(text)
      copied = which
      toast.success(which === 'link' ? 'Link copied to clipboard' : 'Embed snippet copied')
      setTimeout(() => (copied = null), 2000)
    } catch {
      toast.error("Couldn't copy. Select the text and copy manually")
    }
  }
</script>

{#snippet chip(Icon: typeof Check, text: string)}
  <span class="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-accent">
    <Icon size={12} />
    {text}
  </span>
{/snippet}

<Sheet
  {open}
  {onclose}
  title="Share this analysis"
  description="Anyone who opens this gets the query and chart, reconstructed in their browser. No server, no signup."
>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap gap-2 text-xs">
      {@render chip(Check, 'SQL query')}
      {#if hasChart}{@render chip(ChartColumn, 'Chart config')}{/if}
      {@render chip(Play, 'Auto-runs on open')}
      {#if params.length > 0}
        {@render chip(SlidersHorizontal, `${params.length} filter${params.length > 1 ? 's' : ''}`)}
      {/if}
    </div>

    <Tabs items={SECTIONS} value={section} onchange={(id) => (section = id)} size="sm" />

    {#if section === 'link'}
      <div class="flex flex-col gap-2" role="tabpanel" aria-label="Link">
        <CopyField
          label="share link"
          value={building ? 'Building link...' : (links?.appUrl ?? '')}
          busy={building || !links}
          copied={copied === 'link'}
          oncopy={() => links && copy(links.appUrl, 'link')}
        />
        <p class="text-xs text-fg-3">Share in chat or social. It opens the full Duck-UI editor.</p>
      </div>
    {:else if section === 'embed'}
      <div class="flex flex-col gap-3" role="tabpanel" aria-label="Embed">
        <div class="flex flex-col gap-1.5">
          <p class="text-xs font-medium text-fg-2">iframe, works anywhere</p>
          <CopyField
            label="iframe snippet"
            rows={3}
            value={building ? 'Building snippet...' : (links?.iframeSnippet ?? '')}
            busy={building || !links}
            copied={copied === 'iframe'}
            oncopy={() => links && copy(links.iframeSnippet, 'iframe')}
          />
          <p class="text-xs text-fg-3">
            Paste into any HTML page, Notion, or Ghost: a live, read-only DuckDB chart that runs entirely in the
            viewer's browser.
          </p>
        </div>

        <!-- Interactive filters: turn result columns into embed controls. -->
        {#if columns.length > 0}
          <div class="flex flex-col gap-2 border-t border-edge-subtle pt-3">
            <div class="flex items-center gap-2">
              <SlidersHorizontal size={14} class="text-fg-3" />
              <p class="text-xs font-medium text-fg-2">Interactive filters (optional)</p>
            </div>
            <p class="text-xs text-fg-3">
              Let viewers filter the embed live. Pick result columns to expose as controls.
            </p>
            <div class="max-h-40 divide-y divide-edge-subtle overflow-auto rounded-md border border-edge-subtle">
              {#each columns as col (col.name)}
                {@const active = params.find((p) => p.column === col.name)}
                <div class="flex min-h-9 items-center justify-between gap-2 px-2.5 py-1">
                  <label class="ds-checkbox-label min-w-0">
                    <input
                      type="checkbox"
                      class="ds-checkbox"
                      checked={!!active}
                      onchange={() => toggleParam(col.name, col.type)}
                    />
                    <span class="truncate font-mono text-xs">{col.name}</span>
                  </label>
                  {#if active}
                    <label class="sr-only" for="{uid}-param-{col.name}">Control for {col.name}</label>
                    <Select
                      id="{uid}-param-{col.name}"
                      size="sm"
                      class="w-28 shrink-0"
                      value={active.type}
                      options={PARAM_TYPES}
                      onchange={(value) => setParamType(col.name, value as ParamType)}
                    />
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {:else}
      <div class="flex flex-col gap-3" role="tabpanel" aria-label="Badge">
        <p class="text-xs text-fg-3">
          An <strong class="font-medium text-fg-2">Open in Duck-UI</strong> link loads remote data and this query in
          one click. Paste the badge into a dataset README or blog post. Openers see a confirmation before anything
          runs.
        </p>
        <div class="flex flex-col gap-1.5">
          <label class="text-xs font-medium text-fg-2" for="{uid}-urls">Data URL(s), comma separated</label>
          <Input
            id="{uid}-urls"
            size="sm"
            mono
            value={badgeInput}
            placeholder="https://example.com/data.parquet"
            oninput={(e) => (badgeDataUrl = e.currentTarget.value)}
          />
          {#if detectedSources.length === 0 && !badgeDataUrl}
            <p class="text-xs text-fg-3">
              This query doesn't read from a URL yet. Point it at hosted data (with CORS enabled) so the link
              reproduces for anyone.
            </p>
          {/if}
          {#if needsFormat}
            <div class="flex items-center gap-2 text-xs">
              <label class="text-fg-3" for="{uid}-format">
                A URL has no file extension. Pick its format so the link works:
              </label>
              <Select id="{uid}-format" size="sm" class="w-28 shrink-0" bind:value={badgeFormat} options={BADGE_FORMATS} />
            </div>
          {/if}
        </div>
        {#if deepLink && badgeMarkdown}
          <div class="flex flex-col gap-1.5">
            <p class="text-xs font-medium text-fg-2">Deep link</p>
            <CopyField
              label="deep link"
              value={deepLink}
              copied={copied === 'deep'}
              oncopy={() => copy(deepLink, 'deep')}
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <p class="text-xs font-medium text-fg-2">Markdown badge</p>
            <CopyField
              label="markdown badge"
              value={badgeMarkdown}
              copied={copied === 'badge'}
              oncopy={() => copy(badgeMarkdown, 'badge')}
            />
            <p class="text-xs text-fg-3">
              Renders as
              <img src="{import.meta.env.BASE_URL}badge.svg" alt="Open in Duck-UI" class="inline h-4 align-text-bottom" />
            </p>
          </div>
        {/if}
      </div>
    {/if}

    <!-- Data caveat: a strong warning when the query reads local-only data. -->
    {#if reproduces}
      <div class="flex items-start gap-2 rounded-md border border-edge-subtle bg-surface-2 p-3 text-xs text-fg-2">
        <Info size={14} class="mt-0.5 shrink-0 text-info" />
        <p>
          The link carries the query, not the data. This one reads from a URL, so it reproduces fully for anyone who
          opens it.
        </p>
      </div>
    {:else}
      <div class="flex items-start gap-2 rounded-md bg-danger-soft p-3 text-xs text-danger" role="alert">
        <Info size={14} class="mt-0.5 shrink-0" />
        <p>
          Heads up: this query reads a <strong class="font-medium">locally-imported table</strong>, so it won't
          reproduce for viewers. To make a shareable or embeddable analysis, read from a URL instead, for example
          <code class="mx-0.5 font-mono">read_parquet('https://...')</code>.
        </p>
      </div>
    {/if}
  </div>
</Sheet>
