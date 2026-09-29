<script lang="ts">
  import { onMount } from 'svelte'
  import { FolderOpen, FolderPlus } from 'lucide-svelte'
  import Button from '../common/Button.svelte'
  import ContextMenu, { type ContextMenuItem } from '../common/ContextMenu.svelte'
  import ImportOptionsPopover from './ImportOptionsPopover.svelte'
  import MountedFolderNode from './MountedFolderNode.svelte'
  import { duck, duckActions } from '../../stores/duck.svelte'
  import { success, error as toastError } from '../../stores/toast.svelte'
  import { getUiConfig } from '@/lib/appConfig'
  import { fileSystemService, type FileEntry } from '@/lib/fileSystem'
  import { importFolderFile, quickImportTableName, type ImportOptions } from '@/lib/fileImporter/folderImport'
  import type { TreeActions } from './tree'

  interface Props {
    /** Replaces the default click on a file, which opens the import options. */
    onfileselect?: (folderId: string, file: FileEntry) => void
    /** Replaces the built-in import into the active connection. */
    onfileimport?: (folderId: string, file: FileEntry, options: ImportOptions) => void
    class?: string
  }

  let { onfileselect, onfileimport, class: cls = '' }: Props = $props()

  const mountedFolders = $derived(duck((s) => s.mountedFolders))
  const isFileSystemSupported = $derived(duck((s) => s.isFileSystemSupported))
  // Kiosk mode can hide all data-import affordances, and an external
  // connection cannot register local files at all.
  const supportsFileImport = $derived(duck((s) => s.currentSession?.capabilities.supportsFileImport ?? false))
  const canImport = $derived(supportsFileImport && !getUiConfig().hideImport)

  let initialized = false
  let menu = $state<{ items: ContextMenuItem[]; x: number; y: number } | null>(null)
  let popover = $state.raw<{ folderId: string; file: FileEntry; x: number; y: number } | null>(null)

  onMount(() => {
    void duckActions()
      .initFileSystem()
      .then(() => (initialized = true))

    // Permissions can be revoked while the tab is in the background.
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && initialized) {
        void duckActions().refreshFolderPermissions()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  })

  function runImport(folderId: string, file: FileEntry, options: ImportOptions) {
    if (onfileimport) onfileimport(folderId, file, options)
    else void importFolderFile(folderId, file, options)
  }

  function openImportOptions(folderId: string, file: FileEntry, anchor: DOMRect) {
    popover = { folderId, file, x: anchor.right + 8, y: anchor.top }
  }

  const actions: TreeActions = {
    select: (folderId, file, anchor) => {
      if (onfileselect) onfileselect(folderId, file)
      else openImportOptions(folderId, file, anchor)
    },
    importOptions: openImportOptions,
    menu: (items, x, y) => (menu = { items, x, y }),
    quickImport: (folderId, file) =>
      runImport(folderId, file, { tableName: quickImportTableName(file.name), importMode: 'table' }),
  }

  async function requestPermission(folderId: string) {
    try {
      const granted = await fileSystemService.requestPermission(folderId)
      if (granted) {
        await duckActions().refreshFolderPermissions()
        success('Permission granted')
      } else {
        toastError('Permission denied')
      }
    } catch {
      toastError('Failed to request permission')
    }
  }

  function mountFolder() {
    void duckActions().mountFolder()
  }
</script>

{#if canImport}
  {#if !isFileSystemSupported}
    <div class="p-3 text-center {cls}">
      <p class="text-xs text-fg-3">
        File System Access not supported.
        <br />
        Use Chrome or Edge 86+.
      </p>
    </div>
  {:else}
    <div class={cls}>
      <div class="flex h-7 items-center justify-between pl-3 pr-1.5">
        <span class="text-[11px] font-medium uppercase tracking-wider text-fg-3">Files</span>
        <Button icon variant="ghost" size="xs" onclick={mountFolder} title="Add folder" aria-label="Add folder">
          <FolderPlus size={14} />
        </Button>
      </div>

      {#if mountedFolders.length > 0}
        <ul class="flex flex-col gap-px px-1">
          {#each mountedFolders as folder (folder.id)}
            <MountedFolderNode
              {folder}
              {actions}
              onunmount={(id) => void duckActions().unmountFolder(id)}
              onrequestpermission={requestPermission}
            />
          {/each}
        </ul>
      {:else}
        <div class="px-3 py-4 text-center">
          <FolderOpen size={20} strokeWidth={1.5} class="mx-auto mb-2 text-fg-4" />
          <p class="mb-2 text-xs text-fg-3">No folders mounted</p>
          <Button variant="outline" size="sm" onclick={mountFolder}>
            <FolderPlus size={13} />
            Add folder
          </Button>
        </div>
      {/if}
    </div>

    <ContextMenu open={menu !== null} x={menu?.x ?? 0} y={menu?.y ?? 0} items={menu?.items ?? []} onclose={() => (menu = null)} />

    <ImportOptionsPopover
      open={popover !== null}
      fileName={popover?.file.name ?? ''}
      x={popover?.x ?? 0}
      y={popover?.y ?? 0}
      onimport={(options) => popover && runImport(popover.folderId, popover.file, options)}
      onclose={() => (popover = null)}
    />
  {/if}
{/if}
