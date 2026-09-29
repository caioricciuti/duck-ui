<script lang="ts">
  import { getDisplayType, cellText } from '../../utils/column-types'
  import { getFormatNumbers } from '../../stores/number-format.svelte'

  interface Props {
    value: unknown
    type: string
    width: number
    selected?: boolean
    onmousedown?: (e: MouseEvent) => void
    onmouseenter?: (e: MouseEvent) => void
    oncontextmenu?: (e: MouseEvent) => void
  }

  let { value, type, width, selected = false, onmousedown, onmouseenter, oncontextmenu }: Props = $props()

  const displayType = $derived(getDisplayType(type))

  const rawValue = $derived.by(() => {
    if (value === null || value === undefined) return 'NULL'
    return cellText(value)
  })

  const formatted = $derived.by(() => {
    if (value === null || value === undefined) return null
    if (displayType === 'number') {
      if (typeof value === 'number' || typeof value === 'bigint') {
        return getFormatNumbers() ? value.toLocaleString() : String(value)
      }
      // Decimals past 2^53 arrive as strings to stay lossless.
      if (typeof value === 'string' && /^-?\d+$/.test(value)) {
        return getFormatNumbers() ? BigInt(value).toLocaleString() : value
      }
    }
    return cellText(value)
  })

  const isNull = $derived(value === null || value === undefined)
    const align = $derived(displayType === 'number' ? 'text-right' : 'text-left')
  const isUrl = $derived(displayType === 'string' && typeof value === 'string' && /^https?:\/\//i.test(value))

  async function handleCopyCell() {
    if (typeof navigator === 'undefined' || isNull) return
    try {
      await navigator.clipboard.writeText(rawValue)
    } catch {
      // Clipboard failures are non-fatal and should not interrupt navigation.
    }
  }
</script>

<td
  class="px-2.5 truncate border-r border-edge-subtle select-none {align} {selected ? 'bg-accent-soft shadow-[inset_0_0_0_1px_var(--accent-ring)]' : ''}"
  style="width:{width}px;max-width:{width}px;min-width:{width}px"
  title={isNull ? 'NULL' : `${rawValue}\n\nDouble-click to copy`}
  aria-selected={selected}
  ondblclick={handleCopyCell}
  {onmousedown}
  {onmouseenter}
  {oncontextmenu}
>
  {#if isNull}
    <span class="inline-flex items-center rounded-sm px-1 py-0.5 text-[10px] font-medium uppercase tracking-wide bg-surface-2 text-fg-3">Null</span>
  {:else if displayType === 'bool'}
    <span class="inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide {value ? 'text-success bg-success-soft' : 'text-danger bg-danger-soft'}">
      {String(value)}
    </span>
  {:else if isUrl}
    <span class="font-mono text-[12px] text-accent">{formatted}</span>
  {:else if displayType === 'json'}
    <span class="font-mono text-xs text-fg-3">{formatted}</span>
  {:else if displayType === 'number' || displayType === 'date'}
    <span class="font-mono tabular-nums text-[12px] {displayType === 'number' ? 'text-fg' : 'text-fg-2'}">{formatted}</span>
  {:else}
    <span class="text-[12px] text-fg-2">{formatted}</span>
  {/if}
</td>
