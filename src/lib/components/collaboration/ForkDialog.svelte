<script lang="ts">
  import { untrack } from 'svelte'
  import { Check, Database, Scissors, TriangleAlert } from 'lucide-svelte'
  import Modal from '../common/Modal.svelte'
  import Button from '../common/Button.svelte'
  import Select from '../common/Select.svelte'
  import Spinner from '../common/Spinner.svelte'
  import { duck, duckActions } from '../../stores/duck.svelte'
  import { WASM_CONNECTION_ID } from '@/services/engine'
  import type { SharedCapability } from '@/services/collaboration/capabilities/capability'
  import type { ForkTableProgress } from '@/services/collaboration/fork'

  interface Props {
    capability: SharedCapability
    open: boolean
    onclose: () => void
  }

  /*
   * Fork Session, guest side (§22).
   *
   * Pick tables, watch them transfer, and leave with an independent copy. The
   * dialog is explicit about the two things people need to know: the copy is
   * theirs afterwards, and the host's grant limits bound what crosses.
   */
  let { capability, open, onclose }: Props = $props()

  const uid = $props.id()
  const connections = $derived(duck((s) => s.connectionList.connections))

  // Fork destinations: the in-memory engine (gone when the tab closes) or an
  // OPFS database (persists on this device). Never a remote or peer target:
  // "your copy, in your browser" is the whole promise.
  const destinations = $derived([
    { value: WASM_CONNECTION_ID, label: 'This browser (in-memory)' },
    ...connections
      .filter((connection) => connection.scope === 'OPFS')
      .map((connection) => ({ value: connection.id, label: `${connection.name} (persistent)` })),
  ])

  const tables = $derived(
    (capability.catalog?.databases ?? []).flatMap((database) => database.tables.map((table) => table.name)),
  )
  const rowLimit = $derived(capability.policy.maxResultRows)

  let destination = $state<string>(WASM_CONNECTION_ID)
  let selected = $state<ReadonlySet<string>>(new Set(untrack(() => tables)))
  let progress = $state<ReadonlyMap<string, ForkTableProgress>>(new Map())
  let running = $state(false)
  let finished = $state(false)

  function toggle(table: string) {
    const next = new Set(selected)
    if (!next.delete(table)) next.add(table)
    selected = next
  }

  async function fork() {
    running = true
    finished = false
    progress = new Map()
    try {
      await duckActions().forkCapability(
        capability.id,
        [...selected],
        (update) => {
          progress = new Map(progress).set(update.table, update)
        },
        destination,
      )
      finished = true
    } finally {
      running = false
    }
  }

  // A transfer in flight cannot be walked away from by closing the dialog.
  function close() {
    if (!running) onclose()
  }
</script>

<Modal
  {open}
  onclose={close}
  size="sm"
  title="Fork “{capability.name}”"
  description="Copies the selected tables into your browser. Afterwards your copy is independent: their changes don't reach you, and yours don't reach them."
>
  <div class="flex flex-col gap-3">
    {#if rowLimit !== undefined}
      <p class="flex items-start gap-1.5 text-xs text-fg-3">
        <Scissors size={13} class="mt-0.5 shrink-0" />
        The host's limit of {rowLimit.toLocaleString()} rows per table applies to the copy.
      </p>
    {/if}

    <div class="flex max-h-56 flex-col gap-1.5 overflow-y-auto pr-3">
      {#if tables.length === 0}
        <p class="text-xs text-fg-3">This share lists no tables.</p>
      {/if}
      {#each tables as table (table)}
        {@const item = progress.get(table)}
        <div class="flex items-center gap-2">
          <label class="ds-checkbox-label min-w-0 flex-1">
            <input
              type="checkbox"
              class="ds-checkbox"
              checked={selected.has(table)}
              disabled={running}
              onchange={() => toggle(table)}
            />
            <span class="truncate font-mono text-xs">{table}</span>
          </label>
          {#if item}
            <span class="flex shrink-0 items-center gap-1.5 text-xs text-fg-3">
              {#if item.status === 'transferring'}
                <Spinner size="sm" class="h-3 w-3" />
                {item.rows.toLocaleString()} rows
              {:else if item.status === 'importing'}
                <Spinner size="sm" class="h-3 w-3" />
                importing
              {:else if item.status === 'done'}
                <Check size={13} class="text-success" />
                {item.rows.toLocaleString()} rows{item.truncated ? " (truncated by the host's limit)" : ''}
              {:else if item.status === 'error'}
                <span class="flex items-center gap-1 text-danger">
                  <TriangleAlert size={13} />
                  {item.error}
                </span>
              {/if}
            </span>
          {/if}
        </div>
      {/each}
    </div>

    {#if destinations.length > 1}
      <div class="flex flex-col gap-1.5">
        <label class="flex items-center gap-1.5 text-xs text-fg-3" for="{uid}-destination">
          <Database size={13} />
          Destination
        </label>
        <Select id="{uid}-destination" bind:value={destination} options={destinations} disabled={running} />
        <p class="text-xs text-fg-3">
          In-memory copies vanish when this tab closes. An OPFS database keeps them on this device.
        </p>
      </div>
    {/if}

    {#if finished}
      <p class="rounded-md border border-success/40 bg-success-soft p-2 text-xs text-fg" role="status">
        Done. The copies are {destination === WASM_CONNECTION_ID
          ? 'in your local in-memory database'
          : 'saved in your persistent database'}. They stay even if the host leaves.
      </p>
    {/if}
  </div>

  {#snippet footer()}
    <Button variant="ghost" onclick={onclose} disabled={running}>{finished ? 'Close' : 'Cancel'}</Button>
    <Button onclick={fork} loading={running} disabled={selected.size === 0}>
      Fork {selected.size > 0 ? `${selected.size} ` : ''}{selected.size === 1 ? 'table' : 'tables'}
    </Button>
  {/snippet}
</Modal>
