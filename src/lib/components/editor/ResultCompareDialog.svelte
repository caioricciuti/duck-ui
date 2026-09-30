<script lang="ts">
  import { untrack } from 'svelte'
  import { ArrowLeftRight, Scissors, Trash2 } from 'lucide-svelte'
  import Modal from '../common/Modal.svelte'
  import Button from '../common/Button.svelte'
  import Badge from '../common/Badge.svelte'
  import Select from '../common/Select.svelte'
  import Tabs, { type TabItem } from '../common/Tabs.svelte'
  import ResultGrid from './ResultGrid.svelte'
  import { duck, duckActions } from '../../stores/duck.svelte'
  import { cellText } from '../../utils/column-types'
  import { rowsToGrid } from '@/lib/resultTable/gridData'
  import {
    createResultSnapshot, diffResults, isIdentical, PIN_ROW_LIMIT, ResultDiffError,
    type ResultDiff, type ResultSnapshot,
  } from '@/lib/resultDiff'
  import type { QueryResult, ResultPin } from '@/store/types'

  interface Props {
    open: boolean
    /** The tab's current result, offered as a side next to the pins. */
    currentResult?: QueryResult | null
    onclose: () => void
  }

  let { open, currentResult, onclose }: Props = $props()

  /** Sentinel select value for the tab's live result. */
  const CURRENT = '__current__'
  /** Changed rows are rendered as a plain table, so bound how many. */
  const CHANGED_DISPLAY_LIMIT = 500

  const pins = $derived(duck((s) => s.resultPins))
  const hasCurrent = $derived(!!currentResult && !currentResult.error)

  let leftId = $state('')
  let rightId = $state('')
  let keyColumns = $state<string[]>([])
  let view = $state('changed')

  // Default sides each time it opens: the newest pin against the current
  // result, or the two newest pins when there is no current result.
  $effect(() => {
    if (!open) return
    untrack(() => {
      leftId = (hasCurrent ? pins[pins.length - 1]?.id : pins[pins.length - 2]?.id) ?? ''
      rightId = hasCurrent ? CURRENT : (pins[pins.length - 1]?.id ?? '')
      keyColumns = []
      view = 'changed'
    })
  })

  function oneLine(sql: string, max = 60): string {
    const flat = sql.replace(/\s+/g, ' ').trim()
    return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat || '(empty query)'
  }

  function pinLabel(pin: ResultPin): string {
    return `${pin.pinnedAt.toLocaleTimeString()} · ${oneLine(pin.query)}`
  }

  function formatCell(value: unknown): string {
    return value === null || value === undefined ? 'NULL' : cellText(value)
  }

  const currentSnapshot = $derived(hasCurrent && currentResult ? createResultSnapshot(currentResult) : null)

  function resolve(id: string): ResultSnapshot | null {
    if (id === CURRENT) return currentSnapshot
    return pins.find((p) => p.id === id)?.snapshot ?? null
  }

  const left = $derived(resolve(leftId))
  const right = $derived(resolve(rightId))
  const commonColumns = $derived(left && right ? right.columns.filter((c) => left.columns.includes(c)) : [])
  const activeKeys = $derived(keyColumns.filter((c) => commonColumns.includes(c)))

  const outcome = $derived.by((): { diff: ResultDiff } | { error: string } | null => {
    if (!left || !right) return null
    try {
      return { diff: diffResults(left, right, { keyColumns: activeKeys }) }
    } catch (error) {
      if (error instanceof ResultDiffError) return { error: error.message }
      throw error
    }
  })

  const diff = $derived(outcome && 'diff' in outcome ? outcome.diff : null)
  // "Changed" only exists with a key; fall back rather than show nothing.
  const activeView = $derived(view === 'changed' && diff?.rows.mode !== 'keyed' ? 'added' : view)

  const sideOptions = $derived([
    ...(hasCurrent ? [{ value: CURRENT, label: 'Current result' }] : []),
    ...[...pins].reverse().map((pin) => ({ value: pin.id, label: pinLabel(pin) })),
  ])

  const viewTabs = $derived.by((): TabItem[] => {
    if (!diff) return []
    const schemaCount = diff.schema.added.length + diff.schema.removed.length + diff.schema.typeChanged.length
    return [
      ...(diff.rows.mode === 'keyed' ? [{ id: 'changed', label: 'Changed', count: diff.rows.changed.length.toLocaleString() }] : []),
      { id: 'added', label: 'Added', count: diff.rows.added.length.toLocaleString() },
      { id: 'removed', label: 'Removed', count: diff.rows.removed.length.toLocaleString() },
      { id: 'schema', label: 'Schema', count: schemaCount },
    ]
  })

  // Key columns, then only the columns that changed somewhere: a wide result
  // with one edited cell should not scroll sideways to find it.
  const changedColumns = $derived.by(() => {
    if (!diff) return []
    const touched = new Set(diff.rows.changed.flatMap((row) => row.changedColumns))
    return [...diff.rows.keyColumns, ...diff.rows.comparedColumns.filter((c) => touched.has(c))]
  })
  const changedShown = $derived(diff ? diff.rows.changed.slice(0, CHANGED_DISPLAY_LIMIT) : [])

  function toggleKey(column: string) {
    keyColumns = keyColumns.includes(column) ? keyColumns.filter((c) => c !== column) : [...keyColumns, column]
  }

  function swap() {
    const previousLeft = leftId
    leftId = rightId
    rightId = previousLeft
  }
</script>

{#snippet rowsGrid(rows: Record<string, unknown>[], empty: string)}
  {#if rows.length > 0}
    {@const grid = rowsToGrid(rows)}
    <div class="h-full overflow-hidden rounded-md border border-edge">
      <ResultGrid meta={grid.meta} data={grid.data} {rows} compact />
    </div>
  {:else}
    <p class="p-4 text-xs text-fg-3">{empty}</p>
  {/if}
{/snippet}

<Modal
  {open}
  size="xl"
  title="Compare results"
  description="Pin results from any SQL tab, then compare two of them, or a pin against the current result. Pins last for this session and keep up to {PIN_ROW_LIMIT.toLocaleString()} rows."
  {onclose}
>
  <div class="flex h-[65vh] flex-col gap-3">
    {#if pins.length === 0 || (pins.length < 2 && !hasCurrent)}
      <p class="text-[13px] text-fg-3">
        {pins.length === 0
          ? 'Nothing pinned yet. Use "Pin result" under a query result first.'
          : 'Pin one more result, or run a query, to have two sides to compare.'}
      </p>
    {:else}
      <div class="flex flex-wrap items-end gap-2">
        <label class="min-w-0 flex-1 text-xs text-fg-3">
          <span class="mb-1 block">Before</span>
          <Select size="sm" options={sideOptions} bind:value={leftId} placeholder="Pick a result" />
        </label>
        <Button icon size="sm" variant="ghost" title="Swap sides" aria-label="Swap sides" onclick={swap}>
          <ArrowLeftRight size={14} />
        </Button>
        <label class="min-w-0 flex-1 text-xs text-fg-3">
          <span class="mb-1 block">After</span>
          <Select size="sm" options={sideOptions} bind:value={rightId} placeholder="Pick a result" />
        </label>
      </div>

      {#if commonColumns.length > 0}
        <div class="text-xs text-fg-3" role="group" aria-label="Key columns">
          <span class="mb-1 block">Key columns. None selected compares whole rows.</span>
          <div class="flex max-h-16 flex-wrap gap-1 overflow-auto">
            {#each commonColumns as column (column)}
              {@const on = activeKeys.includes(column)}
              <button
                class="rounded border px-1.5 py-0.5 font-mono text-[11px] transition-colors {on ? 'border-accent bg-accent-soft text-accent' : 'border-edge text-fg-2 hover:bg-hover'}"
                aria-pressed={on}
                onclick={() => toggleKey(column)}
              >
                {column}
              </button>
            {/each}
          </div>
        </div>
      {/if}

      {#if outcome && 'error' in outcome}
        <p class="text-xs text-danger" role="alert">{outcome.error}</p>
      {/if}

      {#if diff}
        <div class="flex flex-wrap items-center gap-1.5">
          <Badge>
            Rows {diff.rowCount.left.toLocaleString()} → {diff.rowCount.right.toLocaleString()}
            ({diff.rowCount.delta >= 0 ? '+' : ''}{diff.rowCount.delta.toLocaleString()})
          </Badge>
          <Badge tone="success">+{diff.rows.added.length.toLocaleString()} added</Badge>
          <Badge tone="danger">−{diff.rows.removed.length.toLocaleString()} removed</Badge>
          {#if diff.rows.mode === 'keyed'}
            <Badge tone="warning">~{diff.rows.changed.length.toLocaleString()} changed</Badge>
          {/if}
          <Badge>{diff.rows.unchangedCount.toLocaleString()} unchanged</Badge>
          {#if isIdentical(diff)}<Badge tone="brand">Identical</Badge>{/if}
        </div>

        {#if diff.partial}
          <div class="flex items-start gap-2 rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-xs text-fg-2">
            <Scissors size={13} class="mt-0.5 shrink-0 text-warning" />
            <span>
              At least one side holds only part of its result (pins keep the first
              {PIN_ROW_LIMIT.toLocaleString()} rows, and the engine row limit may have applied).
              Row-level differences cover the captured rows only.
            </span>
          </div>
        {/if}
        {#if diff.rows.duplicateKeys.left > 0 || diff.rows.duplicateKeys.right > 0}
          <p class="text-xs text-warning">
            The key is not unique ({diff.rows.duplicateKeys.left} duplicate(s) before,
            {diff.rows.duplicateKeys.right} after); duplicates are paired in row order.
          </p>
        {/if}

        <Tabs items={viewTabs} value={activeView} onchange={(id) => (view = id)} variant="segmented" />

        <div class="min-h-0 flex-1">
          {#if activeView === 'changed'}
            {#if diff.rows.changed.length === 0}
              <p class="p-4 text-xs text-fg-3">No changed rows.</p>
            {:else}
              <div class="flex h-full flex-col">
                {#if diff.rows.changed.length > changedShown.length}
                  <p class="px-2 py-1 text-xs text-fg-3">
                    Showing the first {changedShown.length.toLocaleString()} of
                    {diff.rows.changed.length.toLocaleString()} changed rows.
                  </p>
                {/if}
                <div class="min-h-0 flex-1 overflow-auto rounded-md border border-edge">
                  <table class="ds-table text-xs">
                    <thead class="sticky top-0 bg-surface">
                      <tr class="ds-table-head-row">
                        {#each changedColumns as column (column)}
                          <th class="ds-table-th-compact">
                            {column}
                            {#if diff.rows.keyColumns.includes(column)}
                              <span class="ml-1 rounded border border-edge px-1 text-[10px] text-fg-3">key</span>
                            {/if}
                          </th>
                        {/each}
                      </tr>
                    </thead>
                    <tbody>
                      {#each changedShown as row}
                        <tr class="ds-table-row-static">
                          {#each changedColumns as column (column)}
                            {@const isChanged = row.changedColumns.includes(column)}
                            <td class="px-2 py-1 align-top font-mono {isChanged ? 'bg-warning-soft' : 'text-fg-2'}">
                              {#if isChanged}
                                <span class="block text-danger line-through">{formatCell(row.before[column])}</span>
                                <span class="block text-success">{formatCell(row.after[column])}</span>
                              {:else}
                                {formatCell(row.after[column])}
                              {/if}
                            </td>
                          {/each}
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              </div>
            {/if}
          {:else if activeView === 'added'}
            {@render rowsGrid(diff.rows.added, 'No added rows.')}
          {:else if activeView === 'removed'}
            {@render rowsGrid(diff.rows.removed, 'No removed rows.')}
          {:else}
            {@const schema = diff.schema}
            <div class="h-full overflow-auto">
              {#if schema.added.length + schema.removed.length + schema.typeChanged.length === 0}
                <p class="p-4 text-xs text-fg-3">
                  Same columns and types{schema.reordered ? ', in a different order' : ''}.
                </p>
              {:else}
                <div class="space-y-1 p-2 font-mono text-xs">
                  {#each schema.added as c (c.name)}
                    <div class="text-success">+ {c.name} {c.type}</div>
                  {/each}
                  {#each schema.removed as c (c.name)}
                    <div class="text-danger">− {c.name} {c.type}</div>
                  {/each}
                  {#each schema.typeChanged as c (c.name)}
                    <div class="text-warning">~ {c.name}: {c.from || '?'} → {c.to || '?'}</div>
                  {/each}
                  {#if schema.reordered}
                    <div class="text-fg-3">Column order also differs.</div>
                  {/if}
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/if}
    {/if}

    {#if pins.length > 0}
      <details class="shrink-0 text-xs">
        <summary class="cursor-pointer text-fg-3">Pinned results ({pins.length})</summary>
        <ul class="mt-1 max-h-32 space-y-1 overflow-auto">
          {#each [...pins].reverse() as pin (pin.id)}
            <li class="flex items-center gap-2">
              <span class="min-w-0 flex-1 truncate text-fg-2" title={pin.query}>{pinLabel(pin)}</span>
              <span class="shrink-0 tabular-nums text-fg-3">
                {pin.snapshot.rows.length.toLocaleString()} rows{pin.snapshot.truncated ? ' (partial)' : ''}
              </span>
              <Button icon size="xs" variant="ghost" title="Remove pin" aria-label="Remove pin" onclick={() => duckActions().removeResultPin(pin.id)}>
                <Trash2 size={13} />
              </Button>
            </li>
          {/each}
        </ul>
      </details>
    {/if}
  </div>
</Modal>
