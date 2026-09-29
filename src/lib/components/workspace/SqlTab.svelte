<script lang="ts">
  import { untrack } from 'svelte'
  import type { Extension } from '@codemirror/state'
  import { Play, Square, ListTree, WandSparkles, Pin, GitCompare, Keyboard, Brain, Sparkles, Bookmark, Share2, LayoutDashboard, ChartColumn, Map as MapIcon } from 'lucide-svelte'
  import Button from '../common/Button.svelte'
  import Tooltip from '../common/Tooltip.svelte'
  import CodeEditor from '../editor/CodeEditor.svelte'
  import QueryParamsBar from '../editor/QueryParamsBar.svelte'
  import ResultPanel from '../editor/ResultPanel.svelte'
  import ExplainPlanViewer from '../editor/ExplainPlanViewer.svelte'
  import ResultCompareDialog from '../editor/ResultCompareDialog.svelte'
  import ChartView from '../charts/ChartView.svelte'
  import Spinner from '../common/Spinner.svelte'
  import AddToDashboardDialog from '../dashboard/AddToDashboardDialog.svelte'
  import ShareDialog from '../share/ShareDialog.svelte'
  import SaveQueryDialog from '../saved-queries/SaveQueryDialog.svelte'
  import BrainResultActions from '../duck-brain/BrainResultActions.svelte'
  import { duck, duckActions } from '../../stores/duck.svelte'
  import * as toast from '../../stores/toast.svelte'
  import { listParameterNames, missingParamsMessage, resolveQueryParams } from '@/lib/sqlParams'
  import { extractPlanText } from '@/lib/explainPlan'
  import { PIN_ROW_LIMIT } from '@/lib/resultDiff'
  import { getUiConfig } from '@/lib/appConfig'
  import { findGeometryColumns } from '@/lib/geoResult'
  import { isNumericColumn } from '@/lib/chartDataTransform'
  import { collaborativeBinding } from '@/lib/editor/collaboration'
  import { getCollaboration } from '@/store/slices/sessionSlice'
  import type { EditorTab } from '@/store/types'

  interface Props {
    tabId: string
  }

  let { tabId }: Props = $props()

  const SPLIT_KEY = 'duck-ui-split-percent'
  const MIN_SPLIT = 15
  const MAX_SPLIT = 85
  const isMac = /Mac/.test(navigator.platform)
  const mod = isMac ? '⌘' : 'Ctrl'

  const tab = $derived(duck((s) => s.tabs.find((t) => t.id === tabId)))
  const sqlText = $derived(typeof tab?.content === 'string' ? tab.content : '')
  const executing = $derived(duck((s) => !!s.executingTabs[tabId]))
  const progress = $derived(duck((s) => s.queryProgress[tabId]))
  const pinCount = $derived(duck((s) => s.resultPins.length))
  const paramNames = $derived(listParameterNames(sqlText))
  const brainOpen = $derived(duck((s) => s.duckBrain.isPanelOpen))
  const ui = getUiConfig()
  // Cheap: a scan of the column types, not the rows.
  const geometryColumns = $derived(tab?.result && !tab.result.error ? findGeometryColumns(tab.result) : [])
  // A rerun without a GEOMETRY column drops the Map view; the panel falls back to the table.
  const extraViews = $derived([
    { id: 'charts', label: 'Charts', icon: ChartColumn },
    ...(geometryColumns.length > 0 ? [{ id: 'map', label: 'Map', icon: MapIcon }] : []),
  ])

  let editor: CodeEditor | undefined = $state()
  let containerEl: HTMLDivElement | undefined = $state()
  let resultView = $state('table')
  let explainOpen = $state(false)
  let explainText = $state('')
  let explaining = $state(false)
  let compareOpen = $state(false)
  let resizing = $state(false)
  let fixing = $state(false)
  let saveOpen = $state(false)
  let addToDashboardOpen = $state(false)
  let shareTab = $state<EditorTab | null>(null)

  const sessionStatus = $derived(duck((s) => s.session.status))
  // Raw and replaced as a whole: the editor reconfigures when the array
  // identity changes, which would tear the binding down on every render.
  let collabExtensions = $state.raw<Extension[]>([])

  // Collaborative binding: attaches only while a session is live, so a solo
  // Duck-UI pays nothing for it.
  $effect(() => {
    if (sessionStatus !== 'connected') return
    const collaboration = getCollaboration()
    if (!collaboration) return

    // The tab must exist in shared state before it can be bound; a tab created
    // locally mid-session would otherwise never reach the other person.
    const { title, content } = untrack(() => ({
      title: tab?.title ?? '',
      content: editor?.getValue() ?? sqlText,
    }))
    collaboration.document.addTab({ id: tabId, title, type: 'sql' }, content)
    const text = collaboration.document.textFor(tabId)
    if (!text) return

    collabExtensions = [collaborativeBinding({ text, presence: collaboration.presence, tabId })]
    return () => {
      collabExtensions = []
    }
  })

  function share() {
    const query = currentSql()
    if (!query || !tab) {
      toast.error('No query to share')
      return
    }
    // The live editor text plus the tab's chart config. The result rides
    // along so the dialog can offer its columns as embed filters.
    shareTab = { id: tabId, title: tab.title || 'Shared Query', type: 'sql', content: query, chartConfig: tab.chartConfig, result: tab.result ?? null }
  }
  const profileId = $derived(duck((s) => s.currentProfileId))

  const savedSplit = parseFloat(localStorage.getItem(SPLIT_KEY) ?? '')
  let splitPercent = $state(Number.isNaN(savedSplit) ? 45 : savedSplit)

  function currentSql(): string {
    return (editor?.getValue() ?? sqlText).trim()
  }

  async function run(sql: string) {
    if (executing) return
    if (!sql) {
      toast.warning('Write a query first')
      return
    }
    try {
      await duckActions().executeQuery(sql, tabId)
    } catch (error) {
      console.error('Query execution failed:', error)
      toast.error('Query execution failed')
    }
  }

  async function cancel() {
    try {
      await duckActions().cancelQuery(tabId)
      toast.info('Query cancelled')
    } catch (error) {
      console.error('Failed to cancel query:', error)
    }
  }

  async function explain() {
    const query = currentSql()
    if (!query || executing) return

    // Running without a tab id (below) skips executeQuery's parameter step,
    // so resolve `$name` placeholders here with this tab's values.
    const resolved = resolveQueryParams(query, tab?.queryParams)
    if (resolved.sql === null) {
      toast.error(missingParamsMessage(resolved.missing))
      return
    }

    explaining = true
    try {
      // No tab id, so the plan is returned without replacing the tab's result.
      const result = await duckActions().executeQuery(`EXPLAIN ANALYZE ${resolved.sql}`)
      if (result?.error) {
        toast.error(result.error)
      } else if (result && result.data.length > 0) {
        explainText = extractPlanText(result.data)
        explainOpen = true
      }
    } catch (error) {
      console.error('Explain failed:', error)
      toast.error('Explain query failed')
    } finally {
      explaining = false
    }
  }

  async function fixWithBrain() {
    const error = tab?.result?.error
    if (!error || !sqlText) return
    fixing = true
    try {
      const { buildFixQueryRequest } = await import('@/lib/duckBrain')
      const fixed = await duckActions().generateSQL(buildFixQueryRequest(sqlText, error))
      if (fixed) {
        duckActions().updateTabQuery(tabId, fixed)
        toast.success('Duck Brain suggested a fix. Review it and run again')
      }
    } finally {
      fixing = false
    }
  }

  function pinResult() {
    if (!tab?.result || tab.result.error) return
    const pin = duckActions().pinResult(tabId, sqlText, tab.result)
    const { rows, sourceRowCount, truncated } = pin.snapshot
    if (truncated) {
      toast.warning(
        `Pinned ${rows.length.toLocaleString()} of ${sourceRowCount.toLocaleString()} rows. ` +
          (rows.length >= PIN_ROW_LIMIT
            ? `Pins keep at most ${PIN_ROW_LIMIT.toLocaleString()}`
            : 'The result itself was truncated'),
      )
    } else {
      toast.success(`Pinned ${rows.length.toLocaleString()} rows for comparison`)
    }
  }

  function onResizeStart(e: MouseEvent) {
    e.preventDefault()
    resizing = true
    document.addEventListener('mousemove', onResizeMove)
    document.addEventListener('mouseup', onResizeEnd)
  }

  function onResizeMove(e: MouseEvent) {
    if (!containerEl) return
    const rect = containerEl.getBoundingClientRect()
    splitPercent = Math.max(MIN_SPLIT, Math.min(MAX_SPLIT, ((e.clientY - rect.top) / rect.height) * 100))
  }

  function onResizeEnd() {
    resizing = false
    localStorage.setItem(SPLIT_KEY, splitPercent.toFixed(1))
    document.removeEventListener('mousemove', onResizeMove)
    document.removeEventListener('mouseup', onResizeEnd)
  }
</script>

{#if tab && tab.type === 'sql'}
  <div bind:this={containerEl} class="flex h-full flex-col">
    <div class="flex min-h-0 flex-col" style="height: {splitPercent}%">
      <div class="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b border-edge-subtle px-2 [scrollbar-width:none]">
        {#if executing}
          <Button size="sm" variant="danger" onclick={cancel}>
            <Square size={12} />
            Stop
          </Button>
        {:else}
          <Button size="sm" onclick={() => run(currentSql())} title="Run query ({mod}+Enter)">
            <Play size={12} />
            Run
          </Button>
        {/if}

        <span class="mx-1 h-4 w-px bg-edge"></span>

        <Button size="sm" variant="ghost" onclick={() => editor?.format()} title="Format SQL (Alt+F)" disabled={!sqlText.trim()}>
          <WandSparkles size={13} />
          Format
        </Button>
        <Button size="sm" variant="ghost" onclick={explain} title="Explain analyze" disabled={executing || !sqlText.trim()} loading={explaining}>
          {#if !explaining}<ListTree size={13} />{/if}
          Explain
        </Button>

        <Button size="sm" variant="ghost" onclick={() => (saveOpen = true)} title="Save query" disabled={!sqlText.trim() || !profileId}>
          <Bookmark size={13} />
          Save
        </Button>

        <Button size="sm" variant="ghost" onclick={share} title="Share query and chart" disabled={!sqlText.trim()}>
          <Share2 size={13} />
          Share
        </Button>

        <div class="ml-auto flex items-center">
          {#if !ui.hideBrain}
            <Button
              size="sm"
              variant="ghost"
              class={brainOpen ? 'text-accent' : ''}
              aria-pressed={brainOpen}
              onclick={() => duckActions().toggleBrainPanel()}
              title="Ask Duck Brain"
            >
              <Brain size={13} />
              Duck Brain
            </Button>
          {/if}
          <Tooltip text="Run query: {mod}+Enter. Run selection: {mod}+Shift+Enter. Format: Alt+F. Search: {mod}+F." side="bottom">
            <span class="inline-flex h-7 w-7 items-center justify-center text-fg-4"><Keyboard size={14} /></span>
          </Tooltip>
        </div>
      </div>

      <div class="min-h-0 flex-1">
        <CodeEditor
          bind:this={editor}
          value={sqlText}
          language="sql"
          ariaLabel="SQL editor for {tab.title}"
          placeholder="SELECT * FROM ..."
          onchange={(text) => duckActions().updateTabQuery(tabId, text)}
          onrun={run}
          onrunselection={run}
          extensions={collabExtensions}
          syncValue={collabExtensions.length === 0}
        />
      </div>
    </div>

    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="group/split flex h-1 shrink-0 cursor-row-resize items-center justify-center transition-colors hover:bg-active {resizing ? 'bg-accent/60' : 'bg-edge-subtle'}"
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize editor and results"
      onmousedown={onResizeStart}
      ondblclick={() => (splitPercent = 45)}
    >
      <div class="h-0.5 w-8 rounded-full transition-colors {resizing ? 'bg-accent' : 'bg-edge-strong group-hover/split:bg-accent/60'}"></div>
    </div>

    <div class="flex min-h-0 flex-1 flex-col">
      <QueryParamsBar {tabId} names={paramNames} />
      <div class="min-h-0 flex-1">
        <ResultPanel
          result={tab.result}
          {executing}
          {progress}
          view={resultView}
          onviewchange={(v) => (resultView = v)}
          oncancel={cancel}
          {extraViews}
        >
          {#snippet extra(view, result)}
            {#if view === 'map'}
              <!-- Loaded on first use so maplibre stays out of the main bundle. -->
              {#await import('../map/GeoMapView.svelte')}
                <div class="flex h-full items-center justify-center"><Spinner /></div>
              {:then { default: GeoMapView }}
                <GeoMapView {result} {geometryColumns} />
              {:catch}
                <p class="p-4 text-xs text-danger" role="alert">The map could not be loaded.</p>
              {/await}
            {:else}
              <ChartView
                {result}
                chartConfig={tab.chartConfig}
                onconfigchange={(config) => duckActions().updateTabChartConfig(tabId, config)}
              />
            {/if}
          {/snippet}
          {#snippet errorActions()}
            {#if !ui.hideBrain}
              <Button size="sm" variant="outline" onclick={fixWithBrain} loading={fixing}>
                {#if !fixing}<Sparkles size={13} />{/if}
                {fixing ? 'Duck Brain is thinking...' : 'Fix with Duck Brain'}
              </Button>
            {/if}
          {/snippet}
          {#snippet actions(result)}
            <BrainResultActions {tabId} sql={sqlText} {result} onchartapplied={() => (resultView = 'charts')} />
            <Button size="xs" variant="ghost" onclick={pinResult} title="Keep a copy of this result to compare against later">
              <Pin size={13} />
              Pin result
            </Button>
            <Button size="xs" variant="ghost" onclick={() => (compareOpen = true)} disabled={pinCount === 0}>
              <GitCompare size={13} />
              Compare{pinCount > 0 ? ` (${pinCount})` : ''}
            </Button>
            <Button size="xs" variant="ghost" onclick={() => (addToDashboardOpen = true)}>
              <LayoutDashboard size={13} />
              Add to dashboard
            </Button>
          {/snippet}
        </ResultPanel>
      </div>
    </div>
  </div>

  <AddToDashboardDialog
    open={addToDashboardOpen}
    sql={sqlText}
    title={tab.title}
    chartConfig={tab.chartConfig}
    columns={tab.result?.columns.map((name) => ({ name, numeric: isNumericColumn(tab.result?.data ?? [], name) }))}
    onclose={() => (addToDashboardOpen = false)}
  />
  <ShareDialog open={shareTab !== null} tab={shareTab} onclose={() => (shareTab = null)} />
  <SaveQueryDialog open={saveOpen} sql={sqlText} defaultTitle={tab.title} onclose={() => (saveOpen = false)} />
  <ExplainPlanViewer open={explainOpen} {explainText} onclose={() => (explainOpen = false)} />
  <ResultCompareDialog open={compareOpen} currentResult={tab.result} onclose={() => (compareOpen = false)} />

  {#if resizing}
    <div class="fixed inset-0 z-50 cursor-row-resize"></div>
  {/if}
{/if}
