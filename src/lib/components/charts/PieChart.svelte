<script lang="ts">
  import { formatNumber, formatNumberWithSuffix } from '@/lib/chartUtils'
  import { getTheme } from '../../stores/theme.svelte'
  import { chartTheme, inkOn } from './palette'

  export interface PieSlice {
    label: string
    value: number
  }

  interface Props {
    slices: PieSlice[]
    colors: string[]
    donut?: boolean
    /** Hole radius as a fraction of the outer radius. */
    innerRadius?: number
  }

  let { slices, colors, donut = false, innerRadius = 0.45 }: Props = $props()

  let hovered = $state<number | null>(null)

  // Colors are written as attributes, not classes, so the SVG still looks
  // right when it is serialized for the PNG export.
  const theme = $derived.by(() => {
    getTheme()
    return chartTheme()
  })

  const total = $derived(slices.reduce((sum, s) => sum + s.value, 0))

  const arcs = $derived.by(() => {
    const inner = donut ? innerRadius : 0
    let angle = -Math.PI / 2
    return slices.map((slice, i) => {
      const pct = total === 0 ? 0 : slice.value / total
      const sweep = pct * 2 * Math.PI
      const start = angle
      const end = angle + sweep
      angle = end
      const mid = start + sweep / 2
      const large = sweep > Math.PI ? 1 : 0
      const point = (a: number, r: number) => `${Math.cos(a) * r} ${Math.sin(a) * r}`

      let d: string
      if (pct > 0.9999) {
        // A full turn starts and ends on the same point, which draws nothing
        // as a single arc. Two half turns make the circle.
        const ring = (r: number, flag: number) =>
          `M ${point(start, r)} A ${r} ${r} 0 1 ${flag} ${point(start + Math.PI, r)} A ${r} ${r} 0 1 ${flag} ${point(start, r)} Z`
        d = donut ? `${ring(1, 1)} ${ring(inner, 0)}` : ring(1, 1)
      } else if (donut) {
        d = `M ${point(start, 1)} A 1 1 0 ${large} 1 ${point(end, 1)} L ${point(end, inner)} A ${inner} ${inner} 0 ${large} 0 ${point(start, inner)} Z`
      } else {
        d = `M 0 0 L ${point(start, 1)} A 1 1 0 ${large} 1 ${point(end, 1)} Z`
      }

      return { ...slice, d, pct, mid, color: colors[i % colors.length] }
    })
  })

  const labelRadius = $derived(donut ? 0.72 : 0.6)
</script>

{#if total === 0}
  <div class="flex h-full items-center justify-center text-[13px] text-fg-3">No data</div>
{:else}
  <div class="flex h-full items-center justify-center gap-6">
    <div class="relative shrink-0">
      <svg
        viewBox="-1.3 -1.3 2.6 2.6"
        class="max-h-[360px] w-full min-w-[200px] max-w-[360px]"
        font-family={theme.fontFamily}
        role="img"
        aria-label="{donut ? 'Donut' : 'Pie'} chart, total {formatNumber(total)}"
      >
        {#each arcs as arc, i (i)}
          {@const active = hovered === i}
          {@const tx = active ? Math.cos(arc.mid) * 0.06 : 0}
          {@const ty = active ? Math.sin(arc.mid) * 0.06 : 0}
          <g>
            <path
              d={arc.d}
              fill={arc.color}
              fill-rule="evenodd"
              stroke={theme.surface}
              stroke-width="0.02"
              opacity={hovered !== null && !active ? 0.4 : 1}
              transform="translate({tx}, {ty})"
              style="transition: opacity 0.2s, transform 0.2s"
              role="presentation"
              onmouseenter={() => (hovered = i)}
              onmouseleave={() => (hovered = null)}
            />
            {#if arc.pct >= 0.05}
              <text
                x={Math.cos(arc.mid) * labelRadius + tx}
                y={Math.sin(arc.mid) * labelRadius + ty}
                text-anchor="middle"
                dominant-baseline="central"
                fill={inkOn(arc.color)}
                font-size="0.11"
                font-weight="600"
                pointer-events="none"
              >
                {(arc.pct * 100).toFixed(0)}%
              </text>
            {/if}
          </g>
        {/each}
        {#if donut}
          <text x="0" y="-0.06" text-anchor="middle" dominant-baseline="central" fill={theme.axis} font-size="0.12">
            Total
          </text>
          <text
            x="0"
            y="0.12"
            text-anchor="middle"
            dominant-baseline="central"
            fill={theme.text}
            font-size="0.18"
            font-weight="700"
          >
            {formatNumberWithSuffix(total)}
          </text>
        {/if}
      </svg>
      {#if hovered !== null && arcs[hovered]}
        <div
          class="surface-card pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs"
        >
          <div class="font-medium text-fg">{arcs[hovered].label}</div>
          <div class="text-fg-3">
            {formatNumber(arcs[hovered].value)} ({(arcs[hovered].pct * 100).toFixed(1)}%)
          </div>
        </div>
      {/if}
    </div>

    <ul class="flex max-h-[320px] flex-col gap-1.5 overflow-y-auto pr-2 text-xs">
      {#each arcs as arc, i (i)}
        <li
          class="flex cursor-default items-center gap-2"
          onmouseenter={() => (hovered = i)}
          onmouseleave={() => (hovered = null)}
        >
          <span class="h-2.5 w-2.5 shrink-0 rounded-full" style="background-color: {arc.color}"></span>
          <span class="max-w-[140px] truncate text-fg-3" title={arc.label}>{arc.label}</span>
          <span class="ml-auto pl-2 font-medium tabular-nums text-fg">{formatNumberWithSuffix(arc.value)}</span>
          <span class="w-[3.5em] text-right tabular-nums text-fg-3">{(arc.pct * 100).toFixed(1)}%</span>
        </li>
      {/each}
    </ul>
  </div>
{/if}
