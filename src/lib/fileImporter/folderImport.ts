import { toast } from "svelte-sonner";
import { useDuckStore } from "@/store";
import {
  fileSystemService,
  SUPPORTED_EXTENSIONS,
  type FileEntry,
  type FolderEntry,
  type FSEntry,
} from "@/lib/fileSystem";
import type { ImportMode } from "./types";

export interface ImportOptions {
  tableName: string;
  importMode: ImportMode;
}

/** Generate a valid table name from a filename. */
export function generateTableName(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, "") // Remove extension
    .replace(/[^a-zA-Z0-9_]/g, "_") // Replace special chars with underscore
    .replace(/^[0-9]/, "_$&") // Ensure doesn't start with number
    .replace(/_+/g, "_") // Collapse multiple underscores
    .replace(/^_|_$/g, ""); // Trim leading/trailing underscores
}

/** Name used by "Quick Import as Table", which skips the options popover. */
export function quickImportTableName(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/^[0-9]/, "_$&");
}

/** Lists one level of a subfolder: supported files and folders, folders first. */
export async function listFolderChildren(entry: FolderEntry): Promise<FSEntry[]> {
  const entries: FSEntry[] = [];

  for await (const child of entry.handle.values()) {
    const path = `${entry.path}/${child.name}`;
    if (child.kind === "file") {
      const fileHandle = child as FileSystemFileHandle;
      const lastDot = child.name.lastIndexOf(".");
      const extension = lastDot > 0 ? child.name.slice(lastDot).toLowerCase() : "";
      if (!SUPPORTED_EXTENSIONS.includes(extension)) continue;

      try {
        const file = await fileHandle.getFile();
        entries.push({
          name: child.name,
          path,
          type: "file",
          size: file.size,
          lastModified: new Date(file.lastModified),
          extension,
          handle: fileHandle,
        });
      } catch {
        // Skip files we can't read
      }
    } else if (child.kind === "directory") {
      entries.push({
        name: child.name,
        path,
        type: "folder",
        handle: child as FileSystemDirectoryHandle,
      });
    }
  }

  return entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * The reader for a folder file's extension. Variants go to the reader they
 * share: line-delimited JSON to read_json, Arrow IPC to the Arrow insert, and TSV
 * to read_csv with a tab, since the CSV options otherwise pin a comma.
 */
export function folderImportType(extension: string): {
  fileType: string;
  csv?: { delimiter: string };
} {
  const ext = extension.replace(/^\./, "").toLowerCase();
  if (ext === "jsonl" || ext === "ndjson") return { fileType: "json" };
  if (ext === "ipc") return { fileType: "arrow" };
  if (ext === "tsv") return { fileType: "csv", csv: { delimiter: "\t" } };
  return { fileType: ext };
}

const TOAST_ID = "folder-import";

/** Imports a file from a mounted folder as a table or view. Reports through toasts. */
export async function importFolderFile(
  folderId: string,
  file: FileEntry,
  options: ImportOptions
): Promise<void> {
  const { tableName, importMode } = options;
  const modeLabel = importMode === "view" ? "Linking" : "Importing";
  const resultLabel = importMode === "view" ? "view" : "table";

  try {
    toast.loading(`${modeLabel} ${file.name}...`, { id: TOAST_ID });

    const fileData = await fileSystemService.readFile(folderId, file.path);
    const buffer = await fileData.arrayBuffer();

    const { fileType, csv } = folderImportType(file.extension);

    const { importFile, fetchDatabasesAndTablesInfo } = useDuckStore.getState();
    await importFile(file.name, buffer, tableName, fileType, undefined, { importMode, csv });
    await fetchDatabasesAndTablesInfo();

    toast.success(`Created ${resultLabel} "${tableName}" from "${file.name}"`, { id: TOAST_ID });
  } catch (error) {
    console.error("Failed to import file:", error);
    toast.error(`Failed to import: ${error instanceof Error ? error.message : "Unknown error"}`, {
      id: TOAST_ID,
    });
  }
}
