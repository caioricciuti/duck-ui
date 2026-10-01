---
title: "Persistent Folder Access"
description: "Mount local folders using the File System Access API"
---

Mount folders from your computer and work with local files directly in DuckDB. Your folder selections persist across browser sessions, so you can pick up right where you left off.

## Overview

Persistent Folder Access uses the **File System Access API** to give Duck-UI direct read access to folders on your computer. Unlike traditional file imports where you manually select files each time, mounted folders:

- **Persist across sessions** - Your folder selections are remembered using IndexedDB
- **Show real-time contents** - See all supported files in your folders with a tree view
- **Enable one-click import** - Right-click any file to import it as a DuckDB table
- **Maintain live access** - Files are read on-demand, always reflecting current disk contents
- **Receive exports** - The result export menu can save CSV, JSON, XLSX or Parquet straight into a mounted folder

> **Browser Compatibility**: This feature requires a modern Chromium-based browser. See the [Browser Support](#browser-support) section below.

## Browser Support

| Browser | Version | Support |
|---------|---------|---------|
| Chrome | 86+ | Full support |
| Edge | 86+ | Full support |
| Opera | 72+ | Full support |
| Firefox | - | Not supported |
| Safari | - | Not supported |

If you're using an unsupported browser, you'll see a message in the Files section indicating that the File System Access API is not available. You can still use the standard [file import](/docs/getting-started#data-import) feature.

## Getting Started

### Step 1: Add a Folder

1. Open the **Explorer** (left panel, `⌘B` toggles it)
2. Find the **Files** section below the schema tree
3. Click the **Add folder** button in the section header (or the **Add folder** button shown while no folder is mounted)
4. Choose a folder from your computer in the system dialog
5. Grant read permission when prompted

### Step 2: Browse Files

Once mounted, your folder appears in the "Files" section with a tree view:

- **Click** a folder to expand/collapse it
- **Supported files** are shown with type-specific icons
- **File sizes** are displayed next to each file
- **Subfolders** can be expanded recursively

### Step 3: Import to DuckDB

Two ways to import a file:

- **Right-click** a file and choose **Quick Import as Table**. The table name is derived from the filename (`sales_data.csv` becomes `sales_data`)
- Hover a file and click its **Import** button to open the import options: choose the table name and whether to create a **table** (a copy of the data) or a **view** (linked to the file)

## Supported File Types

| Extension | Format | Description |
|-----------|--------|-------------|
| `.csv`, `.tsv` | CSV | Comma or tab separated values |
| `.json` | JSON | JSON objects/arrays |
| `.jsonl`, `.ndjson` | JSON Lines | Newline-delimited JSON |
| `.parquet` | Parquet | Apache Parquet columnar format |
| `.arrow`, `.ipc` | Arrow | Apache Arrow IPC, file or stream format. Always imported as a table, since a view has nothing to point at |
| `.xlsx` | Excel | Microsoft Excel spreadsheets |
| `.duckdb`, `.db`, `.ddb` | DuckDB | DuckDB database files, attached rather than copied |

Files with other extensions are hidden from the tree view. Legacy `.xls` has no DuckDB reader.

## How It Works

### File System Access API

Duck-UI uses the browser's [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API) to request folder access:

```javascript
// User selects a folder via system dialog
const handle = await window.showDirectoryPicker({ mode: 'read' });
```

Saving an export into a folder asks for write permission on that folder at that moment.

### Persistence with IndexedDB

Folder handles are stored in IndexedDB, which allows them to persist across browser sessions:

- **First visit**: You select folders and grant permission
- **Return visits**: Folders are remembered, but permission must be re-granted (browser security requirement)

### Permission Model

For security, browsers require explicit user consent:

1. **Initial access**: User must click "Add folder" and select via system dialog
2. **On reload**: Browser may prompt to re-grant permission for existing folders
3. **No silent access**: Duck-UI cannot access folders without user interaction

A warning icon appears next to folders that need permission re-granted.

## Managing Folders

### Refresh Contents

Right-click a mounted folder (or open its actions menu) and select **Refresh** to reload its contents.

### Remove a Folder

Right-click a mounted folder (or open its actions menu) and select **Unmount** to remove it from the list. This only removes the folder from Duck-UI - your files remain untouched.

### Multiple Folders

You can mount multiple folders simultaneously. Each folder maintains its own expanded/collapsed state.

## Troubleshooting

### "File System Access not supported"

Your browser doesn't support the File System Access API. Use Chrome, Edge, or Opera version 86 or newer.

### "Permission denied"

You declined the permission prompt. Click on the folder (which shows a warning icon) to trigger a new permission request.

### Folder shows warning icon

After a page reload, browsers require you to re-grant permission to access folders. Click on the folder to approve access.

### Files not appearing

Only [supported file types](#supported-file-types) are shown. Files with other extensions are filtered out.

### Large folders are slow

For folders with thousands of files, initial loading may take a moment. Consider mounting a more specific subfolder.

## Best Practices

1. **Mount specific folders** - Rather than your entire home directory, mount the specific data folder you need
2. **Use subfolder navigation** - Click into subfolders to browse nested data
3. **Keep files organized** - Use consistent naming conventions for easier table name generation
4. **Close unused folders** - Collapse folders you're not actively using to keep the interface clean

## Technical Details

### Components

- **FileSystemService** (`src/lib/fileSystem/index.ts`) - Core service for folder access and IndexedDB persistence
- **FolderBrowser** (`src/lib/components/folders/FolderBrowser.svelte`) - Tree view UI component
- **ExplorerPanel** (`src/lib/components/explorer/ExplorerPanel.svelte`) - Integration with the explorer

### State Management

Folder metadata lives in the app store (`src/store/createStore.ts`, a small framework free store with one slice per domain):

```typescript
interface MountedFolderInfo {
  id: string;
  name: string;
  addedAt: Date;
  hasPermission: boolean;
}
```

The actual `FileSystemDirectoryHandle` objects are stored in IndexedDB by `FileSystemService` (they cannot be serialized to localStorage). On startup the store reloads the folder list from there.
