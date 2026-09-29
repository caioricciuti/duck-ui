<script lang="ts">
  import Button from '../common/Button.svelte'
  import Input from '../common/Input.svelte'
  import Select from '../common/Select.svelte'
  import { defaultInputValue, type InputsStore, type InputValue } from '@/services/dashboard/inputs'
  import type { ComponentBlock } from '@/services/dashboard/markdown'
  import type { DatasetResult } from '@/services/dashboard/queryRunner'
  import { propNumber, propText } from './blockHelpers'

  /**
   * Input components: the Grafana variable layer, in Evidence's syntax.
   *
   *   <Dropdown name=region data={regions} value=region_name title='Region'/>
   *   <DateRange name=period/>
   *   <DatePicker name=day/>
   *
   * Each publishes into the dashboard's `InputsStore`; queries referencing
   * `${inputs.name...}` re-run when it changes. Values are view state: two
   * people reading the same shared report can pick different dates.
   */
  interface Props {
    block: ComponentBlock
    inputs: InputsStore
    values: ReadonlyMap<string, InputValue>
    results: ReadonlyMap<string, DatasetResult>
  }

  let { block, inputs, values, results }: Props = $props()

  const uid = $props.id()

  const name = $derived(propText(block.props.name))
  const title = $derived(propText(block.props.title) ?? name)

  /** Options for Dropdown/ButtonGroup: query-backed, or a literal list. */
  const options = $derived.by(() => {
    const dataRef = block.props.data
    const valueColumn = propText(block.props.value)
    if (dataRef?.kind === 'reference' && valueColumn) {
      const entry = results.get(dataRef.name)
      if (entry?.status !== 'ready' || !entry.result) return []
      const labelColumn = propText(block.props.label) ?? valueColumn
      const seen = new Set<string>()
      const collected: { value: string; label: string }[] = []
      for (const row of entry.result.data) {
        const value = String(row[valueColumn] ?? '')
        if (seen.has(value)) continue
        seen.add(value)
        collected.push({ value, label: String(row[labelColumn] ?? value) })
      }
      return collected
    }
    // Literal list: options='a,b,c'
    return (propText(block.props.options) ?? '')
      .split(',')
      .map((option) => option.trim())
      .filter(Boolean)
      .map((option) => ({ value: option, label: option }))
  })

  // Register a default so every referencing query can run before interaction.
  // Dropdowns without an explicit default adopt their first option once the
  // options query lands.
  $effect(() => {
    if (!name) return
    const explicit = propText(block.props.defaultValue)
    if ((block.tag === 'Dropdown' || block.tag === 'ButtonGroup') && !explicit) {
      if (options.length > 0) inputs.ensure(name, { kind: 'scalar', value: options[0].value })
      return
    }
    inputs.ensure(name, defaultInputValue(block.tag, { defaultValue: explicit, min: propNumber(block.props.min) }))
  })

  const current = $derived(name ? values.get(name) : undefined)
  const scalar = $derived(current?.kind === 'scalar' ? String(current.value) : '')
  const range = $derived(current?.kind === 'range' ? current : { kind: 'range' as const, start: '', end: '' })

  const sliderMin = $derived(propNumber(block.props.min) ?? 0)

  function setScalar(value: string | number | boolean) {
    if (name) inputs.set(name, { kind: 'scalar', value })
  }

  function setRange(part: 'start' | 'end', value: string) {
    if (name) inputs.set(name, { ...range, [part]: value })
  }
</script>

{#if !name}
  <span class="my-2 inline-block rounded-md border border-dashed border-edge px-2 py-1 text-xs text-fg-3">
    &lt;{block.tag}&gt; needs a name=
  </span>
{:else}
  <div class="my-2 mr-4 inline-flex flex-col gap-1 align-top">
    {#if title}
      {#if block.tag === 'ButtonGroup' || block.tag === 'DateRange'}
        <span id="{uid}-label" class="text-[11px] uppercase tracking-wide text-fg-3">{title}</span>
      {:else}
        <label for="{uid}-field" class="text-[11px] uppercase tracking-wide text-fg-3">{title}</label>
      {/if}
    {/if}

    {#if block.tag === 'Dropdown'}
      <Select id="{uid}-field" size="md" class="w-44" value={scalar} {options} placeholder={title} onchange={setScalar} />
    {:else if block.tag === 'ButtonGroup'}
      <div class="flex flex-wrap gap-1" role="group" aria-labelledby={title ? `${uid}-label` : undefined}>
        {#each options as option (option.value)}
          <Button
            size="sm"
            variant={scalar === option.value ? 'primary' : 'outline'}
            aria-pressed={scalar === option.value}
            onclick={() => setScalar(option.value)}
          >
            {option.label}
          </Button>
        {/each}
      </div>
    {:else if block.tag === 'TextInput'}
      <Input
        id="{uid}-field"
        class="w-44"
        value={scalar}
        placeholder={propText(block.props.placeholder) ?? ''}
        oninput={(e) => setScalar(e.currentTarget.value)}
      />
    {:else if block.tag === 'DateInput' || block.tag === 'DatePicker'}
      <input
        id="{uid}-field"
        type="date"
        class="ds-input w-40"
        value={scalar}
        oninput={(e) => setScalar(e.currentTarget.value)}
      />
    {:else if block.tag === 'DateRange'}
      <div class="flex items-center gap-1.5" role="group" aria-labelledby={title ? `${uid}-label` : undefined}>
        <input
          type="date"
          class="ds-input w-36"
          aria-label="{title ?? name} start"
          value={range.start}
          oninput={(e) => setRange('start', e.currentTarget.value)}
        />
        <span class="text-xs text-fg-3">to</span>
        <input
          type="date"
          class="ds-input w-36"
          aria-label="{title ?? name} end"
          value={range.end}
          oninput={(e) => setRange('end', e.currentTarget.value)}
        />
      </div>
    {:else if block.tag === 'Slider'}
      <div class="flex h-8 items-center gap-2">
        <input
          id="{uid}-field"
          type="range"
          min={sliderMin}
          max={propNumber(block.props.max) ?? 100}
          step={propNumber(block.props.step) ?? 1}
          value={Number(scalar) || sliderMin}
          oninput={(e) => setScalar(Number(e.currentTarget.value))}
          class="h-1.5 w-40 accent-accent"
        />
        <span class="min-w-8 text-xs tabular-nums text-fg-2">{scalar}</span>
      </div>
    {:else if block.tag === 'Checkbox'}
      <input
        id="{uid}-field"
        type="checkbox"
        class="ds-checkbox"
        checked={current?.kind === 'scalar' && current.value === true}
        onchange={(e) => setScalar(e.currentTarget.checked)}
      />
    {/if}
  </div>
{/if}
