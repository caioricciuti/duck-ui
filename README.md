# <img src="./public/logo.png" alt="Duck-UI Logo" title="Duck-UI Logo" width="40"> Duck-UI

**The fully open-source DuckDB workbench that runs in your browser.**

No install, no signup, no backend. Your data never leaves the tab.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE.md)
[![GitHub stars](https://img.shields.io/github/stars/caioricciuti/duck-ui)](https://github.com/caioricciuti/duck-ui/stargazers)
[![Release](https://img.shields.io/github/v/release/caioricciuti/duck-ui)](https://github.com/caioricciuti/duck-ui/releases)
[![Docker](https://img.shields.io/badge/docker-ghcr.io-blue)](https://github.com/caioricciuti/duck-ui/pkgs/container/duck-ui)

**[Try it now → duckui.com](https://duckui.com?utm_source=github&utm_medium=readme)** · [Docs](https://docs.duckui.com?utm_source=github&utm_medium=readme) · [Contributing](CONTRIBUTING.md)

![Duck-UI screenshot](./public/screenshot.png)

Or run it yourself:

```bash
docker run -p 5522:5522 ghcr.io/caioricciuti/duck-ui:latest
```

Open `http://localhost:5522`. That's the whole setup.

## What you get

- **Workspace and pages.** Queries, notebooks and dashboards are tabs. Connections, extensions, settings, saved queries, history and the dashboards list are pages with their own sidebar. `⌘K` finds any of them, plus tables, saved queries and recent queries.
- **SQL editor.** CodeMirror with completion from your catalog and from DuckDB itself, DuckDB dialect formatting, `EXPLAIN ANALYZE` viewer. `⌘Enter` runs the statement under the cursor, `⌘Shift+Enter` the whole tab. A failed query is underlined where DuckDB points.
- **Results grid.** Virtualized, with sort, filter, search, cell selection and copy, column statistics, exports to CSV, JSON, XLSX and Parquet. A result cut at the row limit is sorted and filtered in DuckDB over the whole answer, not over the rows on screen.
- **Notebooks.** SQL, Python (Pyodide, with `sql()` returning pandas DataFrames) and markdown cells, each with its own result and chart.
- **Dashboards.** Markdown reports with named SQL blocks, charts, tables, inputs and auto refresh. Shareable as a link.
- **Query parameters.** `$name` placeholders get an input bar, in SQL tabs and notebooks.
- **Compare results.** Pin a result and diff it against a later run: schema, row counts, changed cells.
- **Charts.** Bar, grouped, stacked, line, area, stacked area, pie, donut and scatter, with per series settings, aggregation and PNG export. Charts follow the theme.
- **Maps and extensions.** GEOMETRY results render on a map. Install and load DuckDB extensions from the Data page.
- **Import anything.** CSV, JSON, Parquet, Arrow, XLSX and `.duckdb` files. Drop a file on the explorer, paste a URL, or read straight from S3, GCS, Azure, R2 or MinIO. Local folders through the File System Access API.
- **History.** Every run is kept with duration and row count, searchable across reloads.
- **Duck Brain (AI).** Text to SQL and one click error fixing with your choice of provider: WebLLM fully in the browser (no API key, works offline), OpenAI, Anthropic, or any OpenAI compatible endpoint (Ollama, DeepSeek, ...). By default only your schema is sent, never your data; the optional "Explain results" action sends a small row sample and asks for consent every time. With WebLLM nothing leaves the browser.
- **Live sessions.** Invite another browser into your workspace over WebRTC. Shared editors with peer cursors, shared tables, no server.
- **Share and embed.** Encode a whole analysis (query, notebook, chart config) into a URL. No server involved. Embed live, runnable queries in any page with an iframe.
- **Persistence.** OPFS backed local databases that survive reloads, profiles, encrypted credential storage (AES-256-GCM in your browser). The workspace saves itself.
- **Connections.** In memory WASM, persistent OPFS, external [DuckDB httpserver](https://github.com/quackscience/duckdb-extension-httpserver) instances. DuckLake catalogs attach via the embedded database manifest, `?load=ducklake:` links, or plain ATTACH SQL.
- **Works on a phone.** Below 768px the rail moves to the bottom and the explorer becomes a drawer.
- **Deploy anywhere.** Docker image, static hosting, GitHub Pages subpaths, air gapped and offline setups (installable PWA), kiosk mode for publishing read only datasets.

The whole app is built on Svelte 5 and CodeMirror 6. The startup bundle is about 350 kB of JavaScript; everything else, including the AI runtime, loads the first time you use it.

## Why Duck-UI and not the official `duckdb -ui`?

Both are good tools. The differences that matter:

| | Duck-UI | Official DuckDB UI |
|---|---|---|
| Frontend source | MIT, all of it in this repo | Closed source |
| Runs from | Any static host, Docker, or a URL | Local `duckdb` process, UI assets loaded remotely |
| Works offline / air-gapped | Yes | No |
| Self-host / embed / kiosk | Yes | No |
| AI assistant | Bring your own provider, or fully local WebLLM | MotherDuck account |
| External DuckDB servers | Yes (httpserver) | Local + MotherDuck only |

If you just want a quick local UI and don't care about any of that, the official one is fine. Duck-UI is for when the answers to "can I host it, embed it, extend it, run it offline, and read the code" need to be yes.

## "Open in Duck-UI" links

Any hosted dataset can become a one-click, runnable analysis. Add `?load=` (and optionally `&sql=`) to the app URL. [Try this one](https://duckui.com/?load=https://blobs.duckdb.org/stations.parquet&sql=SELECT%20country%2C%20count(*)%20AS%20stations%20FROM%20stations%20GROUP%20BY%20country%20ORDER%20BY%20stations%20DESC):

```
https://duckui.com/?load=https://blobs.duckdb.org/stations.parquet
  &sql=SELECT country, count(*) AS stations FROM stations GROUP BY country ORDER BY stations DESC
```

Openers see exactly what will load and what will run, confirm once, and get a live editor over your data. Nothing touches a server. Parquet, CSV, JSON, `.duckdb` files, and `ducklake:` catalogs are supported. The Share dialog generates the link and a README badge for you:

[![Open in Duck-UI](./public/badge.svg)](https://duckui.com/)

The data host needs CORS enabled, see [hosting your data](docs/hosting-data.md) for a free R2/GitHub Pages setup. More examples in the [gallery](docs/gallery.md).

## Run locally from the command line

The `cli/` launcher serves the built app on `127.0.0.1` and opens it with your local files already queued to load, using the same `?load=` links as above:

```bash
bun run build                                   # once; the CLI serves dist/
node cli/duck-ui.js sales.csv events.parquet    # or: npx duck-ui ... once published
node cli/duck-ui.js db.duckdb --port 6000 --no-open --sql "SHOW ALL TABLES"
```

CSV/TSV, Parquet, JSON/NDJSON and `.duckdb` files are supported. Only `dist/` and the exact files you name are served (no directory listing or traversal), and requests must come from the local machine. The package is `"private": true`, so `npx duck-ui` works only after that flag is removed and the package (with a built `dist/`) is published.

## Publish a dataset with kiosk mode

Duck-UI doubles as a zero-backend data-publishing appliance. Drop a manifest next to the build, deploy to GitHub Pages, and visitors get a read-only SQL explorer for your data:

```json
{
  "ui": { "kiosk": true },
  "databases": [
    { "name": "My Dataset", "file": "ducklake:https://pub-xxxx.r2.dev/catalog.ducklake" }
  ]
}
```

Bundled `.db` files, remote files over HTTPS, S3, and DuckLake catalogs are all supported. Remote sources are attached in place and read-only by default. See [`public/databases/README.md`](public/databases/README.md) for the full manifest format and deploy steps.

## Configuration

Runtime environment variables (Docker):

| Variable | Description | Default |
|----------|-------------|---------|
| `DUCK_UI_EXTERNAL_CONNECTION_NAME` | Name for a pre-configured external connection | "" |
| `DUCK_UI_EXTERNAL_HOST` | Host URL for external DuckDB (may include a path) | "" |
| `DUCK_UI_EXTERNAL_PORT` | Port for external DuckDB (NAME, HOST and PORT must all be set or the connection is skipped) | null |
| `DUCK_UI_EXTERNAL_API_KEY` | API key sent as `X-API-Key` (takes priority over user/pass) | "" |
| `DUCK_UI_EXTERNAL_USER` / `DUCK_UI_EXTERNAL_PASS` | Basic auth credentials | "" |
| `DUCK_UI_EXTERNAL_DATABASE_NAME` | Database name for the external connection | "" |
| `DUCK_UI_ALLOW_UNSIGNED_EXTENSIONS` | Allow unsigned DuckDB extensions | false |
| `DUCK_UI_DUCKDB_WASM_USE_CDN` | Load DuckDB WASM from CDN | false |
| `DUCK_UI_DUCKDB_WASM_BASE_URL` | Custom CDN base URL (the origin is added to the CSP automatically at container start) | auto jsDelivr |
| `DUCK_UI_PYODIDE_BASE_URL` | Where Python notebook cells load Pyodide from: a URL or same-origin path (e.g. `/pyodide/`) of a Pyodide 0.29.5 "full" distribution folder. A cross-origin URL's origin is added to the CSP at container start | `https://cdn.jsdelivr.net/pyodide/v0.29.5/full/` |
| `DUCK_UI_STUN_URLS` | Comma-separated STUN servers for live sessions. Set it empty for a LAN-only deployment with no STUN at all | Google's public STUN |
| `DUCK_UI_TURN_URLS` | Comma-separated TURN relays for live sessions between networks that cannot connect directly | none |
| `DUCK_UI_TURN_USERNAME` / `DUCK_UI_TURN_CREDENTIAL` | TURN credentials. They reach every browser that opens the app, so use a relay-only account | "" |

**Python cells.** Notebooks can hold Python cells, run by [Pyodide](https://pyodide.org) in a Web Worker that is only started (and only downloads Pyodide, ~10 MB plus packages) when the first Python cell runs. `sql("SELECT ...")` returns a pandas DataFrame from the notebook's active connection (Arrow IPC via pyarrow; columnar JSON as a fallback); `await sql_async(...)` works where the page is not cross-origin isolated. Imported packages that ship with Pyodide (numpy, pandas, matplotlib, ...) load on demand; open matplotlib figures render as PNGs. **Interrupt** terminates the worker, so variables from earlier cells are lost; runs also stop after 5 minutes. For air-gapped deployments, download the matching `pyodide-0.29.5.tar.bz2` release, serve its `pyodide/` folder (e.g. at `/pyodide/`) and set `DUCK_UI_PYODIDE_BASE_URL`. CSP: the shipped policy already allows the default source (`script-src https://cdn.jsdelivr.net`, `'wasm-unsafe-eval'`, `connect-src https:`); behind your own proxy, keep those (or your mirror's origin) in `script-src`/`connect-src`. `'unsafe-eval'` is not granted, so a third-party package whose native code relies on `eval` will fail to load under the policy.

Build-time: `DUCK_UI_BASEPATH=/subpath/` for subpath deploys, `DUCK_UI_DUCKDB_WASM_CDN_ONLY=true` for CDN-only artifacts.

Deployment guides: [reverse proxy / nginx](docs/reverse-proxy.md) · [hosting your data with CORS](docs/hosting-data.md)

## Develop

```bash
git clone https://github.com/caioricciuti/duck-ui.git
cd duck-ui
bun install
bun run dev   # http://localhost:5173
```

Checks, all of which CI runs:

```bash
bun run lint && bun run format:check && bun run typecheck && bun run test && bun run build
bun run test:e2e   # Playwright, against the production build
```

Architecture notes live in [docs/architecture](docs/architecture) and [CONTRIBUTING.md](CONTRIBUTING.md).

## Contributing

Issues and PRs welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first (it's short and it will save you time). Bug reports with a reproducible query are gold.

## License

MIT. See [LICENSE](LICENSE.md).

## Acknowledgements

[DuckDB](https://duckdb.org/) · [duckdb-wasm](https://github.com/duckdb/duckdb-wasm) · [Svelte](https://svelte.dev/) · [CodeMirror](https://codemirror.net/) · [Tailwind CSS](https://tailwindcss.com/) · [uPlot](https://github.com/leeoniya/uPlot) · [Lucide](https://lucide.dev/)

## Sponsors

### [qxip](https://qxip.net/?utm_source=duck-ui&utm_medium=sponsorship)

<img src="https://qxip.net/images/qxip.png" alt="qxip" title="qxip Logo" width="150">

Want to sponsor Duck-UI? [Get in touch](mailto:caio.ricciuti+sponsorship@outlook.com).
