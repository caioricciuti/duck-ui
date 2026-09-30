<script lang="ts">
  import Sheet from '../common/Sheet.svelte'

  interface Props {
    open: boolean
    explainText: string
    onclose: () => void
  }

  let { open, explainText, onclose }: Props = $props()

  // Operator families share a tone so the plan reads by shape: scans, joins,
  // aggregates, ordering, filters.
  const OPERATOR_TONES: [string, string][] = [
    ['SEQ_SCAN', 'text-info'],
    ['INDEX_SCAN', 'text-info'],
    ['TABLE_SCAN', 'text-info'],
    ['CHUNK_SCAN', 'text-info'],
    ['HASH_JOIN', 'text-accent'],
    ['NESTED_LOOP_JOIN', 'text-accent'],
    ['CROSS_PRODUCT', 'text-danger'],
    ['PERFECT_HASH_GROUP_BY', 'text-warning'],
    ['HASH_GROUP_BY', 'text-warning'],
    ['UNGROUPED_AGGREGATE', 'text-warning'],
    ['ORDER_BY', 'text-success'],
    ['TOP_N', 'text-success'],
    ['LIMIT', 'text-success'],
    ['FILTER', 'text-danger'],
    ['PROJECTION', 'text-fg'],
    ['RESULT_COLLECTOR', 'text-fg-3'],
    ['EXPLAIN_ANALYZE', 'text-fg-3'],
  ]

  const lines = $derived(
    explainText.split('\n').map((text) => {
      const upper = text.toUpperCase()
      return { text, tone: OPERATOR_TONES.find(([key]) => upper.includes(key))?.[1] ?? '' }
    }),
  )
</script>

<Sheet {open} title="Explain analyze" description="Query execution plan from DuckDB" size="lg" {onclose}>
  <pre class="overflow-x-auto whitespace-pre font-mono text-xs leading-relaxed text-fg-2">{#if explainText.trim()}{#each lines as line}<span class={line.tone}>{line.text}
</span>{/each}{:else}No explain plan available{/if}</pre>
</Sheet>
