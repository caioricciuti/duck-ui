<script lang="ts">
  import { Table2, Columns3 } from 'lucide-svelte'
  import type { SchemaSuggestion } from '@/lib/duckBrain/schemaSuggestions'

  interface Props {
    open: boolean
    suggestions: SchemaSuggestion[]
    activeIndex: number
    /** Id of the listbox, referenced by the textarea through aria-controls. */
    id: string
    onselect: (suggestion: SchemaSuggestion) => void
  }

  let { open, suggestions, activeIndex, id, onselect }: Props = $props()

  let list = $state<HTMLDivElement | null>(null)

  // Keep the keyboard-highlighted item visible while arrowing through the list.
  $effect(() => {
    if (!list || activeIndex < 0) return
    const item = list.children[activeIndex] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  })
</script>

{#if open && suggestions.length > 0}
  <div class="surface-card absolute bottom-full left-0 z-50 mb-1.5 w-64 overflow-hidden rounded-md">
    <div bind:this={list} {id} class="max-h-48 overflow-auto py-1" role="listbox" aria-label="Tables and columns">
      {#each suggestions as suggestion, index (`${suggestion.type}-${suggestion.fullPath}`)}
        <button
          type="button"
          id="{id}-{index}"
          role="option"
          aria-selected={index === activeIndex}
          class="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[13px] hover:bg-hover
            {index === activeIndex ? 'bg-hover text-fg' : 'text-fg-2'}"
          onclick={() => onselect(suggestion)}
        >
          {#if suggestion.type === 'table'}
            <Table2 size={14} class="shrink-0 text-accent" />
          {:else}
            <Columns3 size={14} class="shrink-0 text-fg-3" />
          {/if}
          <span class="min-w-0 flex-1">
            <span class="block truncate font-medium">{suggestion.name}</span>
            {#if suggestion.type === 'table'}
              <span class="block text-[10px] text-fg-3">
                {suggestion.rowCount ? `${suggestion.rowCount.toLocaleString()} rows` : 'table'}
              </span>
            {:else if suggestion.columnType}
              <span class="block text-[10px] text-fg-3">{suggestion.columnType}</span>
            {/if}
          </span>
        </button>
      {/each}
    </div>
    <div class="border-t border-edge-subtle bg-surface-2 px-2.5 py-1.5 text-[10px] text-fg-3">
      <kbd class="rounded-sm bg-active px-1">↑↓</kbd> navigate
      <span class="mx-1.5">·</span>
      <kbd class="rounded-sm bg-active px-1">Tab</kbd> select
      <span class="mx-1.5">·</span>
      <kbd class="rounded-sm bg-active px-1">Esc</kbd> close
    </div>
  </div>
{/if}
