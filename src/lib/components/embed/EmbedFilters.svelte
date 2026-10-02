<script lang="ts">
  import Select from '../common/Select.svelte'
  import Input from '../common/Input.svelte'
  import Button from '../common/Button.svelte'
  import Spinner from '../common/Spinner.svelte'
  import { runQuery, type DataSession } from '@/services/engine'
  import type { SharedParam } from '@/lib/share'
  import {
    buildFilteredSql,
    distinctValuesSql,
    SELECT_OPTION_LIMIT,
    type FilterValue,
    type FilterValues,
  } from '@/lib/share/filters'
  import type { QueryResult } from '@/store/types'

  /*
   * The interactive filters of an embed. Owns what the viewer set, fills the
   * dropdowns from the data, and re-runs the shared query with the filters
   * wrapped around it, handing each result back to the view. Fetched on
   * first use so embeds without filters pay nothing for it.
   */
  interface Props {
    session: DataSession
    /** The query as shared; filters wrap it, never change it. */
    sql: string
    params: SharedParam[]
    maxRows: number | undefined
    onresult: (result: QueryResult) => void
  }

  let { session, sql, params, maxRows, onresult }: Props = $props()

  let values = $state.raw<FilterValues>({})
  let selectOptions = $state.raw<Record<string, string[]>>({})
  let filtering = $state(false)
  let error = $state<string | null>(null)
  // Typing in a search or range box waits for a pause; a later run wins.
  let run = 0
  let timer: ReturnType<typeof setTimeout> | undefined

  const hasActiveFilter = $derived(
    Object.values(values).some((v) => (v.kind === 'range' ? v.min !== '' || v.max !== '' : v.value !== '')),
  )

  // Dropdown values come from the data. A column that fails just offers none.
  $effect(() => {
    const exposed = params.filter((p) => p.type === 'select')
    const current = { session, sql }
    let cancelled = false
    void (async () => {
      for (const param of exposed) {
        try {
          const result = await runQuery(current.session, distinctValuesSql(current.sql, param.column), 'embed', {
            maxRows: SELECT_OPTION_LIMIT,
          })
          if (cancelled || result.error) continue
          const found = result.data.map((row) => String(row.value ?? '')).filter((v) => v !== '')
          selectOptions = { ...selectOptions, [param.column]: found }
        } catch {
          // The dropdown stays empty; the viewer can still use the other filters.
        }
      }
    })()
    return () => {
      cancelled = true
    }
  })

  async function apply() {
    const mine = ++run
    filtering = true
    error = null
    try {
      const result = await runQuery(session, buildFilteredSql(sql, params, values), 'embed', { maxRows })
      if (mine !== run) return
      if (result.error) throw new Error(result.error)
      onresult(result)
    } catch (err) {
      if (mine !== run) return
      error = err instanceof Error ? err.message : 'Filter failed'
    } finally {
      if (mine === run) filtering = false
    }
  }

  function setFilter(column: string, value: FilterValue, immediate: boolean) {
    values = { ...values, [column]: value }
    clearTimeout(timer)
    if (immediate) void apply()
    else timer = setTimeout(() => void apply(), 300)
  }

  function reset() {
    clearTimeout(timer)
    values = {}
    void apply()
  }

  function rangeOf(column: string): { min: string; max: string } {
    const current = values[column]
    return current?.kind === 'range' ? current : { min: '', max: '' }
  }
</script>

<div class="flex shrink-0 flex-wrap items-end gap-x-3 gap-y-2 px-4 pb-2" role="group" aria-label="Filters">
  {#each params as param, i (param.column)}
    {@const label = param.label || param.column}
    {@const current = values[param.column]}
    {@const id = `embed-filter-${i}`}
    <div class="flex min-w-0 flex-col gap-0.5">
      <label for={param.type === 'range' ? `${id}-min` : id} class="truncate text-[11px] text-fg-3">{label}</label>
      {#if param.type === 'select'}
        {@const found = selectOptions[param.column] ?? []}
        <Select
          {id}
          size="sm"
          class="w-40"
          value={current?.kind === 'select' ? current.value : ''}
          options={[{ value: '', label: 'All' }, ...found.map((v) => ({ value: v, label: v }))]}
          onchange={(value) => setFilter(param.column, { kind: 'select', value }, true)}
        />
      {:else if param.type === 'search'}
        <Input
          {id}
          size="sm"
          type="search"
          class="w-40"
          placeholder="Contains..."
          value={current?.kind === 'search' ? current.value : ''}
          oninput={(e) => setFilter(param.column, { kind: 'search', value: e.currentTarget.value }, false)}
        />
      {:else}
        {@const range = rangeOf(param.column)}
        <div class="flex items-center gap-1">
          <Input
            id="{id}-min"
            size="sm"
            type="number"
            class="w-24"
            placeholder="Min"
            value={range.min}
            oninput={(e) => setFilter(param.column, { kind: 'range', min: e.currentTarget.value, max: range.max }, false)}
          />
          <label for="{id}-max" class="sr-only">{label} max</label>
          <Input
            id="{id}-max"
            size="sm"
            type="number"
            class="w-24"
            placeholder="Max"
            value={range.max}
            oninput={(e) => setFilter(param.column, { kind: 'range', min: range.min, max: e.currentTarget.value }, false)}
          />
        </div>
      {/if}
    </div>
  {/each}
  {#if hasActiveFilter}
    <Button size="xs" variant="ghost" onclick={reset}>Reset</Button>
  {/if}
  {#if filtering}
    <Spinner size="sm" />
  {/if}
</div>
{#if error}
  <p class="shrink-0 px-4 pb-1 font-mono text-xs text-danger" role="alert">{error}</p>
{/if}
