<script lang="ts">
  import { tick, untrack } from 'svelte'
  import { keymap } from '@codemirror/view'
  import { Prec } from '@codemirror/state'
  import { Play, Trash2, ChevronUp, ChevronDown, ChevronRight, Code, Type, Plus, Square, SquareTerminal } from 'lucide-svelte'
  import Spinner from '../common/Spinner.svelte'
  import CodeEditor from '../editor/CodeEditor.svelte'
  import { renderMarkdown } from '../brain/brain-markdown'
  import { duckActions } from '../../stores/duck.svelte'
  import AddCellMenu from './AddCellMenu.svelte'
  import CellResults from './CellResults.svelte'
  import PythonOutput from './PythonOutput.svelte'
  import { isCodeCell, isKnownCellType, type PythonLiveState } from './cells'
  import type { ChartConfig, NotebookCell, NotebookCellType } from '@/store/types'

  interface Props {
    cell: NotebookCell
    tabId: string
    cellIndex: number
    totalCells: number
    running: boolean
    pythonLive?: PythonLiveState
    onrun: (cellId: string) => void
    oninterrupt: (cellId: string) => void
    onaddcell: (afterCellId: string, type: NotebookCellType) => void
  }

  let { cell, tabId, cellIndex, totalCells, running, pythonLive, onrun, oninterrupt, onaddcell }: Props = $props()

  const AUTO_HEIGHT = { min: 60, max: 400 }
  const ICON_BUTTON =
    'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-fg-3 transition-colors duration-100 hover:bg-hover hover:text-fg disabled:pointer-events-none disabled:opacity-50'

  // A string, not the narrowed union: a newer peer may sync a type this build does not know.
  const cellType = $derived<string>(cell.type)
  const isCode = $derived(isCodeCell(cellType))
  const pythonOutput = $derived(cellType === 'python' ? (cell.pythonOutput ?? null) : null)
  const sqlResult = $derived(cellType === 'sql' ? (cell.result ?? null) : null)
  const hasResult = $derived(
    (!!sqlResult && !sqlResult.error && sqlResult.data.length > 0) || (!!pythonOutput && !pythonOutput.error),
  )
  const hasError = $derived(!!sqlResult?.error || !!pythonOutput?.error)
  const hasPythonOutput = $derived(cellType === 'python' && (!!pythonOutput || !!pythonLive))
  const canCollapse = $derived((cellType === 'sql' && hasResult) || (cellType === 'python' && !!pythonOutput))
  const statusColor = $derived(
    running ? 'bg-info animate-pulse' : hasError ? 'bg-danger' : hasResult ? 'bg-success' : 'bg-fg-4',
  )
  const statusLabel = $derived(running ? 'Running' : hasError ? 'Failed' : hasResult ? 'Has output' : 'Not run')
  const markdownHtml = $derived(cellType === 'markdown' && cell.content.trim() ? renderMarkdown(cell.content) : '')

  let editor: CodeEditor | undefined = $state()
  let editing = $state(untrack(() => isCodeCell(cell.type) || !cell.content))

  /** The editor reports edits after a pause. Actions that read the store need the text now. */
  function commit() {
    const text = editor?.getValue()
    if (text === undefined || text === cell.content) return
    duckActions().updateNotebookCellContent(tabId, cell.id, text)
  }

  function saveContent(text: string) {
    duckActions().updateNotebookCellContent(tabId, cell.id, text)
  }

  function run() {
    commit()
    onrun(cell.id)
  }

  function cycleType() {
    commit()
    duckActions().toggleNotebookCellType(tabId, cell.id)
  }

  function onChartConfigChange(config: ChartConfig | undefined) {
    duckActions().updateNotebookCellChartConfig(tabId, cell.id, config)
  }

  async function startEditing() {
    editing = true
    await tick()
    editor?.focus()
  }

  /** Unmounting the editor flushes its pending edit, so closing loses nothing. */
  function stopEditing() {
    editing = false
  }

  function onMarkdownFocusOut(e: FocusEvent) {
    const next = e.relatedTarget
    // Focus that moves inside the editor, such as into its search panel, is not a blur.
    if (next instanceof Node && (e.currentTarget as HTMLElement).contains(next)) return
    // An empty cell stays open, a closed one would show only the placeholder.
    if ((editor?.getValue() ?? cell.content).trim()) stopEditing()
  }

  function onRenderedClick(e: MouseEvent) {
    // A link in the rendered text opens, it does not start an edit.
    if (e.target instanceof Element && e.target.closest('a')) return
    void startEditing()
  }

  function onRenderedKeydown(e: KeyboardEvent) {
    if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return
    e.preventDefault()
    void startEditing()
  }

  // Created once: a new array would make the editor reconfigure on every render.
  const markdownKeys = [
    Prec.high(
      keymap.of([
        {
          key: 'Escape',
          run: () => {
            stopEditing()
            return true
          },
        },
      ]),
    ),
  ]
</script>

<div class="group relative rounded-lg border border-edge bg-surface transition-colors focus-within:border-accent/50 hover:border-edge-strong">
  <div class="flex items-center gap-1 rounded-t-lg border-b border-edge-subtle bg-sidebar px-2 py-1">
    <span class="h-2 w-2 shrink-0 rounded-full {statusColor}" role="img" aria-label={statusLabel} title={statusLabel}></span>

    <button
      type="button"
      class="ds-badge cursor-pointer border border-edge bg-transparent text-[10px] hover:bg-hover"
      onclick={cycleType}
      title="Change cell type"
      aria-label="Cell type {cellType}. Click to change"
    >
      {#if cellType === 'sql'}
        <Code size={12} />
        SQL
      {:else if cellType === 'python'}
        <SquareTerminal size={12} />
        PY
      {:else if cellType === 'markdown'}
        <Type size={12} />
        MD
      {:else}
        {cellType.toUpperCase()}
      {/if}
    </button>

    {#if running && pythonLive?.status}
      <span class="ml-1 truncate text-[10px] text-fg-3" aria-live="polite">{pythonLive.status}</span>
    {/if}

    <span class="ml-1 text-[10px] text-fg-3">[{cellIndex + 1}]</span>

    <div class="flex-1"></div>

    <!-- Interrupt stays visible for as long as Python runs, not only on hover -->
    {#if cellType === 'python' && running}
      <button
        type="button"
        class="inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-2 text-[10px] font-medium text-danger transition-colors hover:bg-danger-soft"
        onclick={() => oninterrupt(cell.id)}
        title="Stop this run. Restarts the Python kernel; variables are lost."
      >
        <Square size={12} />
        Interrupt
      </button>
    {/if}

    <div class="flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
      {#if isCode}
        <button type="button" class={ICON_BUTTON} onclick={run} disabled={running} aria-label="Run cell" title="Run cell (Shift+Enter)">
          {#if running}
            <Spinner size="sm" class="h-3 w-3" />
          {:else}
            <Play size={13} />
          {/if}
        </button>
      {/if}

      {#if canCollapse}
        <button
          type="button"
          class={ICON_BUTTON}
          onclick={() => duckActions().toggleNotebookCellCollapsed(tabId, cell.id)}
          aria-label={cell.collapsed ? 'Expand output' : 'Collapse output'}
          aria-expanded={!cell.collapsed}
        >
          <ChevronRight size={13} class="transition-transform {cell.collapsed ? '' : 'rotate-90'}" />
        </button>
      {/if}

      <button
        type="button"
        class={ICON_BUTTON}
        onclick={() => duckActions().moveNotebookCell(tabId, cell.id, 'up')}
        disabled={cellIndex === 0}
        aria-label="Move cell up"
      >
        <ChevronUp size={13} />
      </button>
      <button
        type="button"
        class={ICON_BUTTON}
        onclick={() => duckActions().moveNotebookCell(tabId, cell.id, 'down')}
        disabled={cellIndex === totalCells - 1}
        aria-label="Move cell down"
      >
        <ChevronDown size={13} />
      </button>
      <button
        type="button"
        class="{ICON_BUTTON} text-danger hover:bg-danger-soft hover:text-danger"
        onclick={() => duckActions().removeNotebookCell(tabId, cell.id)}
        disabled={totalCells <= 1}
        aria-label="Delete cell"
      >
        <Trash2 size={13} />
      </button>
    </div>
  </div>

  <div class="min-h-[40px]">
    {#if isCodeCell(cellType)}
      <CodeEditor
        bind:this={editor}
        value={cell.content}
        language={cellType}
        runOnShiftEnter
        showLineNumbers
        autoHeight={AUTO_HEIGHT}
        ariaLabel="{cellType === 'sql' ? 'SQL' : 'Python'} cell {cellIndex + 1}"
        onchange={saveContent}
        onrun={run}
      />
    {:else if !isKnownCellType(cellType)}
      <div class="p-3">
        <p class="mb-2 text-xs text-fg-3">
          Unsupported cell type "{cellType}" (likely from a newer Duck-UI). Shown read-only.
        </p>
        <pre class="whitespace-pre-wrap break-words font-mono text-xs text-fg-2">{cell.content}</pre>
      </div>
    {:else if editing}
      <div onfocusout={onMarkdownFocusOut}>
        <CodeEditor
          bind:this={editor}
          value={cell.content}
          language="markdown"
          runOnShiftEnter
          showLineNumbers={false}
          autoHeight={AUTO_HEIGHT}
          placeholder="Write markdown here..."
          ariaLabel="Markdown cell {cellIndex + 1}"
          extensions={markdownKeys}
          onchange={saveContent}
          onrun={stopEditing}
        />
      </div>
    {:else}
      <div
        class="cursor-pointer p-3"
        role="button"
        tabindex="0"
        aria-label="Edit markdown cell {cellIndex + 1}"
        onclick={onRenderedClick}
        onkeydown={onRenderedKeydown}
      >
        {#if markdownHtml}
          <div class="prose-panel max-w-none text-[13px] text-fg">{@html markdownHtml}</div>
        {:else}
          <p class="px-1 text-[13px] italic text-fg-3">Empty markdown cell. Click to edit.</p>
        {/if}
      </div>
    {/if}
  </div>

  {#if sqlResult && !cell.collapsed}
    <div class="border-t border-edge-subtle">
      {#if sqlResult.error}
        <div class="whitespace-pre-wrap break-words bg-danger-soft px-3 py-2 text-[13px] text-danger" role="alert">
          {sqlResult.error}
        </div>
      {:else if sqlResult.data.length > 0}
        <CellResults result={sqlResult} chartConfig={cell.chartConfig} onchartconfigchange={onChartConfigChange} />
      {:else}
        <div class="px-3 py-2 text-xs text-fg-3">
          Query executed successfully. {sqlResult.rowCount} rows returned.
        </div>
      {/if}
    </div>
  {/if}

  {#if hasPythonOutput && !cell.collapsed}
    <div class="border-t border-edge-subtle">
      <PythonOutput
        output={running ? null : pythonOutput}
        live={running ? pythonLive : undefined}
        chartConfig={cell.chartConfig}
        onchartconfigchange={onChartConfigChange}
      />
    </div>
  {/if}

  <div class="absolute -bottom-3 left-1/2 z-10 -translate-x-1/2 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
    <AddCellMenu
      onadd={(type) => onaddcell(cell.id, type)}
      align="center"
      ariaLabel="Add cell below"
      class="inline-flex h-5 w-5 items-center justify-center rounded-full border border-edge bg-surface text-fg-3 shadow-sm transition-colors hover:border-edge-strong hover:text-fg"
    >
      <Plus size={12} />
    </AddCellMenu>
  </div>
</div>
