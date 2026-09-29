<script lang="ts">
  import { Table, Link2 } from 'lucide-svelte'
  import type { ImportMode } from '@/lib/fileImporter/types'

  interface Props {
    value: ImportMode
    onchange: (mode: ImportMode) => void
    disabled?: boolean
    tableLabel?: string
    viewLabel?: string
    /** Names the group for screen readers. */
    label?: string
    /** Stretch both segments to share the available width. */
    block?: boolean
  }

  let {
    value,
    onchange,
    disabled = false,
    tableLabel = 'Table',
    viewLabel = 'View',
    label = 'Import mode',
    block = false,
  }: Props = $props()

  const options = $derived([
    { mode: 'table' as const, text: tableLabel, icon: Table },
    { mode: 'view' as const, text: viewLabel, icon: Link2 },
  ])
</script>

<div class="ds-segment {block ? 'flex w-full' : ''}" role="group" aria-label={label}>
  {#each options as option (option.mode)}
    <button
      type="button"
      class="ds-segment-btn inline-flex items-center justify-center gap-1.5 disabled:pointer-events-none disabled:opacity-50 {block ? 'flex-1' : ''} {value === option.mode ? 'ds-segment-btn-active' : ''}"
      aria-pressed={value === option.mode}
      {disabled}
      onclick={() => onchange(option.mode)}
    >
      <option.icon size={13} />
      {option.text}
    </button>
  {/each}
</div>
