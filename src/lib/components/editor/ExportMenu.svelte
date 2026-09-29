<script lang="ts">
  import { Download, FileText, Braces, Sheet as SheetIcon, Database, FolderDown } from 'lucide-svelte'
  import Button from '../common/Button.svelte'
  import ContextMenu, { type ContextMenuItem } from '../common/ContextMenu.svelte'
  import { duck } from '../../stores/duck.svelte'
  import { createTableExporters } from '@/lib/resultTable/tableExport'
  import type { DataRow } from '@/lib/resultTable/types'

  interface Props {
    /** Every row of the result, unfiltered. */
    rows: DataRow[]
    visibleColumns: string[]
    /** Rows after the grid's filters and sort, which is what gets exported. */
    filteredRows: () => DataRow[]
  }

  let { rows, visibleColumns, filteredRows }: Props = $props()

  const folders = $derived(duck((s) => s.mountedFolders))
  const canUseDuckDb = $derived(duck((s) => !!s.db && !!s.connection))

  let menu = $state<{ x: number; y: number } | null>(null)

  const items = $derived.by((): ContextMenuItem[] => {
    const exporters = createTableExporters(rows, {
      getVisibleColumnIds: () => visibleColumns,
      getFilteredRows: filteredRows,
    })
    const list: ContextMenuItem[] = [
      { id: 'csv', label: 'CSV', icon: FileText, onSelect: exporters.exportToCSV },
      { id: 'json', label: 'JSON', icon: Braces, onSelect: exporters.exportToJSON },
      { id: 'xlsx', label: 'Excel (XLSX)', icon: SheetIcon, onSelect: () => void exporters.exportToXLSX() },
      { id: 'parquet', label: 'Parquet', icon: Database, disabled: !canUseDuckDb, onSelect: () => void exporters.exportToDuckDB() },
    ]
    for (const folder of folders) {
      list.push(
        { id: `sep-${folder.id}`, separator: true },
        { id: `${folder.id}-csv`, label: `Save CSV to ${folder.name}`, icon: FolderDown, onSelect: () => void exporters.saveToFolderAsCSV(folder.id, folder.name) },
        { id: `${folder.id}-json`, label: `Save JSON to ${folder.name}`, icon: FolderDown, onSelect: () => void exporters.saveToFolderAsJSON(folder.id, folder.name) },
        { id: `${folder.id}-xlsx`, label: `Save XLSX to ${folder.name}`, icon: FolderDown, onSelect: () => void exporters.saveToFolderAsXLSX(folder.id, folder.name) },
        { id: `${folder.id}-parquet`, label: `Save Parquet to ${folder.name}`, icon: FolderDown, disabled: !canUseDuckDb, onSelect: () => void exporters.saveToFolderAsParquet(folder.id, folder.name) },
      )
    }
    return list
  })

  function toggle(e: MouseEvent) {
    if (menu) {
      menu = null
      return
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    menu = { x: rect.left, y: rect.top - 6 }
  }
</script>

<Button size="xs" variant="ghost" onclick={toggle} aria-expanded={menu !== null} disabled={rows.length === 0} title="Export the rows shown in the grid">
  <Download size={13} />
  Export
</Button>

<ContextMenu open={menu !== null} x={menu?.x ?? 0} y={menu?.y ?? 0} {items} onclose={() => (menu = null)} />
