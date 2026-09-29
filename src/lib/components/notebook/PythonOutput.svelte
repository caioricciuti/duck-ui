<script lang="ts">
  import CellResults from './CellResults.svelte'
  import type { ChartConfig, PythonCellOutput } from '@/store/types'
  import type { PythonLiveState } from './cells'

  interface Props {
    output: PythonCellOutput | null
    live?: PythonLiveState
    chartConfig?: ChartConfig
    onchartconfigchange: (config: ChartConfig | undefined) => void
  }

  let { output, live, chartConfig, onchartconfigchange }: Props = $props()

  // Streams, then the last expression (table or repr), then figures.
  const stdout = $derived(live?.stdout ?? output?.stdout ?? '')
  const stderr = $derived(live?.stderr ?? output?.stderr ?? '')
  const isEmpty = $derived(
    !live &&
      !!output &&
      !stdout &&
      !stderr &&
      !output.error &&
      output.text === undefined &&
      !output.table &&
      !output.images?.length,
  )
</script>

<div class="text-xs text-fg-2">
  {#if stdout}
    <pre class="max-h-[300px] overflow-auto whitespace-pre-wrap break-words px-3 py-2 font-mono">{stdout}</pre>
  {/if}
  {#if stderr}
    <pre class="max-h-[200px] overflow-auto whitespace-pre-wrap break-words bg-warning-soft px-3 py-2 font-mono text-warning">{stderr}</pre>
  {/if}
  {#if output?.error}
    <pre class="whitespace-pre-wrap break-words bg-danger-soft px-3 py-2 font-mono text-danger" role="alert">{output.error}</pre>
  {/if}
  {#if output?.text !== undefined}
    <pre class="max-h-[300px] overflow-auto whitespace-pre-wrap break-words px-3 py-2 font-mono">{output.text}</pre>
  {/if}
  {#if output?.table}
    {#if output.table.data.length > 0}
      <CellResults result={output.table} {chartConfig} {onchartconfigchange} />
      {#if output.table.truncated}
        <div class="px-3 py-1 text-fg-3">
          Showing first {output.table.data.length.toLocaleString()} of
          {output.table.rowCount.toLocaleString()} rows.
        </div>
      {/if}
    {:else}
      <div class="px-3 py-2 text-fg-3">Empty DataFrame ({output.table.columns.length} columns).</div>
    {/if}
  {/if}
  {#each output?.images ?? [] as image, index (index)}
    <!-- Matplotlib draws on white, so the frame is white in both themes. -->
    <div class="bg-white px-3 py-2">
      <img src="data:image/png;base64,{image}" alt="Figure {index + 1}" class="h-auto max-w-full" />
    </div>
  {/each}
  {#if isEmpty}
    <div class="px-3 py-2 text-fg-3">
      Ran successfully{output?.durationMs !== undefined ? ` in ${output.durationMs} ms` : ''}.
    </div>
  {/if}
</div>
