---
title: "Introduction"
description: "Duck-UI overview: a DuckDB workbench that runs entirely in your browser"
---

## Quick Installation

### Docker

```bash
docker run --name duck-ui -p 5522:5522 \
  ghcr.io/caioricciuti/duck-ui:latest
```

Access at: `http://localhost:5522`

[Full Installation Guide](/docs/getting-started)

## What is Duck-UI?

Duck-UI is an open source workbench for **DuckDB**, the fast in-process analytical database. It runs DuckDB as WebAssembly inside your browser tab, so you get a SQL editor, notebooks, charts and dashboards without any server infrastructure. Your data never leaves the tab.

### Key Features

- **No Server Required**: DuckDB runs in your browser via WebAssembly
- **SQL Editor**: CodeMirror with completion from your catalog, DuckDB dialect formatting, run the statement under the cursor, and inline error marks where DuckDB points
- **Results**: Virtualized grid with sort, filter, search, cell selection and copy, column statistics, and exports to CSV, JSON, XLSX and Parquet
- **Notebooks**: SQL, Python (Pyodide) and markdown cells, each with its own result and chart
- **Markdown Dashboards**: Reports written as markdown with live SQL, charts, and input variables ([Dashboards](/docs/dashboards))
- **Charts**: Bar, grouped bar, stacked bar, line, area, stacked area, pie, donut and scatter, with PNG export ([Charts](/docs/charts))
- **Live Sessions**: Real-time collaboration between browsers, peer-to-peer, with shared data and visible cursors ([Live Sessions](/docs/live-sessions))
- **Duck Brain**: Natural language to SQL with a local server (Ollama, LM Studio), OpenAI, Anthropic, or a model running inside the browser ([Duck Brain](/docs/duck-brain))
- **Import Anything**: Load CSV, JSON, Parquet, Arrow, XLSX and `.duckdb` files from your computer or from URLs
- **Folder Access**: Mount folders from your computer; the selection persists across browser sessions ([Folder Access](/docs/folder-access))
- **Persistent Storage**: Save databases using OPFS for data that persists across sessions
- **External Connections**: Connect to remote DuckDB HTTP servers when needed
- **History**: Every run is kept with duration and row count, searchable across reloads
- **Share and Embed**: Encode an analysis into a URL, or embed a live query in any page ([Embedding](/docs/embedding))
- **Works on a phone**: Below 768px the rail moves to the bottom and the explorer becomes a drawer
- **Installable**: Duck-UI is a PWA and works offline after the first visit
- **Privacy First**: All data processing happens client-side

### How the app is organised

Queries, notebooks and dashboards open as tabs in the workspace. Everything else is a page with its own sidebar, reached from the groups on the left rail:

| Rail group | Pages |
|------------|-------|
| **Query** | The workspace with your tabs |
| **Library** | Dashboards, Saved queries, History |
| **Data** | Connections, Extensions |
| **Settings** | Profile, General, AI, Performance, Project |

Pages live in the URL (`?page=settings&section=ai`), so a reload or a bookmark lands on the same place. `⌘K` (`Ctrl+K` on Windows and Linux) opens the command menu, which finds pages, tabs, tables, saved queries, dashboards and recent queries.

## Requirements

- Modern web browser with WebAssembly support:
  - Chrome/Edge 88+
  - Firefox 79+
  - Safari 14+
- Docker (for containerized deployment) or Bun/Node.js 20+ (for building from source)
- **No database server needed** for local WASM mode

## Use Cases

### Data Analysis

Analyze CSV, JSON, or Parquet files directly in your browser without uploading to a server:

```sql
SELECT product, SUM(sales) as total_sales
FROM read_csv('sales_data.csv')
GROUP BY product
ORDER BY total_sales DESC;
```

### Quick Prototyping

Test SQL queries and data transformations without setting up infrastructure:

```sql
-- Load data from URL
CREATE TABLE products AS
SELECT * FROM read_parquet('https://example.com/products.parquet');

-- Run analytics
SELECT category, AVG(price) as avg_price
FROM products
GROUP BY category;
```

### Learning SQL

Perfect environment for learning SQL with instant feedback and no setup:

- Import sample datasets
- Write queries with autocomplete
- See results immediately
- No database configuration needed

## Sponsors

We would like to thank our sponsors for their support:

### QXIP

[qxip.net](https://qxip.net/?utm_source=duck-ui&utm_medium=docs): Next-Gen Telecom Observability. R&D Company pioneering Open-Source and Commercial Observability and Telecom Monitoring Technology development.

[**Become a Sponsor**](https://github.com/sponsors/caioricciuti)

## Support

- [Documentation](/docs/getting-started)
- [Report Issues](https://github.com/caioricciuti/duck-ui/issues)
- [Discussions](https://github.com/caioricciuti/duck-ui/discussions)
- [Star on GitHub](https://github.com/caioricciuti/duck-ui)

## License

Duck-UI is open source software [licensed under MIT](/docs/license).

---

[![Buy Me A Coffee](https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&emoji=&slug=caioricciuti&button_colour=D99B43&font_colour=ffffff&font_family=Cookie&outline_colour=000000&coffee_colour=FFDD00)](https://buymeacoffee.com/caioricciuti)
