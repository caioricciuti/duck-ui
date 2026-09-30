<script lang="ts">
  import { getSetting, setSetting } from '@/services/persistence/repositories/settingsRepository'
  import { DEFAULT_DUCKDB_MEMORY_LIMIT_MB } from '@/store/slices/duckdbSlice'
  import { clampMaxResultRows, MAX_MAX_RESULT_ROWS, MIN_MAX_RESULT_ROWS } from '@/store/slices/querySlice'
  import Button from '../common/Button.svelte'
  import Input from '../common/Input.svelte'
  import FormField from '../common/FormField.svelte'
  import { duck, duckActions } from '../../stores/duck.svelte'
  import * as toast from '../../stores/toast.svelte'

  const MIN_MEMORY_MB = 256
  const MAX_MEMORY_MB = 16384

  const currentProfileId = $derived(duck((s) => s.currentProfileId))
  const storedMaxResultRows = $derived(duck((s) => s.maxResultRows))

  let memoryLimitMb = $state<number>(DEFAULT_DUCKDB_MEMORY_LIMIT_MB)
  // Draft only exists while the field is being edited. Until then the input
  // shows the live store value, which arrives asynchronously at boot.
  let maxResultRowsDraft = $state<number | null>(null)
  const maxResultRows = $derived(maxResultRowsDraft ?? storedMaxResultRows)
  let saving = $state(false)

  $effect(() => {
    const profileId = currentProfileId
    if (!profileId) return
    let cancelled = false
    void (async () => {
      try {
        const raw = await getSetting(profileId, 'duckdb', 'memory_limit_mb')
        if (!cancelled && raw) {
          const parsed = Number(JSON.parse(raw))
          if (Number.isFinite(parsed)) memoryLimitMb = Math.floor(parsed)
        }
      } catch {
        // ignore, fall back to default
      }
    })()
    return () => {
      cancelled = true
    }
  })

  async function saveMemoryLimit() {
    if (!currentProfileId) return
    const clamped = Math.max(MIN_MEMORY_MB, Math.min(MAX_MEMORY_MB, Math.floor(memoryLimitMb || 0)))
    memoryLimitMb = clamped
    saving = true
    try {
      await setSetting(currentProfileId, 'duckdb', 'memory_limit_mb', JSON.stringify(clamped))
      toast.success('Memory limit saved. Reload to apply.')
    } catch {
      toast.error('Failed to save memory limit')
    } finally {
      saving = false
    }
  }

  async function saveMaxResultRows() {
    const clamped = clampMaxResultRows(maxResultRows || 0)
    maxResultRowsDraft = null
    // Applied immediately. Unlike the memory limit, nothing in the engine
    // needs restarting for a JS-side row cap.
    duckActions().setMaxResultRows(clamped)
    if (!currentProfileId) return
    saving = true
    try {
      await setSetting(currentProfileId, 'duckdb', 'max_result_rows', JSON.stringify(clamped))
      toast.success('Row limit saved')
    } catch {
      toast.error('Failed to save row limit')
    } finally {
      saving = false
    }
  }
</script>

<div class="divide-y divide-edge-subtle">
  <FormField
    layout="row"
    controlWidth="full"
    label="DuckDB memory limit (MB)"
    for="memory-limit"
    hint="Caps DuckDB heap usage. Raise this if large sorts or aggregations fail with out-of-memory errors; lower it on memory-constrained devices. Browser WASM practical ceiling is around 4 GB. Changes take effect after reload."
  >
    <div class="flex items-center gap-2">
      <Input
        id="memory-limit"
        type="number"
        min={MIN_MEMORY_MB}
        max={MAX_MEMORY_MB}
        step={256}
        value={memoryLimitMb}
        class="max-w-[160px]"
        oninput={(e) => (memoryLimitMb = Number(e.currentTarget.value))}
      />
      <Button size="md" variant="outline" disabled={saving || !currentProfileId} onclick={saveMemoryLimit}>Save</Button>
    </div>
  </FormField>

  <FormField
    layout="row"
    controlWidth="full"
    label="Maximum rows per result"
    for="max-result-rows"
    hint="A query returning more than this stops early and says so, instead of turning millions of rows into JavaScript objects and freezing the tab. Exports to Parquet bypass the limit and always write the complete result."
  >
    <div class="flex items-center gap-2">
      <Input
        id="max-result-rows"
        type="number"
        min={MIN_MAX_RESULT_ROWS}
        max={MAX_MAX_RESULT_ROWS}
        step={1000}
        value={maxResultRows}
        class="max-w-[160px]"
        oninput={(e) => (maxResultRowsDraft = Number(e.currentTarget.value))}
      />
      <Button size="md" variant="outline" disabled={saving} onclick={saveMaxResultRows}>Save</Button>
    </div>
  </FormField>
</div>
