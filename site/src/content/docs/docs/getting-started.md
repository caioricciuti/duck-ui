---
title: "Getting Started"
description: "Install Duck-UI via Docker, Docker Compose, or build from source, then find your way around"
---

Welcome to Duck-UI! This guide will help you get up and running quickly with a DuckDB workbench that runs in your browser.

## Quick Start

Choose your preferred installation method:

## Docker (Recommended)

### Simple Docker Setup

```bash
docker run --name duck-ui -p 5522:5522 ghcr.io/caioricciuti/duck-ui:latest
```

Access at: `http://localhost:5522`

### Docker with Environment Variables

Connect to an external DuckDB server. Name, host and port must all be set or the connection is skipped:

```bash
docker run --name duck-ui -p 5522:5522 \
  -e DUCK_UI_EXTERNAL_CONNECTION_NAME="My DuckDB Server" \
  -e DUCK_UI_EXTERNAL_HOST="http://duckdb-server" \
  -e DUCK_UI_EXTERNAL_PORT="8000" \
  -e DUCK_UI_EXTERNAL_USER="username" \
  -e DUCK_UI_EXTERNAL_PASS="password" \
  ghcr.io/caioricciuti/duck-ui:latest
```

## Docker Compose

### Basic Docker Compose

For a simple setup:

```yaml
services:
  duck-ui:
    image: ghcr.io/caioricciuti/duck-ui:latest
    restart: unless-stopped
    ports:
      - "5522:5522"
    environment:
      # External Connection (optional)
      DUCK_UI_EXTERNAL_CONNECTION_NAME: "${DUCK_UI_EXTERNAL_CONNECTION_NAME}"
      DUCK_UI_EXTERNAL_HOST: "${DUCK_UI_EXTERNAL_HOST}"
      DUCK_UI_EXTERNAL_PORT: "${DUCK_UI_EXTERNAL_PORT}"
      DUCK_UI_EXTERNAL_USER: "${DUCK_UI_EXTERNAL_USER}"
      DUCK_UI_EXTERNAL_PASS: "${DUCK_UI_EXTERNAL_PASS}"
      DUCK_UI_EXTERNAL_DATABASE_NAME: "${DUCK_UI_EXTERNAL_DATABASE_NAME}"

      # Extensions (optional)
      DUCK_UI_ALLOW_UNSIGNED_EXTENSIONS: "${DUCK_UI_ALLOW_UNSIGNED_EXTENSIONS:-false}"
```

Start the service:

```bash
docker-compose up -d
```

## Build from Source

### Clone Repository

```bash
git clone https://github.com/caioricciuti/duck-ui.git
cd duck-ui
```

### Install Dependencies

```bash
bun install
```

### Build Project

```bash
bun run build
```

### Start Server

For production:

```bash
bun run preview
```

For development:

```bash
bun run dev
```

## System Requirements

### Prerequisites

- **For Docker**: Docker Engine 20.10.0 or newer
- **For building from source**:
  - Node.js >= 20.x or Bun >= 1.0
  - Modern web browser (Chrome 88+, Firefox 79+, Safari 14+)

> **No Database Server Required!**: Duck-UI runs DuckDB entirely in your browser using WebAssembly (WASM). You don't need to install or run a separate database server for local analysis.

## Configuration Options

### Environment Variables

Duck-UI supports various environment variables for customization:

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| **External Connection** |
| `DUCK_UI_EXTERNAL_CONNECTION_NAME` | Display name for external connection | No | `""` |
| `DUCK_UI_EXTERNAL_HOST` | External DuckDB HTTP server URL (may include a path) | No | `""` |
| `DUCK_UI_EXTERNAL_PORT` | External DuckDB server port | No | `null` |
| `DUCK_UI_EXTERNAL_USER` | Username for external connection | No | `""` |
| `DUCK_UI_EXTERNAL_PASS` | Password for external connection | No | `""` |
| `DUCK_UI_EXTERNAL_API_KEY` | API key sent as `X-API-Key` (takes priority over user/pass) | No | `""` |
| `DUCK_UI_EXTERNAL_DATABASE_NAME` | Database name | No | `""` |
| **Extensions** |
| `DUCK_UI_ALLOW_UNSIGNED_EXTENSIONS` | Allow unsigned DuckDB extensions | No | `false` |

For detailed environment variable documentation, see our [Environment Variables Reference](/docs/environment-variables).

## Getting Around

### Workspace and pages

Queries, notebooks, dashboards and tables open as **tabs** in the workspace. Tabs stay mounted while hidden, so a running query survives switching. Everything else is a **page** with its own sidebar, reached from the groups on the left rail:

| Rail group | Pages |
|------------|-------|
| **Query** | The workspace with your tabs |
| **Library** | Dashboards, Saved queries, History |
| **Data** | Connections, Extensions |
| **Share live** | Live session: host or join a session with another browser ([Live Sessions](/docs/live-sessions)) |
| **Settings** | Profile, General (theme), AI, Performance (memory limit, rows per result), Project (export and import) |

The current page lives in the URL, for example `?page=settings&section=ai`, so a reload on any static host lands on the same page.

### Split view

Two tabs can sit side by side, each pane with its own tab bar:

- Drag a tab to the left or right edge of the workspace, or right click it and choose **Split right**, or press `⌥S`.
- Drag a tab onto the other bar, or press `⌥S` again, to move it across. **Join panes** in the tab menu goes back to one pane.
- The pane you last clicked is the focused one: its tab has the yellow line, and new tabs open there.
- Drag the handle between the panes to resize them; double-click it for an even split.
- Closing the last tab of the right pane closes the pane.

Both panes keep running: a query on the left keeps going while you work on the right. The layout is saved with your tabs. On a phone the tabs share one pane.

The **Home** tab is pinned: it is always the first tab, shows only its icon, and cannot be closed or moved.

### Tables

Double-click a table in the explorer, or pick it in the command menu, to open it as a tab. Right click offers **Open table** and **Query table**. A table tab has four views:

| View | What it shows |
|------|---------------|
| **Data** | The rows, in the same grid as a query result. When the table has more rows than the row limit, sorting and filtering run in DuckDB over the whole table |
| **Schema** | One row per column: type, nullability, key and default |
| **Stats** | A card per column with fill rate, distinct count, min, max, average and quartiles, plus a histogram for numbers or the top values for everything else |
| **DDL** | The `CREATE` statement DuckDB keeps for the table or view, with a copy button |

**Query** in the tab header opens a SQL tab on the table. Opening a table that already has a tab focuses that tab. Table tabs are restored after a reload; one whose table no longer exists in the current connection says so.

### Keyboard shortcuts

`⌘` is `Ctrl` on Windows and Linux.

| Shortcut | What it does |
|----------|--------------|
| `⌘Enter` | Run the selection, or the statement under the cursor |
| `⌘Shift+Enter` | Run the whole tab |
| `Alt+F` | Format the SQL |
| `⌘F` | Search in the editor |
| `⌘K` | Open the command menu (pages, tabs, tables, saved queries, dashboards, recent queries) |
| `⌥N` | New query tab |
| `⌥W` | Close the current tab |
| `⌥S` | Move the current tab to the other pane, splitting the workspace if needed |
| `⌘B` | Toggle the explorer |

A failed query is underlined in the editor at the position DuckDB reports.

### Results

Below the editor, the result panel has **Table**, **Charts**, **Stats** and **Schema** views (and **Map** when the result has a GEOMETRY column). The grid sorts, filters and searches, supports cell selection with copy and a right click menu, and exports to CSV, JSON, XLSX and Parquet, straight to a download or into a mounted folder. When a result was cut at the row limit, sorting and filtering re-run the query in DuckDB over the whole answer, not over the rows on screen.

**Column stats** in the grid footer adds a summary under each column name: a histogram for numbers and dates, the share of `true` for booleans, one bar per value for text with up to 12 distinct values and a distinct count beyond that, plus the share of nulls. Hover it for the numbers. It describes the rows currently in the grid, so it follows the search box and the filters; past 100,000 rows it is drawn from an evenly spaced sample and the tooltip says so. The choice is remembered in the browser.

**1,000** in the grid footer turns thousands separators on or off. They are on by default, except for integer columns named like an id, a year or a postal code (`id`, `user_id`, `orderId`, `year`, `year_built`, `zip`, `postcode`), which always print as plain digits.

### Mobile

Below 768px the rail moves to the bottom of the screen and the explorer becomes a drawer. Duck-UI is also installable as a PWA and works offline after the first visit.

## Features Overview

### WASM Mode (Default)
- **Browser-based**: DuckDB runs entirely in your browser
- **No server required**: All processing happens client-side
- **Privacy**: Your data never leaves your machine
- **Fast**: Leverages WebAssembly for near-native performance

### OPFS Storage
- **Persistent databases**: Store databases in Origin Private File System
- **Cross-session**: Data persists across browser sessions
- **Where**: Add a "Browser Storage (OPFS)" connection on the Connections page

### External Connections
- **Remote DuckDB**: Connect to DuckDB HTTP servers
- **Shared access**: Multiple users can access the same database
- **Configuration**: Add them on the Connections page, or pre-configure one with environment variables

### Data Import
- **Multiple formats**: Import CSV, JSON, Parquet, Arrow, XLSX and `.duckdb` files
- **URL support**: Import directly from HTTP/HTTPS URLs
- **Query import**: Create tables from SQL query results
- **Preview mode**: Preview data before importing
- **Where**: The import button in the explorer header, or drop a file on the explorer

### Persistent Folder Access
- **Mount folders**: Add folders from your computer directly in Duck-UI
- **Persists across sessions**: Folder selections are remembered via IndexedDB
- **Tree view browser**: Navigate your files with an intuitive interface
- **One-click import**: Right-click any file to import as a DuckDB table
- **Chrome/Edge only**: Requires File System Access API (Chrome/Edge 86+)

> **Browser Support for Folder Access**: Folder access requires Chrome or Edge 86+. Firefox and Safari users can still use the standard file import feature.

See [Folder Access Documentation](/docs/folder-access) for complete details.

### Duck Brain AI
- **Natural language to SQL**: Ask questions in plain English
- **Local server**: Ollama, LM Studio, or any OpenAI compatible endpoint
- **Cloud AI**: OpenAI or Anthropic with your own API key
- **In-browser model**: Runs via WebGPU (Chrome/Edge 113+), experimental
- **Schema-aware**: Understands your tables and columns
- **Privacy-first**: Only your schema is sent, never your data, unless you explicitly agree to send a sample

> **WebGPU for in-browser models**: The in-browser provider requires WebGPU, available in Chrome/Edge 113+. Every other provider works in any browser.

See [Duck Brain Documentation](/docs/duck-brain) for complete details.

## Development Environment

### Running Locally

Clone and run Duck-UI in development mode:

```bash
# Clone repository
git clone https://github.com/caioricciuti/duck-ui.git
cd duck-ui

# Install dependencies
bun install

# Start development server
bun run dev
```

Access at: `http://localhost:5173`

> **Hot Module Replacement**: Development mode includes HMR for instant updates as you make changes.

## Browser Compatibility

Duck-UI requires a modern browser with WebAssembly support:

| Browser | Minimum Version | Notes |
|---------|----------------|-------|
| Chrome | 88+ | Full support including OPFS |
| Edge | 88+ | Full support including OPFS |
| Firefox | 79+ | WASM support, OPFS in progress |
| Safari | 14+ | WASM support, limited OPFS |

## Usage Examples

### Import CSV from URL

```sql
CREATE TABLE my_data AS
SELECT * FROM read_csv('https://example.com/data.csv');
```

### Query Parquet Files

```sql
SELECT * FROM read_parquet('https://example.com/data.parquet')
WHERE date > '2024-01-01'
LIMIT 100;
```

### Use OPFS Database

```sql
-- Create persistent database
ATTACH 'my_database.db' AS mydb;

-- Use it
CREATE TABLE mydb.users (id INT, name VARCHAR);
INSERT INTO mydb.users VALUES (1, 'Alice'), (2, 'Bob');
```

## Next Steps

- [Environment Variables](/docs/environment-variables) - Configure Duck-UI
- [Troubleshooting](/docs/troubleshooting) - Common issues and solutions
- [GitHub Discussions](https://github.com/caioricciuti/duck-ui/discussions) - Ask questions
- [Changelog](https://github.com/caioricciuti/duck-ui/releases) - Latest updates

---

### Support the Project

If you find Duck-UI helpful, consider:

[![Buy Me A Coffee](https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&emoji=&slug=caioricciuti&button_colour=D99B43&font_colour=ffffff&font_family=Cookie&outline_colour=000000&coffee_colour=FFDD00)](https://buymeacoffee.com/caioricciuti)
