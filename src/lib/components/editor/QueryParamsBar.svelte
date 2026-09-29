<script lang="ts">
  import { Variable } from 'lucide-svelte'
  import Button from '../common/Button.svelte'
  import { duck, duckActions } from '../../stores/duck.svelte'
  import { looksNumeric, type QueryParamsState } from '@/lib/sqlParams'

  interface Props {
    tabId: string
    /** Placeholder names detected in the tab's SQL, in order. */
    names: string[]
  }

  let { tabId, names }: Props = $props()

  const EMPTY: QueryParamsState = { values: {} }

  // One input per `$name` placeholder, above the results. Values are stored as
  // typed text; the chip beside each shows how it will be substituted (number
  // inline, or quoted text) and toggles a numeric-looking value to text for
  // code-like columns. "Off" runs the SQL verbatim, for the rare query that
  // means `$name` literally.
  const params = $derived(duck((s) => s.tabs.find((tab) => tab.id === tabId)?.queryParams ?? EMPTY))
  const forceText = $derived(new Set(params.forceText ?? []))

  function update(updater: (current: QueryParamsState) => QueryParamsState) {
    duckActions().updateTabQueryParams(tabId, updater)
  }

  function setValue(name: string, value: string) {
    update((current) => ({ ...current, values: { ...current.values, [name]: value } }))
  }

  function toggleText(name: string) {
    update((current) => {
      const forced = new Set(current.forceText ?? [])
      if (forced.has(name)) forced.delete(name)
      else forced.add(name)
      return { ...current, forceText: [...forced] }
    })
  }
</script>

{#if names.length > 0}
  {#if params.disabled}
    <div class="flex items-center gap-2 border-b border-edge-subtle px-3 py-1 text-xs text-fg-3">
      <Variable size={13} class="shrink-0" />
      <span class="truncate">
        Parameters off: {names.map((name) => `$${name}`).join(', ')} run as written
      </span>
      <Button size="xs" variant="ghost" class="ml-auto" onclick={() => update((current) => ({ ...current, disabled: false }))}>
        Turn on
      </Button>
    </div>
  {:else}
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-edge-subtle px-3 py-1" role="group" aria-label="Query parameters">
      <Variable size={13} class="shrink-0 text-fg-3" />
      {#each names as name (name)}
        {@const value = params.values[name] ?? ''}
        {@const numeric = looksNumeric(value)}
        {@const asText = !numeric || forceText.has(name)}
        <label class="flex items-center gap-1.5 text-xs">
          <span class="font-mono text-fg-3">${name}</span>
          <input
            class="ds-input-sm h-6 w-32 {value === '' ? 'border-warning' : ''}"
            {value}
            placeholder="value"
            aria-label="Value for ${name}"
            oninput={(e) => setValue(name, e.currentTarget.value)}
          />
          <button
            type="button"
            disabled={!numeric}
            class="rounded border border-edge px-1 font-mono text-[10px] leading-4 text-fg-3 enabled:hover:bg-hover disabled:opacity-60"
            title={numeric
              ? asText
                ? 'Substituted as quoted text. Click to use as a number'
                : 'Substituted as a number. Click to quote as text'
              : 'Substituted as quoted text'}
            onclick={() => toggleText(name)}
          >
            {asText ? 'abc' : '123'}
          </button>
        </label>
      {/each}
      <Button
        size="xs"
        variant="ghost"
        class="ml-auto"
        title="Run the SQL exactly as written, without substituting $name placeholders"
        onclick={() => update((current) => ({ ...current, disabled: true }))}
      >
        Turn off
      </Button>
    </div>
  {/if}
{/if}
