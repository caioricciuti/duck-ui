<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity'
  import NotebookCell from './NotebookCell.svelte'
  import NotebookToolbar, { type KernelState } from './NotebookToolbar.svelte'
  import QueryParamsBar from '../editor/QueryParamsBar.svelte'
  import { duck, duckActions } from '../../stores/duck.svelte'
  import * as toast from '../../stores/toast.svelte'
  import { kernelForNotebook, peekPythonKernel } from '@/services/python'
  import { listParameterNames, missingParamsMessage, resolveQueryParams } from '@/lib/sqlParams'
  import { CellOutputCache, type PythonLiveState } from './cells'
  import type { NotebookCellType } from '@/store/types'

  interface Props {
    tabId: string
  }

  let { tabId }: Props = $props()

  const outputs = new CellOutputCache()

  // The raw string first: the cells are parsed again only when it changed,
  // not on every unrelated store update.
  const content = $derived(
    duck((s) => {
      const tab = s.tabs.find((t) => t.id === tabId)
      return tab?.type === 'notebook' && typeof tab.content === 'string' ? tab.content : ''
    }),
  )
  const cells = $derived.by(() => {
    void content
    return outputs.reconcile(duckActions().getNotebookCells(tabId))
  })

  // Parameters are notebook-wide: `$region` means the same thing in every
  // cell, so one bar serves them all.
  const paramNames = $derived([
    ...new Set(cells.filter((cell) => cell.type === 'sql').flatMap((cell) => listParameterNames(cell.content))),
  ])

  const runningCells = new SvelteSet<string>()
  let pythonLive = $state<Record<string, PythonLiveState>>({})
  let runningAll = $state(false)
  // The kernel is a plain object. This is set after each event that can start or stop it.
  let kernelStarted = $state(false)
  let aborted = false

  const hasPython = $derived(cells.some((cell) => cell.type === 'python'))
  const runningPython = $derived(cells.filter((cell) => cell.type === 'python' && runningCells.has(cell.id)))
  const kernel = $derived<KernelState | undefined>(
    !hasPython ? undefined : runningPython.length > 0 ? 'busy' : kernelStarted ? 'idle' : 'off',
  )
  const kernelStatus = $derived(runningPython.map((cell) => pythonLive[cell.id]?.status).find(Boolean) ?? '')

  function refreshKernel() {
    kernelStarted = peekPythonKernel(tabId)?.isStarted ?? false
  }

  // A notebook reopened in the same session keeps its kernel.
  $effect(() => {
    void tabId
    refreshKernel()
  })

  function setLive(cellId: string, patch: Partial<PythonLiveState> | null) {
    if (patch === null) {
      delete pythonLive[cellId]
      return
    }
    pythonLive[cellId] = { ...(pythonLive[cellId] ?? { status: '', stdout: '', stderr: '' }), ...patch }
  }

  async function runPythonCell(cellId: string, code: string) {
    const pythonKernel = kernelForNotebook(tabId, {
      getSession: () => duckActions().currentSession,
      getMaxRows: () => duckActions().maxResultRows,
    })
    setLive(cellId, { status: pythonKernel.isBusy ? 'Queued...' : '' })
    try {
      const output = await pythonKernel.run(code, {
        onStatus: (status) => {
          setLive(cellId, { status })
          refreshKernel()
        },
        onStream: (streams) => setLive(cellId, streams),
      })
      duckActions().updateNotebookCellPythonOutput(tabId, cellId, output)
    } finally {
      setLive(cellId, null)
      refreshKernel()
    }
  }

  async function runCell(cellId: string) {
    // The shortcut works while the run button is disabled, so guard here too.
    if (runningCells.has(cellId)) return
    const cell = duckActions()
      .getNotebookCells(tabId)
      .find((c) => c.id === cellId)
    if (!cell || (cell.type !== 'sql' && cell.type !== 'python') || !cell.content.trim()) return

    runningCells.add(cellId)
    try {
      if (cell.type === 'python') {
        await runPythonCell(cellId, cell.content)
        return
      }
      const params = duckActions().tabs.find((t) => t.id === tabId)?.queryParams
      const resolved = resolveQueryParams(cell.content.trim(), params)
      if (resolved.sql === null) throw new Error(missingParamsMessage(resolved.missing))
      // No tab id: the rows belong to the cell, not to the tab.
      const result = await duckActions().executeQuery(resolved.sql)
      if (result) duckActions().updateNotebookCellResult(tabId, cellId, result)
    } catch (error) {
      duckActions().updateNotebookCellResult(tabId, cellId, {
        columns: [],
        columnTypes: [],
        data: [],
        rowCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      runningCells.delete(cellId)
    }
  }

  function interruptPython() {
    // One kernel per notebook: interrupting replaces the worker, so a Run All
    // in progress stops too. Later cells would run against lost state.
    aborted = true
    peekPythonKernel(tabId)?.interrupt()
    refreshKernel()
  }

  async function runAllCells() {
    if (runningAll) return
    const runnable = duckActions()
      .getNotebookCells(tabId)
      .filter((c) => (c.type === 'sql' || c.type === 'python') && c.content.trim())
    if (runnable.length === 0) return

    runningAll = true
    aborted = false

    let completed = 0
    try {
      for (const cell of runnable) {
        if (aborted) break
        await runCell(cell.id)
        completed++
      }
    } finally {
      runningAll = false
    }
    if (!aborted) toast.success(`Executed ${completed} cell${completed !== 1 ? 's' : ''}`)
  }

  function addCellAtEnd(type: NotebookCellType) {
    duckActions().addNotebookCell(tabId, cells[cells.length - 1]?.id, type)
  }
</script>

<div class="flex h-full flex-col">
  <NotebookToolbar
    onrunall={runAllCells}
    onaddcell={addCellAtEnd}
    running={runningAll}
    cellCount={cells.length}
    {kernel}
    {kernelStatus}
  />
  <QueryParamsBar {tabId} names={paramNames} />

  <div class="min-h-0 flex-1 overflow-y-auto">
    <div class="mx-auto max-w-4xl space-y-5 px-4 py-4">
      {#each cells as cell, index (cell.id)}
        <NotebookCell
          {cell}
          {tabId}
          cellIndex={index}
          totalCells={cells.length}
          running={runningCells.has(cell.id)}
          pythonLive={pythonLive[cell.id]}
          onrun={runCell}
          oninterrupt={interruptPython}
          onaddcell={(afterCellId, type) => duckActions().addNotebookCell(tabId, afterCellId, type)}
        />
      {/each}
    </div>
  </div>
</div>
