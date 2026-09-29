<script lang="ts">
  import { ChevronRight, ChevronDown, File as FileIcon, FileSpreadsheet, FileJson, Database, FolderOpen, Import, Table } from 'lucide-svelte'
  import Spinner from '../common/Spinner.svelte'
  import FileNode from './FileNode.svelte'
  import { formatBytes } from '../../utils/format'
  import { listFolderChildren } from '@/lib/fileImporter/folderImport'
  import type { FSEntry } from '@/lib/fileSystem'
  import type { TreeActions } from './tree'

  interface Props {
    entry: FSEntry
    folderId: string
    level: number
    actions: TreeActions
  }

  let { entry, folderId, level, actions }: Props = $props()

  let expanded = $state(false)
  let loading = $state(false)
  let children = $state.raw<FSEntry[]>([])

  const spreadsheets = ['.csv', '.tsv', '.xlsx', '.xls']
  const json = ['.json', '.jsonl', '.ndjson']
  const columnar = ['.parquet', '.arrow', '.ipc']
  const databases = ['.duckdb', '.db']

  const extension = $derived(entry.type === 'file' ? entry.extension.toLowerCase() : '')
  const rowClass = 'flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md pr-2 text-left text-[13px] text-fg-2 transition-colors hover:bg-hover hover:text-fg focus-visible:bg-hover'

  async function toggle() {
    if (entry.type !== 'folder') return
    if (!expanded && children.length === 0) {
      loading = true
      try {
        children = await listFolderChildren(entry)
      } catch (error) {
        console.error('Failed to load folder contents:', error)
      } finally {
        loading = false
      }
    }
    expanded = !expanded
  }

  function openMenu(e: MouseEvent) {
    if (entry.type !== 'file') return
    e.preventDefault()
    const file = entry
    actions.menu(
      [{ id: 'quick-import', label: 'Quick Import as Table', icon: Table, onSelect: () => actions.quickImport(folderId, file) }],
      e.clientX,
      e.clientY,
    )
  }
</script>

<li>
  {#if entry.type === 'folder'}
    <button
      type="button"
      class="{rowClass} w-full"
      style="padding-left: {level * 12 + 8}px"
      aria-expanded={expanded}
      onclick={toggle}
    >
      {#if loading}
        <Spinner size="sm" class="h-3.5 w-3.5 shrink-0 text-fg-4" />
      {:else if expanded}
        <ChevronDown size={14} class="shrink-0 text-fg-4" />
      {:else}
        <ChevronRight size={14} class="shrink-0 text-fg-4" />
      {/if}
      <FolderOpen size={14} class="shrink-0 text-accent" />
      <span class="truncate">{entry.name}</span>
    </button>

    {#if expanded && children.length > 0}
      <ul>
        {#each children as child (child.path)}
          <FileNode entry={child} {folderId} level={level + 1} {actions} />
        {/each}
      </ul>
    {/if}
  {:else}
    {@const file = entry}
    <div class="group flex items-center">
      <button
        type="button"
        class={rowClass}
        style="padding-left: {level * 12 + 8}px"
        title={file.path}
        onclick={(e) => actions.select(folderId, file, e.currentTarget.getBoundingClientRect())}
        oncontextmenu={openMenu}
      >
        <span class="w-3.5 shrink-0"></span>
        {#if spreadsheets.includes(extension)}
          <FileSpreadsheet size={14} class="shrink-0 text-success" />
        {:else if json.includes(extension)}
          <FileJson size={14} class="shrink-0 text-warning" />
        {:else if columnar.includes(extension)}
          <Database size={14} class="shrink-0 text-info" />
        {:else if databases.includes(extension)}
          <Database size={14} class="shrink-0 text-accent" />
        {:else}
          <FileIcon size={14} class="shrink-0 text-fg-3" />
        {/if}
        <span class="min-w-0 flex-1 truncate">{file.name}</span>
        <span class="shrink-0 text-[10px] tabular-nums text-fg-4">{formatBytes(file.size)}</span>
      </button>
      <button
        type="button"
        class="mr-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-accent opacity-0 transition-opacity hover:bg-accent-soft focus-visible:opacity-100 group-hover:opacity-100"
        aria-label="Import {file.name}"
        title="Import"
        onclick={(e) => actions.importOptions(folderId, file, e.currentTarget.getBoundingClientRect())}
      >
        <Import size={13} />
      </button>
    </div>
  {/if}
</li>
