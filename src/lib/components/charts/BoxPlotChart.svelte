<script lang="ts">
  import { formatNumber, formatNumberWithSuffix } from '@/lib/chartUtils'
  import { niceTicks, type BoxStats } from '@/lib/boxPlot'
  import { getTheme } from '../../stores/theme.svelte'
  import { chartTheme, themeColor, withAlpha } from './palette'

  interface Props {
    boxes: BoxStats[]
    /** Name of the value column, for the accessible label. */
    valueLabel: string
  }

  let { boxes, valueLabel }: Props = $props()

  let width = $state(0)
  let height = $state(0)
  let hovered = $state<number | null>(null)

  const MARGIN = { top: 10, right: 12, bottom: 26, left: 52 }

  // Colors are written as attributes, not classes, so the SVG still looks
  // right when it is serialized for an export.
  const colors = $derived.by(() => {
    getTheme()
    const accent = themeColor('--accent')
    return { ...chartTheme(), accent, fill: withAlpha(accent, 0.22) }
  })

  const ticks = $derived(
    boxes.length === 0
      ? []
      : niceTicks(Math.min(...boxes.map((b) => b.min)), Math.max(...boxes.map((b) => b.max))),
  )
  const plotW = $derived(Math.max(0, width - MARGIN.left - MARGIN.right))
  const plotH = $derived(Math.max(0, height - MARGIN.top - MARGIN.bottom))
  const band = $derived(boxes.length ? plotW / boxes.length : 0)
  const boxW = $derived(Math.min(56, band * 0.55))

  function yOf(value: number): number {
    const lo = ticks[0] ?? 0
    const hi = ticks[ticks.length - 1] ?? 1
    return MARGIN.top + plotH - ((value - lo) / (hi - lo || 1)) * plotH
  }

  /** Labels are cut to the width of their band, about 6.5 px per character. */
  function fit(label: string): string {
    const room = Math.max(3, Math.floor(band / 6.5))
    return label.length > room ? `${label.slice(0, room - 1)}…` : label
  }
</script>

<div class="relative h-full w-full" bind:clientWidth={width} bind:clientHeight={height}>
  {#if boxes.length === 0}
    <div class="flex h-full items-center justify-center text-[13px] text-fg-3">No numeric values</div>
  {:else if width > 0 && height > 0}
    <svg
      {width}
      {height}
      font-family={colors.fontFamily}
      font-size="11"
      role="img"
      aria-label="Box plot of {valueLabel}, {boxes.length} {boxes.length === 1 ? 'box' : 'boxes'}"
    >
      {#each ticks as tick (tick)}
        <line x1={MARGIN.left} x2={width - MARGIN.right} y1={yOf(tick)} y2={yOf(tick)} stroke={colors.grid} />
        <text x={MARGIN.left - 6} y={yOf(tick)} text-anchor="end" dominant-baseline="central" fill={colors.axis}>
          {formatNumberWithSuffix(tick)}
        </text>
      {/each}

      {#each boxes as box, i (box.label)}
        {@const cx = MARGIN.left + band * i + band / 2}
        {@const dim = hovered !== null && hovered !== i}
        <g
          opacity={dim ? 0.45 : 1}
          role="presentation"
          onmouseenter={() => (hovered = i)}
          onmouseleave={() => (hovered = null)}
        >
          <!-- Hover target over the whole band, so thin boxes are easy to hit. -->
          <rect x={cx - band / 2} y={MARGIN.top} width={band} height={plotH} fill="transparent" />
          <line x1={cx} x2={cx} y1={yOf(box.highWhisker)} y2={yOf(box.q3)} stroke={colors.axis} />
          <line x1={cx} x2={cx} y1={yOf(box.q1)} y2={yOf(box.lowWhisker)} stroke={colors.axis} />
          <line x1={cx - boxW / 4} x2={cx + boxW / 4} y1={yOf(box.highWhisker)} y2={yOf(box.highWhisker)} stroke={colors.axis} />
          <line x1={cx - boxW / 4} x2={cx + boxW / 4} y1={yOf(box.lowWhisker)} y2={yOf(box.lowWhisker)} stroke={colors.axis} />
          <rect
            x={cx - boxW / 2}
            y={yOf(box.q3)}
            width={boxW}
            height={Math.max(1, yOf(box.q1) - yOf(box.q3))}
            fill={colors.fill}
            stroke={colors.accent}
            rx="2"
          />
          <line x1={cx - boxW / 2} x2={cx + boxW / 2} y1={yOf(box.median)} y2={yOf(box.median)} stroke={colors.text} stroke-width="2" />
          {#each box.outliers as value, j (j)}
            <circle cx={cx} cy={yOf(value)} r="2.5" fill="none" stroke={colors.accent} />
          {/each}
          <text x={cx} y={height - 8} text-anchor="middle" fill={colors.axis}>{fit(box.label)}</text>
        </g>
      {/each}
    </svg>

    {#if hovered !== null && boxes[hovered]}
      {@const box = boxes[hovered]}
      <div
        class="surface-card pointer-events-none absolute right-2 top-2 z-10 grid grid-cols-[auto_auto] gap-x-3 rounded-md px-2.5 py-1.5 text-xs"
      >
        <div class="col-span-2 mb-0.5 max-w-[220px] truncate font-medium text-fg">{box.label}</div>
        {#each [['n', box.n], ['max', box.max], ['q3', box.q3], ['median', box.median], ['q1', box.q1], ['min', box.min]] as [name, value] (name)}
          <span class="text-fg-3">{name}</span>
          <span class="text-right tabular-nums text-fg">{formatNumber(Number(value))}</span>
        {/each}
        {#if box.outliers.length}
          <span class="text-fg-3">outliers</span>
          <span class="text-right tabular-nums text-fg">{box.outliers.length}</span>
        {/if}
      </div>
    {/if}
  {/if}
</div>
