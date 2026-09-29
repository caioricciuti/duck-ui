<script lang="ts">
  import { ChevronRight, Database, Table, Columns3, SquareTerminal, FileText, Trash2 } from 'lucide-svelte'
  import ContextMenu, { type ContextMenuItem } from '../common/ContextMenu.svelte'
  import ConfirmDialog from '../common/ConfirmDialog.svelte'
  import { duck, duckActions } from '../../stores/duck.svelte'
  import * as toast from '../../stores/toast.svelte'
  import { qualifyTable } from '@/lib/sqlSanitize'
  import { getUiConfig } from '@/lib/appConfig'
  import { formatCompactNumber } from '../../utils/format'
  import type { DatabaseInfo, TableInfo } from '@/store/types'

  interface Props {
    search?: string
  }

  let { search = '' }: Props = $props()

  const ui = getUiConfig()
  const databases = $derived(duck((s) => s.databases))

  let expanded = $state<Record<string, boolean>>({})
  let menu = $state<{ x: number; y: number; items: ContextMenuItem[] } | null>(null)
  let pendingDelete = $state<{ database: string; table: TableInfo } | null>(null)

  const needle = $derived(search.trim().toLowerCase())

  const visible = $derived.by((): DatabaseInfo[] => {
    if (!needle) return databases
    return databases
      .map((db) => ({
        ...db,
        tables: db.name.toLowerCase().includes(needle)
          ? db.tables
          : db.tables.filter(
              (t) =>
                t.name.toLowerCase().includes(needle) ||
                t.columns.some((c) => c.name.toLowerCase().includes(needle)),
            ),
      }))
      .filter((db) => db.tables.length > 0 || db.name.toLowerCase().includes(needle))
  })

  function tableKey(database: string, table: TableInfo): string {
    return `${database}\u0000${table.schema}\u0000${table.name}`
  }

  function isOpen(key: string, fallback: boolean): boolean {
    return expanded[key] ?? fallback
  }

  function toggle(key: string, fallback: boolean) {
    expanded[key] = !isOpen(key, fallback)
  }

  async function runInNewTab(sql: string, title: string) {
    const { createTab, executeQuery } = duckActions()
    const tabId = createTab('sql', sql, title)
    if (tabId) await executeQuery(sql, tabId)
  }

  function queryTable(database: string, table: TableInfo) {
    void runInNewTab(`SELECT * FROM ${qualifyTable(database, table.schema, table.name)} LIMIT 100`, table.name)
  }

  function describeTable(database: string, table: TableInfo) {
    void runInNewTab(`DESCRIBE ${qualifyTable(database, table.schema, table.name)}`, `${table.name} Schema`)
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    const { database, table } = pendingDelete
    pendingDelete = null
    try {
      await duckActions().deleteTable(table.name, database, table.schema)
      toast.success(`Table "${table.name}" deleted`)
      await duckActions().fetchDatabasesAndTablesInfo()
    } catch (e) {
      toast.error(`Failed to delete table "${table.name}": ${e instanceof Error ? e.message : 'Unknown error'}`)
    }
  }

  function openMenu(e: MouseEvent, database: string, table: TableInfo) {
    e.preventDefault()
    const items: ContextMenuItem[] = [
      { id: 'query', label: 'Query table', icon: SquareTerminal, onSelect: () => queryTable(database, table) },
      { id: 'schema', label: 'Show schema', icon: FileText, onSelect: () => describeTable(database, table) },
    ]
    if (!ui.readOnly) {
      items.push(
        { id: 'sep', separator: true },
        { id: 'delete', label: 'Delete table', icon: Trash2, danger: true, onSelect: () => (pendingDelete = { database, table }) },
      )
    }
    menu = { x: e.clientX, y: e.clientY, items }
  }

  const row = 'flex h-7 w-full items-center gap-1.5 rounded-md px-1.5 text-left text-[13px] text-fg-2 hover:bg-hover hover:text-fg'
</script>

<ul role="tree" aria-label="Database schema" class="px-1.5 pb-2">
  {#each visible as db (db.name)}
    {@const dbOpen = isOpen(db.name, true) || !!needle}
    <li role="treeitem" aria-expanded={dbOpen} aria-selected="false">
      <button class={row} onclick={() => toggle(db.name, true)}>
        <ChevronRight size={13} class="shrink-0 text-fg-4 transition-transform {dbOpen ? 'rotate-90' : ''}" />
        <Database size={13} class="shrink-0 text-accent" />
        <span class="truncate font-medium">{db.name}</span>
        <span class="ml-auto shrink-0 text-[11px] text-fg-4 tabular-nums">{db.tables.length}</span>
      </button>

      {#if dbOpen}
        <ul role="group" class="ml-3 border-l border-edge-subtle pl-1.5">
          {#each db.tables as table (tableKey(db.name, table))}
            {@const key = tableKey(db.name, table)}
            {@const tableOpen = isOpen(key, false)}
            <li role="treeitem" aria-expanded={tableOpen} aria-selected="false">
              <button
                class={row}
                onclick={() => toggle(key, false)}
                ondblclick={() => queryTable(db.name, table)}
                oncontextmenu={(e) => openMenu(e, db.name, table)}
                title="{table.schema}.{table.name}"
              >
                <ChevronRight size={13} class="shrink-0 text-fg-4 transition-transform {tableOpen ? 'rotate-90' : ''}" />
                <Table size={13} class="shrink-0 text-fg-3" />
                <span class="truncate">
                  {#if table.schema && table.schema !== 'main'}<span class="text-fg-4">{table.schema}.</span>{/if}{table.name}
                </span>
                <span class="ml-auto shrink-0 text-[11px] text-fg-4 tabular-nums">{formatCompactNumber(table.rowCount)}</span>
              </button>

              {#if tableOpen}
                <ul role="group" class="ml-3 border-l border-edge-subtle pl-1.5">
                  {#each table.columns as column (column.name)}
                    <li role="treeitem" aria-selected="false" class="flex h-6 items-center gap-1.5 px-1.5 text-xs text-fg-3">
                      <Columns3 size={12} class="shrink-0 text-fg-4" />
                      <span class="truncate text-fg-2">{column.name}</span>
                      <span class="ml-auto shrink-0 font-mono text-[11px] text-fg-4">{column.type}</span>
                    </li>
                  {/each}
                </ul>
              {/if}
            </li>
          {:else}
            <li class="px-1.5 py-1 text-xs text-fg-4">No tables</li>
          {/each}
        </ul>
      {/if}
    </li>
  {/each}
</ul>

<ContextMenu open={menu !== null} x={menu?.x ?? 0} y={menu?.y ?? 0} items={menu?.items ?? []} onclose={() => (menu = null)} />

<ConfirmDialog
  open={pendingDelete !== null}
  title="Delete table"
  description={pendingDelete ? `This permanently deletes "${pendingDelete.table.name}" and its data.` : ''}
  confirmLabel="Delete"
  destructive
  onconfirm={confirmDelete}
  oncancel={() => (pendingDelete = null)}
/>
