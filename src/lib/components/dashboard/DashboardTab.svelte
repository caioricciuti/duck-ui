<script lang="ts">
  import { onDestroy, untrack } from 'svelte'
  import { createSubscriber } from 'svelte/reactivity'
  import type { Extension } from '@codemirror/state'
  import { Copy, Eye, Pencil, RefreshCw, Share2, Timer } from 'lucide-svelte'
  import Button from '../common/Button.svelte'
  import Input from '../common/Input.svelte'
  import Select from '../common/Select.svelte'
  import { duck, duckActions } from '../../stores/duck.svelte'
  import {
    datasetsFor,
    getDashboardInputs,
    getDashboardRunner,
    isDashboardEditing,
  } from '@/store/slices/dashboardSlice'
  import { datasetCacheKey, type DatasetResult } from '@/services/dashboard/queryRunner'
  import { parseDashboardSource } from '@/services/dashboard/markdown'
  import type { InputValue } from '@/services/dashboard/inputs'
  import {
    decideRefresh,
    formatRefreshInterval,
    formatRelativeTime,
    latestFetchedAt,
    parseRefreshParam,
    REFRESH_INTERVAL_OPTIONS,
  } from '@/services/dashboard/refresh'
  import DashboardSourceEditor from './DashboardSourceEditor.svelte'
  import { collaborativeBinding } from '@/lib/editor/collaboration'
  import { getCollaboration } from '@/store/slices/sessionSlice'
  import MarkdownDashboard from './MarkdownDashboard.svelte'
  import ShareDashboardDialog from './ShareDashboardDialog.svelte'

  /**
   * A dashboard document, as a workspace tab.
   *
   * View renders the document like a report. Edit is a split pane: markdown
   * source on the left, the live document on the right, re-rendered as you type.
   * The source is what persists and what a live session shares. The document IS
   * the dashboard.
   */
  interface Props {
    tabId: string
    /** Opens the workspace level Share Live flow from the share sheet. */
    onsharelive?: () => void
  }

  let { tabId, onsharelive }: Props = $props()

  const uid = $props.id()

  const SAVE_DEBOUNCE_MS = 600
  const SPLIT_KEY = 'duck-ui-dashboard-split-percent'
  const MIN_SPLIT = 25
  const MAX_SPLIT = 75

  /** Shared empty snapshots, so an unknown dashboard reads as stable values. */
  const EMPTY_RESULTS: ReadonlyMap<string, DatasetResult> = new Map()
  const EMPTY_INPUTS: ReadonlyMap<string, InputValue> = new Map()

  const tab = $derived(duck((s) => s.tabs.find((entry) => entry.id === tabId)))
  const dashboardId = $derived(typeof tab?.content === 'string' ? tab.content : '')
  const dashboard = $derived(duck((s) => s.dashboards.find((entry) => entry.id === dashboardId)))
  // Per dashboard: every open tab stays mounted, so a shared flag would put
  // all of them in edit mode at once.
  const isEditing = $derived(duck((s) => isDashboardEditing(s, dashboardId)))
  const engineReady = $derived(duck((s) => s.isInitialized))
  const canEdit = $derived(dashboard?.role !== 'viewer')

  let refreshing = $state(false)
  let shareOpen = $state(false)
  // The draft leads while typing; the store catches up on a debounce. Null
  // means "no local edits pending" and the stored source is authoritative.
  let draft = $state<string | null>(null)
  const source = $derived(draft ?? dashboard?.source ?? '')
  const parsed = $derived(parseDashboardSource(source))
  const hasQueries = $derived(parsed.queries.length > 0)

  /**
   * In a live session the source editor is bound to the dashboard's shared
   * text. Registered on first edit in a session, so a dashboard opened
   * mid-session becomes co-editable too.
   */
  const sessionStatus = $derived(duck((s) => s.session.status))
  let collabExtensions = $state.raw<Extension[]>([])

  $effect(() => {
    const id = dashboardId
    if (sessionStatus !== 'connected' || !id || !isEditing) return
    const collaboration = getCollaboration()
    if (!collaboration) return

    const { name, text: initial } = untrack(() => ({ name: dashboard?.name ?? '', text: source }))
    collaboration.document.ensureDashboard(id, name, initial)
    const text = collaboration.document.dashboardText(id)
    if (!text) return

    collabExtensions = [collaborativeBinding({ text, presence: collaboration.presence, tabId: `dashboard:${tabId}` })]
    return () => {
      collabExtensions = []
    }
  })

  // Results come from the runner, not the store: a refresh must not push
  // every batch through a store subscription.
  const watchResults = $derived.by(() => {
    const id = dashboardId
    return id ? createSubscriber((update) => getDashboardRunner(id).onChange(() => update())) : null
  })
  const results = $derived.by(() => {
    if (!dashboardId || !watchResults) return EMPTY_RESULTS
    watchResults()
    return getDashboardRunner(dashboardId).snapshot()
  })

  // Input values, same pattern: view state living beside the runner.
  const inputs = $derived(dashboardId ? getDashboardInputs(dashboardId) : undefined)
  const watchInputs = $derived.by(() => {
    const store = inputs
    return store ? createSubscriber((update) => store.subscribe(update)) : null
  })
  const inputValues = $derived.by(() => {
    if (!inputs || !watchInputs) return EMPTY_INPUTS
    watchInputs()
    return inputs.snapshot()
  })

  // Debounced persistence of edits.
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  let pendingSave: string | null = null
  let destroyed = false

  function persist() {
    clearTimeout(saveTimer)
    saveTimer = undefined
    const value = pendingSave
    pendingSave = null
    if (value === null) return
    const current = duckActions().dashboards.find((entry) => entry.id === dashboardId)
    if (current && current.source !== value) void duckActions().updateDashboard({ ...current, source: value })
    // The store has the text now. Letting go of the draft is what lets a
    // change from outside (Add to dashboard, a remote edit) show up here.
    if (draft === value) draft = null
  }

  function handleSourceChange(value: string) {
    pendingSave = value
    // The editor reports its last edits while it is being torn down. With
    // the tab itself closing there is no later, so save right away.
    if (destroyed) {
      persist()
      return
    }
    draft = value
    clearTimeout(saveTimer)
    saveTimer = setTimeout(persist, SAVE_DEBOUNCE_MS)
  }

  onDestroy(() => {
    destroyed = true
    persist()
  })

  // Run whatever the document declares, whenever the set of queries changes.
  // Keyed on name+sql: editing a query re-runs it, editing prose does not.
  // `engineReady` is a dependency for the reload path: a restored dashboard
  // tab renders BEFORE the WASM engine finishes booting, so the first run
  // fails with "connection not available", and without re-running when the
  // engine arrives, it would stay failed forever.
  const querySignature = $derived(parsed.queries.map((query) => `${query.name}:${query.sql}`).join(' '))
  const hasDashboard = $derived(dashboard !== undefined)
  const lastRunKeys = new Map<string, string>()
  $effect(() => {
    const values = inputValues
    const id = dashboardId
    if (!engineReady || !id || !hasDashboard || querySignature === '') return
    untrack(() => {
      if (!dashboard) return
      const runner = getDashboardRunner(id)
      // Only datasets whose FINAL SQL changed re-run. Turning a date picker must
      // re-run the queries that reference it and leave the rest untouched.
      for (const dataset of datasetsFor({ ...dashboard, source }, values)) {
        const key = datasetCacheKey(dataset)
        if (lastRunKeys.get(dataset.id) === key) continue
        lastRunKeys.set(dataset.id, key)
        void runner.run(dataset)
      }
    })
  })

  // Auto-refresh
  // `?refresh=<seconds>` on the page URL is a kiosk override: it applies to
  // every dashboard opened in this page load and is never persisted. Picking
  // an interval in the toolbar drops the override and saves the choice.
  let urlRefresh = $state(parseRefreshParam(window.location.search))
  const intervalSeconds = $derived(
    !hasQueries || !engineReady ? 0 : (urlRefresh ?? dashboard?.refreshIntervalSeconds ?? 0),
  )

  let hidden = $state(document.visibilityState === 'hidden')
  $effect(() => {
    const onVisibility = () => (hidden = document.visibilityState === 'hidden')
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  })

  const anyLoading = $derived([...results.values()].some((result) => result.status === 'loading'))
  const inFlight = $derived(refreshing || anyLoading)
  // Completed-refresh time, including ones where every query failed (those
  // carry no fetchedAt, but still count as "we tried" for scheduling).
  let lastAttemptAt = $state<number | null>(null)
  const lastFetchedAt = $derived(latestFetchedAt(results.values()))
  const lastRefreshedAt = $derived(
    lastAttemptAt === null
      ? lastFetchedAt
      : lastFetchedAt === null
        ? lastAttemptAt
        : Math.max(lastAttemptAt, lastFetchedAt),
  )

  async function refreshAll() {
    if (!dashboardId || refreshing) return
    refreshing = true
    try {
      await duckActions().runDashboard(dashboardId, true)
    } finally {
      refreshing = false
      lastAttemptAt = Date.now()
    }
  }

  // One timer at a time, re-armed whenever any input to the decision changes.
  // `wake` bumps when a wait elapses so the decision is re-evaluated.
  let wake = $state(0)
  $effect(() => {
    void wake
    const decision = decideRefresh({
      intervalSeconds,
      // Enabling the interval before anything has loaded anchors on "now".
      lastRefreshedAt,
      now: Date.now(),
      hidden,
      inFlight,
    })
    if (decision.action === 'idle') return
    const timer = setTimeout(
      () => {
        if (decision.action === 'refresh') void refreshAll()
        else wake += 1
      },
      decision.action === 'refresh' ? 0 : decision.delayMs,
    )
    return () => clearTimeout(timer)
  })

  // Anchor the first scheduled run when the interval turns on with nothing
  // loaded yet, so it fires one interval later rather than never.
  $effect(() => {
    if (intervalSeconds <= 0 || lastRefreshedAt !== null) return
    const timer = setTimeout(() => (lastAttemptAt = Date.now()), 0)
    return () => clearTimeout(timer)
  })

  // Keeps the "updated ... ago" label moving without re-rendering per second.
  let now = $state(Date.now())
  $effect(() => {
    if (lastRefreshedAt === null) return
    const update = () => (now = Date.now())
    const timer = setInterval(update, 15_000)
    const initial = setTimeout(update, 0)
    return () => {
      clearInterval(timer)
      clearTimeout(initial)
    }
  })

  const selectedInterval = $derived(urlRefresh ?? dashboard?.refreshIntervalSeconds ?? 0)
  const intervalOptions = $derived(
    // An interval from a link may not be one of the presets.
    (REFRESH_INTERVAL_OPTIONS.some((option) => option.seconds === selectedInterval)
      ? REFRESH_INTERVAL_OPTIONS
      : [...REFRESH_INTERVAL_OPTIONS, { seconds: selectedInterval, label: '' }]
    ).map((option) => ({
      value: String(option.seconds),
      label: option.seconds === 0 ? 'Auto-refresh off' : `Every ${formatRefreshInterval(option.seconds)}`,
    })),
  )

  function handleIntervalChange(value: string) {
    if (!dashboard) return
    urlRefresh = null
    const seconds = Number(value)
    void duckActions().updateDashboard({
      ...dashboard,
      refreshIntervalSeconds: seconds > 0 ? seconds : undefined,
    })
  }

  function rename(name: string) {
    if (dashboard) void duckActions().updateDashboard({ ...dashboard, name })
  }

  async function saveEditableCopy() {
    if (!dashboard) return
    const copy = await duckActions().duplicateDashboard(dashboard.id)
    if (copy) duckActions().openDashboardTab(copy.id, copy.name)
  }

  // Split pane
  let splitEl: HTMLDivElement | undefined = $state()
  let resizing = $state(false)
  const savedSplit = parseFloat(localStorage.getItem(SPLIT_KEY) ?? '')
  let splitPercent = $state(Number.isNaN(savedSplit) ? 50 : savedSplit)

  function clampSplit(value: number): number {
    return Math.max(MIN_SPLIT, Math.min(MAX_SPLIT, value))
  }

  function onResizeStart(e: MouseEvent) {
    e.preventDefault()
    resizing = true
    document.addEventListener('mousemove', onResizeMove)
    document.addEventListener('mouseup', onResizeEnd)
  }

  function onResizeMove(e: MouseEvent) {
    if (!splitEl) return
    const rect = splitEl.getBoundingClientRect()
    splitPercent = clampSplit(((e.clientX - rect.left) / rect.width) * 100)
  }

  function onResizeEnd() {
    resizing = false
    localStorage.setItem(SPLIT_KEY, splitPercent.toFixed(1))
    document.removeEventListener('mousemove', onResizeMove)
    document.removeEventListener('mouseup', onResizeEnd)
  }

  function onResizeKey(e: KeyboardEvent) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    splitPercent = clampSplit(splitPercent + (e.key === 'ArrowLeft' ? -2 : 2))
    localStorage.setItem(SPLIT_KEY, splitPercent.toFixed(1))
  }

  onDestroy(() => {
    document.removeEventListener('mousemove', onResizeMove)
    document.removeEventListener('mouseup', onResizeEnd)
  })
</script>

{#if !dashboard}
  <div class="flex h-full flex-col items-center justify-center gap-1">
    <p class="text-[13px] text-fg-2">This dashboard is not available.</p>
    <p class="text-xs text-fg-3">It may still be loading, or it was deleted.</p>
  </div>
{:else}
  <div class="flex h-full flex-col">
    <div class="flex min-h-10 shrink-0 flex-wrap items-center gap-2 border-b border-edge-subtle px-3 py-1.5">
      <div class="min-w-0 flex-1">
        {#if isEditing && canEdit}
          <label class="sr-only" for="{uid}-name">Dashboard name</label>
          <Input
            id="{uid}-name"
            size="sm"
            class="max-w-xs font-medium"
            value={dashboard.name}
            oninput={(e) => rename(e.currentTarget.value)}
          />
        {:else}
          <p class="truncate text-[13px] font-medium text-fg">{parsed.title ?? dashboard.name}</p>
        {/if}
      </div>

      {#if lastRefreshedAt !== null && hasQueries}
        <span class="text-xs text-fg-3" title={new Date(lastRefreshedAt).toLocaleString()}>
          {hidden && intervalSeconds > 0 ? 'Paused · ' : ''}Updated {formatRelativeTime(lastRefreshedAt, Math.max(now, lastRefreshedAt))}
        </span>
      {/if}

      <div class="flex items-center gap-1" title="Auto-refresh (paused while this tab is hidden)">
        <Timer size={13} class="text-fg-3" />
        <label class="sr-only" for="{uid}-interval">Auto-refresh interval</label>
        <Select
          id="{uid}-interval"
          size="sm"
          class="w-36"
          value={String(selectedInterval)}
          options={intervalOptions}
          onchange={handleIntervalChange}
        />
      </div>

      <Button size="sm" variant="outline" onclick={refreshAll} disabled={!hasQueries} loading={refreshing}>
        {#if !refreshing}<RefreshCw size={13} />{/if}
        Refresh all
      </Button>

      <Button size="sm" variant="outline" onclick={() => (shareOpen = true)}>
        <Share2 size={13} />
        Share
      </Button>

      {#if !canEdit}
        <!-- Read-only is a workflow signal, not a lock: the document lives in
             this browser. Offer the honest path to editing, an owned copy. -->
        <Button size="sm" variant="outline" onclick={saveEditableCopy}>
          <Copy size={13} />
          Save editable copy
        </Button>
      {:else}
        <Button
          size="sm"
          variant={isEditing ? 'primary' : 'outline'}
          onclick={() => duckActions().setDashboardEditing(!isEditing, dashboardId)}
        >
          {#if isEditing}<Eye size={13} />{:else}<Pencil size={13} />{/if}
          {isEditing ? 'Done' : 'Edit'}
        </Button>
      {/if}
    </div>

    <div class="min-h-0 flex-1">
      {#if isEditing && canEdit}
        <div bind:this={splitEl} class="flex h-full min-w-0">
          <div class="min-w-0" style="width: {splitPercent}%">
            <DashboardSourceEditor
              value={source}
              onchange={handleSourceChange}
              {collabExtensions}
              ariaLabel="Source of {dashboard.name}"
            />
          </div>

          <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <div
            class="group/split flex w-1 shrink-0 cursor-col-resize items-center justify-center transition-colors hover:bg-active focus-visible:bg-active focus-visible:outline-none {resizing ? 'bg-accent/60' : 'bg-edge-subtle'}"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize source and preview"
            aria-valuemin={MIN_SPLIT}
            aria-valuemax={MAX_SPLIT}
            aria-valuenow={Math.round(splitPercent)}
            tabindex="0"
            onmousedown={onResizeStart}
            ondblclick={() => (splitPercent = 50)}
            onkeydown={onResizeKey}
          >
            <div class="h-8 w-0.5 rounded-full transition-colors {resizing ? 'bg-accent' : 'bg-edge-strong group-hover/split:bg-accent/60'}"></div>
          </div>

          <div class="min-w-0 flex-1 overflow-auto">
            <MarkdownDashboard blocks={parsed.blocks} {results} {inputs} {inputValues} />
          </div>
        </div>
      {:else}
        <div class="h-full overflow-auto">
          <MarkdownDashboard blocks={parsed.blocks} {results} {inputs} {inputValues} />
        </div>
      {/if}
    </div>
  </div>

  <ShareDashboardDialog
    open={shareOpen}
    onclose={() => (shareOpen = false)}
    {dashboard}
    onsharelive={onsharelive
      ? () => {
          shareOpen = false
          onsharelive()
        }
      : undefined}
  />

  {#if resizing}
    <div class="fixed inset-0 z-50 cursor-col-resize"></div>
  {/if}
{/if}
