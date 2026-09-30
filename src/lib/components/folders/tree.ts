import type { FileEntry } from "@/lib/fileSystem";
import type { ContextMenuItem } from "../common/ContextMenu.svelte";

/** Callbacks every node of the folder tree hands up to FolderBrowser. */
export interface TreeActions {
  /** A file row was activated. */
  select: (folderId: string, file: FileEntry, anchor: DOMRect) => void;
  /** The import button of a file row was pressed. */
  importOptions: (folderId: string, file: FileEntry, anchor: DOMRect) => void;
  /** Open the shared context menu at a viewport position. */
  menu: (items: ContextMenuItem[], x: number, y: number) => void;
  /** "Quick Import as Table": no options popover. */
  quickImport: (folderId: string, file: FileEntry) => void;
}
