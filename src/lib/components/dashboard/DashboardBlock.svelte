<script lang="ts">
  import { TriangleAlert, Download, ExternalLink } from 'lucide-svelte'
  import Button from '../common/Button.svelte'
  import Spinner from '../common/Spinner.svelte'
  import ResultGrid from '../editor/ResultGrid.svelte'
  import { renderMarkdown } from '../brain/brain-markdown'
  import { CHART_COMPONENTS, INPUT_COMPONENTS, interpolate, type DocumentBlock } from '@/services/dashboard/markdown'
  import { computeMetric, formatMetric } from '@/services/dashboard/metrics'
  import { resultToGrid } from '@/lib/resultTable/gridData'
  import { triggerDownload } from '@/lib/resultTable/exportHelpers'
  import type { InputsStore, InputValue } from '@/services/dashboard/inputs'
  import type { DatasetResult } from '@/services/dashboard/queryRunner'
  import type { MetricConfig } from '@/services/dashboard/types'
  import type { QueryResult } from '@/store/types'
  import { propText, resolveData, resultToCsv, safeHref } from './blockHelpers'
  import DashboardChart from './DashboardChart.svelte'
  import DashboardInput from './DashboardInput.svelte'
  import Self from './DashboardBlock.svelte'

  /**
   * One block of a dashboard document.
   *
   * Markdown goes through the sanitizer; component tags become live elements
   * bound to query results by name. The failure states are the design: a
   * query still running shows a spinner in place, a failed one shows its error
   * IN PLACE, and an unknown tag renders as its own source text. A typo must
   * never silently delete a chart.
   */
  interface Props {
    block: DocumentBlock
    results: ReadonlyMap<string, DatasetResult>
    inputs?: InputsStore
    inputValues?: ReadonlyMap<string, InputValue>
  }

  let { block, results, inputs, inputValues }: Props = $props()

  const TABLE_ROW_HEIGHT = 34
  const TABLE_FOOTER_HEIGHT = 32
  const TABLE_MAX_HEIGHT = 384

  // Query values land in the text before it is rendered, so they pass through
  // the sanitizer together with the prose around them.
  const html = $derived.by(() => {
    if (block.kind !== 'markdown') return ''
    const text = interpolate(block.text, (name, row, column) => {
      const entry = results.get(name)
      if (entry?.status !== 'ready') return undefined
      return entry.result?.data[row]?.[column]
    })
    return renderMarkdown(text)
  })

  const component = $derived(block.kind === 'component' ? block : null)
  const bound = $derived(component ? resolveData(component, results) : null)
  // Keyed on the result itself, which keeps its identity while OTHER queries
  // land. Rebuilding the grid on each of those would reset the table's sort
  // and filters.
  const readyResult = $derived(bound?.state === 'ready' ? bound.result : undefined)
  const grid = $derived(readyResult && component?.tag === 'DataTable' ? resultToGrid(readyResult) : null)

  const ALERT_TONES: Record<string, string> = {
    danger: 'border-danger/40 bg-danger-soft',
    error: 'border-danger/40 bg-danger-soft',
    warning: 'border-warning/40 bg-warning-soft',
    success: 'border-success/40 bg-success-soft',
    info: 'border-info/40 bg-info-soft',
  }

  // The authoring snippets and "Add to dashboard" do not agree on the prop
  // that names the column (`value=` or `column=`), so both are read.
  function metricColumn(first: 'value' | 'column', second: 'value' | 'column'): string | undefined {
    return propText(component?.props[first]) ?? propText(component?.props[second])
  }

  function metricConfig(result: QueryResult, column: string | undefined, format?: string): MetricConfig {
    return {
      column: column ?? result.columns[0] ?? '',
      aggregation: (propText(component?.props.agg) as MetricConfig['aggregation']) ?? 'first',
      format: format as MetricConfig['format'],
    }
  }

  function tableHeight(result: QueryResult): number {
    const wanted = (result.data.length + 1) * TABLE_ROW_HEIGHT + TABLE_FOOTER_HEIGHT + 2
    return Math.min(TABLE_MAX_HEIGHT, wanted)
  }

  function download(result: QueryResult) {
    const data = component?.props.data
    const name = data?.kind === 'reference' ? data.name : 'data'
    triggerDownload(new Blob([resultToCsv(result)], { type: 'text/csv' }), `${name}.csv`)
  }
</script>

{#snippet placeholder(text: string)}
  <div class="my-3 flex min-h-24 items-center justify-center rounded-md border border-dashed border-edge px-3 text-xs text-fg-3">
    {text}
  </div>
{/snippet}

{#snippet children(blocks: DocumentBlock[] | undefined)}
  {#each blocks ?? [] as child, index (index)}
    <Self block={child} {results} {inputs} {inputValues} />
  {/each}
{/snippet}

{#if block.kind === 'markdown'}
  <div class="prose-brain max-w-none text-[13px] leading-relaxed text-fg-2">
    {@html html}
  </div>
{:else if INPUT_COMPONENTS.has(block.tag)}
  <!-- Inputs render regardless of data state: a Dropdown may be waiting for
       its options query, and it says so itself. -->
  {#if inputs && inputValues}
    <DashboardInput {block} {inputs} values={inputValues} {results} />
  {:else}
    {@render placeholder('Inputs are not available in this view')}
  {/if}
{:else if block.tag === 'Alert'}
  <div class="my-3 rounded-md border p-3 text-[13px] {ALERT_TONES[propText(block.props.status) ?? 'info'] ?? ALERT_TONES.info}">
    {@render children(block.children)}
  </div>
{:else if block.tag === 'Details'}
  <details class="my-3 rounded-md border border-edge p-3">
    <summary class="cursor-pointer text-[13px] font-medium text-fg">
      {propText(block.props.title) ?? 'Details'}
    </summary>
    <div class="mt-2">
      {@render children(block.children)}
    </div>
  </details>
{:else if block.tag === 'LinkButton'}
  {@const href = safeHref(propText(block.props.url) ?? propText(block.props.href))}
  <a
    {href}
    target="_blank"
    rel="noopener noreferrer"
    class="my-2 inline-flex h-7 items-center gap-1.5 rounded-md border border-edge px-2.5 text-xs font-medium text-fg-2 transition-colors duration-100 hover:border-edge-strong hover:bg-hover hover:text-fg"
  >
    {propText(block.props.title) ?? href}
    <ExternalLink size={13} />
  </a>
{:else if block.tag === 'Grid'}
  {@const cols = block.props.cols?.kind === 'number' ? block.props.cols.value : 2}
  <div class="my-3 grid gap-3" style="grid-template-columns: repeat({Math.max(1, Math.min(6, Math.round(cols)))}, minmax(0, 1fr))">
    {#each block.children ?? [] as child, index (index)}
      <div class="min-w-0">
        <Self block={child} {results} {inputs} {inputValues} />
      </div>
    {/each}
  </div>
{:else if !bound || bound.state === 'missing'}
  {@render placeholder(
    block.props.data
      ? `Unknown query "${propText(block.props.data)}". Declare it in a \`\`\`sql fence`
      : `<${block.tag}> needs data={query_name}`,
  )}
{:else if bound.state === 'loading'}
  <div class="my-3 flex min-h-24 items-center justify-center rounded-md border border-dashed border-edge text-fg-3" role="status" aria-label="Running query">
    <Spinner size="sm" />
  </div>
{:else if bound.state === 'error'}
  <div class="my-3 flex items-start gap-2 rounded-md border border-danger/40 bg-danger-soft p-3 text-xs text-fg" role="alert">
    <TriangleAlert size={14} class="mt-0.5 shrink-0 text-danger" />
    <span class="min-w-0 break-words font-mono">{bound.error ?? 'Query failed'}</span>
  </div>
{:else}
  {@const result = bound.result}
  {#if block.tag in CHART_COMPONENTS}
    <DashboardChart {block} {result} />
  {:else if block.tag === 'Delta'}
    {@const config = metricConfig(result, metricColumn('column', 'value'))}
    {@const value = computeMetric(result, config)}
    {@const positive = (value ?? 0) >= 0}
    <span class="font-medium tabular-nums {positive ? 'text-success' : 'text-danger'}">
      {positive ? '▲' : '▼'}
      {formatMetric(value === null ? null : Math.abs(value), config)}
    </span>
  {:else if block.tag === 'DownloadData'}
    <Button size="sm" variant="outline" class="my-2" onclick={() => download(result)}>
      <Download size={13} />
      {propText(block.props.title) ?? 'Download data'}
    </Button>
  {:else if block.tag === 'DataTable'}
    <div class="my-3 overflow-hidden rounded-md border border-edge" style="height: {tableHeight(result)}px">
      {#if grid}
        <ResultGrid meta={grid.meta} data={grid.data} rows={result.data} compact />
      {/if}
    </div>
  {:else if block.tag === 'BigValue'}
    {@const config = metricConfig(result, metricColumn('value', 'column'), propText(block.props.fmt))}
    <div class="my-2 mr-3 inline-flex min-w-40 flex-col rounded-md border border-edge bg-surface p-3 align-top">
      <span class="text-xs text-fg-3">{propText(block.props.title) ?? config.column}</span>
      <span class="text-2xl font-semibold tabular-nums text-fg">
        {formatMetric(computeMetric(result, config), config)}
      </span>
    </div>
  {:else if block.tag === 'Value'}
    {@const config = metricConfig(result, metricColumn('column', 'value'))}
    <span class="font-medium tabular-nums text-fg">
      {formatMetric(computeMetric(result, config), config)}
    </span>
  {:else}
    <!-- Unknown tag: show its source. Vanishing would hide the typo that caused it. -->
    <div class="my-3 flex min-h-24 items-center justify-center rounded-md border border-dashed border-edge text-xs text-fg-3">
      <code class="px-2 font-mono">{block.raw}</code>
    </div>
  {/if}
{/if}
