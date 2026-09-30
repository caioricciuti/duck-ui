<script lang="ts">
  import { ChartColumn, FileText, Gauge, Sparkles, Square } from 'lucide-svelte'
  import Button from '../common/Button.svelte'
  import ContextMenu, { type ContextMenuItem } from '../common/ContextMenu.svelte'
  import Modal from '../common/Modal.svelte'
  import Lazy from '../common/Lazy.svelte'
  import { duck, duckActions } from '../../stores/duck.svelte'
  import * as toast from '../../stores/toast.svelte'
  import type { QueryResult } from '@/store'
  import { getUiConfig } from '@/lib/appConfig'
  import { runQuery } from '@/services/engine'
  import { isNumericColumn } from '@/lib/chartDataTransform'
  import { autoDetectChartConfig } from '@/lib/chartAutoConfig'
  import { extractPlanText } from '@/lib/explainPlan'
  import { missingParamsMessage, resolveQueryParams } from '@/lib/sqlParams'
  import { formatSchemaForContext } from '@/lib/duckBrain/schemaFormatter'
  import {
    buildExplainResultsMessages,
    buildOptimizeQueryMessages,
    buildSuggestChartMessages,
    RESULT_SAMPLE_MAX_CELL_CHARS,
    RESULT_SAMPLE_MAX_ROWS,
  } from '@/lib/duckBrain/prompts/result-actions'
  import {
    isSingleReadOnlyQuery,
    parseExplanation,
    parseOptimizeResponse,
    resolveChartSuggestion,
  } from '@/lib/duckBrain/actionParsers'
  import { describeProviderDestination, requiresDataConsent } from '@/lib/duckBrain/privacy'

  /**
   * Duck Brain actions on a finished result: explain it, optimize the query,
   * suggest a chart. Explain is the only one that sends result values, so it
   * asks for consent on every use unless the model runs in this browser.
   */

  type BrainAction = 'explain' | 'optimize' | 'chart'

  type ActionOutcome =
    | { kind: 'explain'; summary: string }
    | { kind: 'optimize'; sql: string; reasons: string; unchanged: boolean }

  interface Props {
    tabId: string
    sql: string
    result: QueryResult
    /** Called after a suggested chart config is applied, e.g. to show the Charts view. */
    onchartapplied?: () => void
  }

  let { tabId, sql, result, onchartapplied }: Props = $props()

  const MENU_WIDTH = 220

  const aiProvider = $derived(duck((s) => s.duckBrain.aiProvider))
  const providerConfigs = $derived(duck((s) => s.duckBrain.providerConfigs))

  let busy = $state<BrainAction | null>(null)
  // Stop for the running action. Not state: only handlers read it.
  let controller: AbortController | null = null
  // A new result replaces this component; its request has nowhere to land.
  $effect(() => () => controller?.abort())
  let consentOpen = $state(false)
  let outcome = $state<ActionOutcome | null>(null)
  let menu = $state<{ x: number; y: number } | null>(null)

  const destination = $derived(
    describeProviderDestination(aiProvider, aiProvider === 'webllm' ? undefined : providerConfigs[aiProvider]),
  )

  /** Starts an action: `busy` for the button, a fresh signal for Stop. */
  function begin(action: BrainAction): AbortSignal {
    controller?.abort()
    controller = new AbortController()
    busy = action
    return controller.signal
  }

  function stop() {
    controller?.abort()
    controller = null
    busy = null
  }

  async function runExplain() {
    const signal = begin('explain')
    try {
      const response = await duckActions().runBrainTask(buildExplainResultsMessages(sql, result), {
        maxTokens: 700,
        signal,
      })
      if (response === null) return
      const summary = parseExplanation(response)
      if (!summary) {
        toast.error('Duck Brain returned an empty explanation')
        return
      }
      outcome = { kind: 'explain', summary }
    } finally {
      if (controller?.signal === signal) {
        controller = null
        busy = null
      }
    }
  }

  function handleExplain() {
    // Never send result values silently: ask every time for network providers.
    if (requiresDataConsent(aiProvider)) {
      consentOpen = true
      return
    }
    void runExplain()
  }

  function confirmConsent() {
    consentOpen = false
    void runExplain()
  }

  async function handleOptimize() {
    if (!isSingleReadOnlyQuery(sql)) {
      toast.info('Optimize works on a single read-only query (SELECT / WITH / FROM).')
      return
    }
    const { currentSession, maxResultRows, databases, tabs, runBrainTask } = duckActions()
    if (!currentSession) {
      toast.error('No active connection')
      return
    }
    // EXPLAIN needs the $param values bound, the model still sees the placeholders.
    const resolved = resolveQueryParams(sql, tabs.find((t) => t.id === tabId)?.queryParams)
    if (resolved.sql === null) {
      toast.error(missingParamsMessage(resolved.missing))
      return
    }
    const signal = begin('optimize')
    try {
      // Plain EXPLAIN: plans the query without running it again.
      const explained = await runQuery(
        currentSession,
        `EXPLAIN ${resolved.sql.trim().replace(/;+\s*$/, '')}`,
        'duck-brain',
        { maxRows: maxResultRows },
      )
      if (signal.aborted) return
      if (explained.error) {
        toast.error(`EXPLAIN failed: ${explained.error}`)
        return
      }
      const plan = extractPlanText(explained.data)
      const schema = formatSchemaForContext(databases).formatted
      const response = await runBrainTask(buildOptimizeQueryMessages(sql, plan, schema), {
        maxTokens: 1200,
        signal,
      })
      if (response === null) return
      const parsed = parseOptimizeResponse(response, sql)
      if (!parsed.ok) {
        toast.error(parsed.error)
        return
      }
      outcome = { kind: 'optimize', sql: parsed.sql, reasons: parsed.reasons, unchanged: parsed.unchanged }
    } catch (error) {
      toast.error(`Optimize failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      if (controller?.signal === signal) {
        controller = null
        busy = null
      }
    }
  }

  async function handleSuggestChart() {
    const numericColumns = result.columns.filter((col) => isNumericColumn(result.data, col))
    if (numericColumns.length === 0) {
      toast.info('This result has no numeric column to chart.')
      return
    }
    const signal = begin('chart')
    try {
      // Column names and types only: no values leave the browser.
      const columns = result.columns.map((name, i) => ({
        name,
        type: result.columnTypes[i] ?? 'unknown',
        numeric: numericColumns.includes(name),
      }))
      const response = await duckActions().runBrainTask(buildSuggestChartMessages(columns), {
        maxTokens: 300,
        signal,
      })
      if (response === null) return
      const { config, fromModel } = resolveChartSuggestion(
        response,
        { columns: result.columns, numericColumns },
        autoDetectChartConfig(result),
      )
      duckActions().updateTabChartConfig(tabId, config)
      onchartapplied?.()
      if (fromModel) {
        toast.success('Chart suggested by Duck Brain')
      } else {
        toast.warning("Duck Brain's chart suggestion was not usable, showing the automatic chart")
      }
    } finally {
      if (controller?.signal === signal) {
        controller = null
        busy = null
      }
    }
  }

  function handleApplyOptimized() {
    if (outcome?.kind !== 'optimize') return
    duckActions().updateTabQuery(tabId, outcome.sql)
    outcome = null
    toast.success("Duck Brain's rewrite applied. Review it and run again.")
  }

  const menuItems: ContextMenuItem[] = [
    { id: 'explain', label: 'Explain results', icon: FileText, onSelect: handleExplain },
    { id: 'optimize', label: 'Optimize query', icon: Gauge, onSelect: () => void handleOptimize() },
    { id: 'chart', label: 'Suggest chart', icon: ChartColumn, onSelect: () => void handleSuggestChart() },
  ]

  function toggleMenu(e: MouseEvent) {
    if (menu) {
      menu = null
      return
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    // Right-aligned under the button, like the old dropdown.
    menu = { x: rect.right - MENU_WIDTH, y: rect.bottom + 4 }
  }
</script>

{#if !getUiConfig().hideBrain}
  <Button
    size="xs"
    variant="ghost"
    disabled={busy !== null}
    aria-expanded={menu !== null}
    onclick={toggleMenu}
  >
    {#if busy}
      <span class="inline-flex" role="status" aria-label="Working"><Sparkles size={14} class="animate-pulse" /></span>
      Duck Brain is thinking...
    {:else}
      <Sparkles size={14} />
      Duck Brain
    {/if}
  </Button>
  {#if busy}
    <Button size="xs" variant="ghost" icon title="Stop" aria-label="Stop Duck Brain" onclick={stop}>
      <Square size={12} />
    </Button>
  {/if}

  <ContextMenu open={menu !== null} x={menu?.x ?? 0} y={menu?.y ?? 0} items={menuItems} onclose={() => (menu = null)} />

  <Modal
    open={consentOpen}
    title="Send sample rows to {destination}?"
    size="md"
    onclose={() => (consentOpen = false)}
  >
    <div class="space-y-2 text-[13px] leading-relaxed text-fg-2">
      <p>
        Duck Brain normally sends only your schema. To explain these results it needs to send actual data from this
        result to <strong class="font-semibold text-fg">{destination}</strong>:
      </p>
      <ul class="list-disc space-y-1 pl-5">
        <li>the query text and column names and types</li>
        <li>
          the first {RESULT_SAMPLE_MAX_ROWS} rows (each value cut to {RESULT_SAMPLE_MAX_CELL_CHARS} characters)
        </li>
        <li>per-column counts, null counts and numeric min / max / mean</li>
      </ul>
      <p>This is asked every time. Nothing is sent if you cancel.</p>
    </div>
    {#snippet footer()}
      <Button size="sm" variant="outline" onclick={() => (consentOpen = false)}>Cancel</Button>
      <Button size="sm" onclick={confirmConsent}>Send and explain</Button>
    {/snippet}
  </Modal>

  <!-- This sits in every SQL tab. The markdown renderer is fetched when an
       answer is shown, so it stays out of the startup bundle. -->
  {#snippet markdown(content: string)}
    <Lazy load={() => import('./MarkdownContent.svelte')} props={{ content }} />
  {/snippet}

  <Modal
    open={outcome !== null}
    title={outcome?.kind === 'optimize' ? 'Optimized query' : 'Result explanation'}
    description={outcome?.kind === 'optimize'
      ? outcome.unchanged
        ? 'Duck Brain thinks this query is already efficient.'
        : 'Suggested by Duck Brain from the EXPLAIN plan and schema. Review before running.'
      : 'Written by Duck Brain from a small sample. Check anything important.'}
    size="lg"
    onclose={() => (outcome = null)}
    footer={outcome?.kind === 'optimize' && !outcome.unchanged ? applyFooter : undefined}
  >
    {#if outcome?.kind === 'explain'}
      {@render markdown(outcome.summary)}
    {:else if outcome?.kind === 'optimize'}
      <div class="space-y-3">
        <!-- SQL from the model is rendered as text, never as HTML. -->
        <pre class="overflow-x-auto whitespace-pre-wrap rounded-md bg-surface-2 p-3 font-mono text-xs text-fg">{outcome.sql}</pre>
        {#if outcome.reasons}
          {@render markdown(outcome.reasons)}
        {/if}
      </div>
    {/if}
  </Modal>
{/if}

{#snippet applyFooter()}
  <Button size="sm" variant="outline" onclick={() => (outcome = null)}>Close</Button>
  <Button size="sm" onclick={handleApplyOptimized}>Apply to editor</Button>
{/snippet}
