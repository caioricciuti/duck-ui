<script lang="ts">
  import { ChevronRight, ChevronDown, FolderOpen, RefreshCw, X, AlertCircle, Ellipsis } from 'lucide-svelte'
  import type { MountedFolderInfo } from '@/store/types'
  import Spinner from '../common/Spinner.svelte'
  import FileNode from './FileNode.svelte'
  import { error as toastError } from '../../stores/toast.svelte'
  import { fileSystemService, type FSEntry } from '@/lib/fileSystem'
  import type { TreeActions } from './tree'

  interface Props {
    folder: MountedFolderInfo
    actions: TreeActions
    onunmount: (id: string) => void
    onrequestpermission: (id: string) => void
  }

  let { folder, actions, onunmount, onrequestpermission }: Props = $props()

  let expanded = $state(false)
  let loading = $state(false)
  let files = $state.raw<FSEntry[]>([])

  async function loadFiles() {
    loading = true
    try {
      files = await fileSystemService.listFiles(folder.id, { recursive: false, filterSupported: true })
    } catch (error) {
      console.error('Failed to load files:', error)
      if (error instanceof Error && error.message === 'Permission denied') {
        toastError('Permission required. Click to grant access.')
      }
    } finally {
      loading = false
    }
  }

  async function toggle() {
    if (!folder.hasPermission) {
      onrequestpermission(folder.id)
      return
    }
    if (!expanded && files.length === 0) await loadFiles()
    expanded = !expanded
  }

  function openMenu(x: number, y: number) {
    actions.menu(
      [
        { id: 'refresh', label: 'Refresh', icon: RefreshCw, onSelect: () => void loadFiles() },
        { id: 'unmount', label: 'Unmount', icon: X, danger: true, onSelect: () => onunmount(folder.id) },
      ],
      x,
      y,
    )
  }

  function onContextMenu(e: MouseEvent) {
    e.preventDefault()
    openMenu(e.clientX, e.clientY)
  }

  function onMoreClick(e: MouseEvent & { currentTarget: HTMLButtonElement }) {
    const rect = e.currentTarget.getBoundingClientRect()
    openMenu(rect.left, rect.bottom + 4)
  }
</script>

<li>
  <div class="group flex items-center">
    <button
      type="button"
      class="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 text-left text-[13px] text-fg transition-colors hover:bg-hover focus-visible:bg-hover"
      aria-expanded={expanded}
      onclick={toggle}
      oncontextmenu={onContextMenu}
    >
      {#if loading}
        <Spinner size="sm" class="h-3.5 w-3.5 shrink-0 text-fg-4" />
      {:else if expanded}
        <ChevronDown size={14} class="shrink-0 text-fg-4" />
      {:else}
        <ChevronRight size={14} class="shrink-0 text-fg-4" />
      {/if}
      <FolderOpen size={14} class="shrink-0 text-accent" />
      <span class="min-w-0 flex-1 truncate font-medium">{folder.name}</span>
      {#if !folder.hasPermission}
        <span class="inline-flex shrink-0 text-warning" title="Click to grant permission">
          <AlertCircle size={13} aria-label="Permission required" />
        </span>
      {/if}
    </button>
    <button
      type="button"
      class="mr-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-fg-3 opacity-0 transition-opacity hover:bg-hover hover:text-fg focus-visible:opacity-100 group-hover:opacity-100"
      aria-label="{folder.name} actions"
      aria-haspopup="menu"
      onclick={onMoreClick}
    >
      <Ellipsis size={14} />
    </button>
  </div>

  {#if expanded && files.length > 0}
    <ul>
      {#each files as entry (entry.path)}
        <FileNode {entry} folderId={folder.id} level={1} {actions} />
      {/each}
    </ul>
  {/if}

  {#if expanded && files.length === 0 && !loading}
    <p class="py-1 pl-8 text-xs text-fg-4">No supported files found</p>
  {/if}
</li>
