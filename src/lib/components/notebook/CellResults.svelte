<script lang="ts">
  import { ChartColumn, Table2 } from 'lucide-svelte'
  import Tabs from '../common/Tabs.svelte'
  import ResultGrid from '../editor/ResultGrid.svelte'
  import ChartView from '../charts/ChartView.svelte'
  import { resultToGrid } from '@/lib/resultTable/gridData'
  import type { ChartConfig, QueryResult } from '@/store/types'

  interface Props {
    result: QueryResult
    chartConfig?: ChartConfig
    onchartconfigchange: (config: ChartConfig | undefined) => void
  }

  let { result, chartConfig, onchartconfigchange }: Props = $props()

  // Heights of the grid parts, to size the box to a short result instead of
  // leaving a tall empty area under three rows.
  const ROW_HEIGHT = 34
  const GRID_CHROME = 34 + 32 + 2
  const MAX_TABLE_HEIGHT = 320

  const VIEWS = [
    { id: 'table', label: 'Table', icon: Table2 },
    { id: 'chart', label: 'Chart', icon: ChartColumn },
  ]

  let view = $state('table')

  const grid = $derived(resultToGrid(result))
  const tableHeight = $derived(Math.min(MAX_TABLE_HEIGHT, GRID_CHROME + result.data.length * ROW_HEIGHT))
  // The search and export tools need room; a narrow result keeps only the counts.
  const compact = $derived(result.columns.length <= 2)
</script>

{#snippet failed(error: unknown, reset: () => void)}
  <div class="p-3 text-center">
    <p class="mb-2 text-xs text-danger" role="alert">{error instanceof Error ? error.message : 'Render error'}</p>
    <button type="button" class="rounded bg-surface-2 px-2 py-1 text-xs text-fg-2 hover:bg-active" onclick={reset}>
      Retry
    </button>
  </div>
{/snippet}

<div class="w-full">
  <div class="px-2 pt-1.5 pb-1">
    <Tabs items={VIEWS} value={view} onchange={(id) => (view = id)} variant="segmented" size="sm" />
  </div>
  {#if view === 'chart'}
    <div class="h-[350px]">
      <svelte:boundary {failed}>
        <ChartView {result} {chartConfig} onconfigchange={onchartconfigchange} />
      </svelte:boundary>
    </div>
  {:else}
    <div style="height:{tableHeight}px">
      <svelte:boundary {failed}>
        <ResultGrid meta={grid.meta} data={grid.data} rows={result.data} durationMs={result.durationMs} {compact} />
      </svelte:boundary>
    </div>
  {/if}
</div>
