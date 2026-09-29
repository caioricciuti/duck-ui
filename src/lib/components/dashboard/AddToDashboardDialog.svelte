<script lang="ts">
  import { Plus } from 'lucide-svelte'
  import Button from '../common/Button.svelte'
  import Input from '../common/Input.svelte'
  import Modal from '../common/Modal.svelte'
  import { duck, duckActions } from '../../stores/duck.svelte'
  import type { ChartConfig } from '@/store/types'

  /**
   * "Add to dashboard", from a query result.
   *
   * The SQL travels, not the rows. A widget re-runs its dataset when the
   * dashboard opens, so what lands there stays current instead of freezing the
   * numbers that happened to be on screen.
   */
  type AddKind = 'chart' | 'table' | 'metric'

  interface Props {
    open: boolean
    onclose: () => void
    sql: string
    title: string
    chartConfig?: ChartConfig
    /** Result columns with a numeric flag, for x/y selection in the tag. */
    columns?: { name: string; numeric: boolean }[]
  }

  let { open, onclose, sql, title, chartConfig, columns }: Props = $props()

  const uid = $props.id()

  const KINDS: { kind: AddKind; label: string }[] = [
    { kind: 'table', label: 'Table' },
    { kind: 'chart', label: 'Chart' },
    { kind: 'metric', label: 'Metric' },
  ]

  const dashboards = $derived(duck((s) => s.dashboards))

  /** Null until picked: a result with a chart configured starts as a chart. */
  let picked = $state<AddKind | null>(null)
  const kind = $derived(picked ?? (chartConfig ? 'chart' : 'table'))
  let newName = $state('')
  let busy = $state(false)

  $effect(() => {
    if (open) void duckActions().loadDashboards()
  })

  async function addTo(dashboardId: string) {
    busy = true
    try {
      await duckActions().appendQueryToDashboard({ dashboardId, kind, title, sql, chartConfig, columns })
      onclose()
    } finally {
      busy = false
    }
  }

  async function createAndAdd() {
    if (busy) return
    busy = true
    try {
      const dashboard = await duckActions().createDashboard(newName.trim() || 'Untitled dashboard')
      if (dashboard) {
        await duckActions().appendQueryToDashboard({ dashboardId: dashboard.id, kind, title, sql, chartConfig, columns })
        onclose()
        newName = ''
      }
    } finally {
      busy = false
    }
  }
</script>

<Modal
  {open}
  {onclose}
  size="sm"
  title="Add to dashboard"
  description="The query is saved, not the rows. The widget re-runs it so the numbers stay current."
>
  <div class="flex flex-col gap-4">
    <div class="flex flex-col gap-1.5">
      <span id="{uid}-kind" class="text-[11px] uppercase tracking-wide text-fg-3">Show as</span>
      <div class="flex flex-wrap gap-1.5" role="group" aria-labelledby="{uid}-kind">
        {#each KINDS as option (option.kind)}
          <Button
            size="sm"
            variant={kind === option.kind ? 'primary' : 'outline'}
            aria-pressed={kind === option.kind}
            onclick={() => (picked = option.kind)}
          >
            {option.label}
          </Button>
        {/each}
      </div>
    </div>

    {#if dashboards.length > 0}
      <div class="flex flex-col gap-1.5">
        <span id="{uid}-existing" class="text-[11px] uppercase tracking-wide text-fg-3">Existing</span>
        <div class="flex max-h-40 flex-col gap-1 overflow-y-auto" role="group" aria-labelledby="{uid}-existing">
          {#each dashboards as dashboard (dashboard.id)}
            <Button variant="outline" class="w-full shrink-0 !justify-start" disabled={busy} onclick={() => addTo(dashboard.id)}>
              <span class="truncate">{dashboard.name}</span>
            </Button>
          {/each}
        </div>
      </div>
    {/if}

    <div class="flex flex-col gap-1.5">
      <label for="{uid}-new" class="text-[11px] uppercase tracking-wide text-fg-3">New dashboard</label>
      <div class="flex gap-2">
        <Input
          id="{uid}-new"
          bind:value={newName}
          placeholder="Q3 overview"
          onkeydown={(e) => e.key === 'Enter' && createAndAdd()}
        />
        <Button onclick={createAndAdd} disabled={busy}>
          <Plus size={13} />
          Create
        </Button>
      </div>
    </div>
  </div>

  {#snippet footer()}
    <Button size="sm" variant="ghost" onclick={onclose}>Cancel</Button>
  {/snippet}
</Modal>
