<script lang="ts">
  import type { DocumentBlock } from '@/services/dashboard/markdown'
  import type { InputsStore, InputValue } from '@/services/dashboard/inputs'
  import type { DatasetResult } from '@/services/dashboard/queryRunner'
  import DashboardBlock from './DashboardBlock.svelte'

  /** Renders a parsed dashboard document, block by block. */
  interface Props {
    blocks: DocumentBlock[]
    results: ReadonlyMap<string, DatasetResult>
    inputs?: InputsStore
    inputValues?: ReadonlyMap<string, InputValue>
  }

  let { blocks, results, inputs, inputValues }: Props = $props()
</script>

{#if blocks.length === 0}
  <div class="flex h-full items-center justify-center text-[13px] text-fg-3">
    An empty page. Switch to Edit and start writing.
  </div>
{:else}
  <!-- A readable measure, like a report, not edge to edge like an app screen. -->
  <div class="mx-auto w-full max-w-4xl px-6 py-6">
    {#each blocks as block, index (index)}
      <DashboardBlock {block} {results} {inputs} {inputValues} />
    {/each}
  </div>
{/if}
