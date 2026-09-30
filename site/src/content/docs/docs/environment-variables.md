---
title: "Environment Variables"
description: "Configuration reference for Docker and source builds"
---

Duck-UI can be configured using environment variables to customize its behavior, especially for connecting to external DuckDB instances and managing extensions.

## Core Configuration Variables

### External Connection Settings

These variables pre-configure a connection to an external DuckDB server (via HTTP API) next to the local WASM instance. `NAME`, `HOST` and `PORT` must all be set, or the connection is skipped.

| Variable | Description | Required | Default | Example |
|----------|-------------|----------|---------|---------|
| `DUCK_UI_EXTERNAL_CONNECTION_NAME` | Display name for the external connection in the UI | No | `""` | `"Production DuckDB"` |
| `DUCK_UI_EXTERNAL_HOST` | Base URL of the external DuckDB HTTP server (may include a path) | No | `""` | `"http://duckdb-server"` |
| `DUCK_UI_EXTERNAL_PORT` | Port number for the external DuckDB server | No | `null` | `8000` |
| `DUCK_UI_EXTERNAL_USER` | Username for basic authentication | No | `""` | `"admin"` |
| `DUCK_UI_EXTERNAL_PASS` | Password for basic authentication | No | `""` | `"your-password"` |
| `DUCK_UI_EXTERNAL_API_KEY` | API key sent as `X-API-Key`; takes priority over user and password | No | `""` | `"abc123"` |
| `DUCK_UI_EXTERNAL_DATABASE_NAME` | Database name to connect to | No | `""` | `"analytics"` |

### Runtime Settings

| Variable | Description | Required | Default | Example |
|----------|-------------|----------|---------|---------|
| `DUCK_UI_ALLOW_UNSIGNED_EXTENSIONS` | Allow loading unsigned DuckDB extensions | No | `false` | `"true"` |
| `DUCK_UI_DUCKDB_WASM_USE_CDN` | Enable loading DuckDB WASM and worker files from CDN (ignored when `DUCK_UI_DUCKDB_WASM_CDN_ONLY=true` at build time) | No | `false` | `"true"` |
| `DUCK_UI_DUCKDB_WASM_BASE_URL` | Custom CDN base URL (when `DUCK_UI_DUCKDB_WASM_USE_CDN=true`). The origin is added to the CSP automatically at container start | No | Auto (`duckdb.getJsDelivrBundles()`) | `"https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.33.1-dev64.0/dist"` |
| `DUCK_UI_PYODIDE_BASE_URL` | Where Python notebook cells load Pyodide from: a URL or a same-origin path of a Pyodide 0.29.5 "full" distribution folder. A cross-origin URL's origin is added to the CSP at container start | No | `https://cdn.jsdelivr.net/pyodide/v0.29.5/full/` | `"/pyodide/"` |

### Live session networking

Peer connections use a public STUN server by default. These variables override that. They are read from `env.js` like the settings above, but the Docker entrypoint does not write them in this version, so set them by editing `env.js` in the served folder (see [How Environment Variables Work](#how-environment-variables-work)).

| Variable | Description | Default |
|----------|-------------|---------|
| `DUCK_UI_STUN_URLS` | Comma-separated STUN URLs. Set empty for LAN-only or air-gapped deployments | `stun:stun.l.google.com:19302` |
| `DUCK_UI_TURN_URLS` | Optional TURN relay URLs for strict NATs | `""` |
| `DUCK_UI_TURN_USERNAME` / `DUCK_UI_TURN_CREDENTIAL` | Relay credentials | `""` |

### Build-time Settings

| Variable | Description | Required | Default | Example |
|----------|-------------|----------|---------|---------|
| `DUCK_UI_BASEPATH` | Serve the app from a subpath, for example on GitHub Pages. Also a Docker build argument | No | `/` | `"/duck-ui/"` |
| `DUCK_UI_DUCKDB_WASM_CDN_ONLY` | Build a CDN-only artifact (local DuckDB WASM files are not bundled). Suitable for edge platforms with strict asset size limits. | No | `false` | `"true"` |

When `DUCK_UI_DUCKDB_WASM_CDN_ONLY=true`, runtime `DUCK_UI_DUCKDB_WASM_USE_CDN=false` cannot switch back to local WASM because local assets are not included in the build.

> **Security Note**: Enabling unsigned extensions may pose security risks. Only enable this in trusted environments.

## Usage Examples

### Docker - Basic Setup

Run Duck-UI without any external connections (uses local WASM DuckDB):

```bash
docker run -p 5522:5522 ghcr.io/caioricciuti/duck-ui:latest
```

Access at: `http://localhost:5522`

### Docker - External DuckDB Connection

Connect Duck-UI to an external DuckDB server:

```bash
docker run -p 5522:5522 \
  -e DUCK_UI_EXTERNAL_CONNECTION_NAME="My DuckDB Server" \
  -e DUCK_UI_EXTERNAL_HOST="http://duckdb-server" \
  -e DUCK_UI_EXTERNAL_PORT="8000" \
  -e DUCK_UI_EXTERNAL_USER="username" \
  -e DUCK_UI_EXTERNAL_PASS="password" \
  -e DUCK_UI_EXTERNAL_DATABASE_NAME="my_database" \
  ghcr.io/caioricciuti/duck-ui:latest
```

### Docker - With Unsigned Extensions

Enable unsigned extensions for development/testing:

```bash
docker run -p 5522:5522 \
  -e DUCK_UI_ALLOW_UNSIGNED_EXTENSIONS="true" \
  ghcr.io/caioricciuti/duck-ui:latest
```

### Docker - CDN Loading

Load DuckDB WASM assets from CDN instead of the bundled files:

```bash
docker run -p 5522:5522 \
  -e DUCK_UI_DUCKDB_WASM_USE_CDN="true" \
  ghcr.io/caioricciuti/duck-ui:latest
```

Optionally specify a custom CDN base URL:

```bash
docker run -p 5522:5522 \
  -e DUCK_UI_DUCKDB_WASM_USE_CDN="true" \
  -e DUCK_UI_DUCKDB_WASM_BASE_URL="https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.33.1-dev64.0/dist" \
  ghcr.io/caioricciuti/duck-ui:latest
```

### Docker - Self-hosted Pyodide for Python cells

For air-gapped deployments, download the matching `pyodide-0.29.5.tar.bz2` release, serve its `pyodide/` folder, and point Duck-UI at it:

```bash
docker run -p 5522:5522 \
  -e DUCK_UI_PYODIDE_BASE_URL="https://files.internal/pyodide/" \
  ghcr.io/caioricciuti/duck-ui:latest
```

### Docker Compose Example

Create a `docker-compose.yml` file:

```yaml
services:
  duck-ui:
    image: ghcr.io/caioricciuti/duck-ui:latest
    restart: unless-stopped
    ports:
      - "5522:5522"
    environment:
      # External Connection (optional)
      DUCK_UI_EXTERNAL_CONNECTION_NAME: "Production DB"
      DUCK_UI_EXTERNAL_HOST: "http://duckdb-server"
      DUCK_UI_EXTERNAL_PORT: "8000"
      DUCK_UI_EXTERNAL_USER: "viewer"
      DUCK_UI_EXTERNAL_PASS: "secure-password"
      DUCK_UI_EXTERNAL_DATABASE_NAME: "analytics"

      # Extensions (optional)
      DUCK_UI_ALLOW_UNSIGNED_EXTENSIONS: "false"

      # CDN Loading (optional)
      # DUCK_UI_DUCKDB_WASM_USE_CDN: "true"
      # DUCK_UI_DUCKDB_WASM_BASE_URL: "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.33.1-dev64.0/dist"
```

Start the service:

```bash
docker-compose up -d
```

## Connection Types

Duck-UI supports three connection types. Add and edit them on the **Connections** page (Data group in the left rail):

### 1. WASM (Local)
- **Default mode** - DuckDB runs entirely in your browser
- **No server required** - All data processing happens client-side
- **Use case**: Local data analysis, CSV/Parquet file exploration

### 2. OPFS (Persistent)
- Store databases in the browser's Origin Private File System
- Data persists across browser sessions
- **Use case**: Frequently accessed local databases
- **Configuration**: Add a "Browser Storage (OPFS)" connection and name the database file

### 3. External (HTTP)
- Connect to a remote DuckDB server via HTTP API, such as the [DuckDB httpserver extension](https://github.com/quackscience/duckdb-extension-httpserver)
- **Use case**: Shared databases, production workloads
- **Configuration**: Add a "DuckDB HTTP Server" connection with basic auth or an API key, or pre-configure one with the `DUCK_UI_EXTERNAL_*` environment variables

## How Environment Variables Work

### Docker Runtime

Environment variables are processed when the Docker container starts:

1. Variables are read from the Docker environment
2. `inject-env.js` writes them to `/app/dist/env.js` as `window.env = { ... }`
3. The web application loads this file before its bundle and reads the values on startup
4. External connections appear on the Connections page if configured

### Build from Source

The runtime variables above are not baked into the bundle. They are read from `env.js` in the served folder (`public/env.js` in development, `dist/env.js` after a build). Two ways to set them:

1. Run the same script the Docker image runs, after `bun run build`:
   ```bash
   DUCK_UI_EXTERNAL_CONNECTION_NAME="Local Dev" \
   DUCK_UI_EXTERNAL_HOST="http://localhost" \
   DUCK_UI_EXTERNAL_PORT="8000" \
   DUCK_UI_ENV_DIR=dist bun inject-env.js
   ```
2. Or edit `env.js` by hand:
   ```javascript
   window.env = {
     DUCK_UI_EXTERNAL_CONNECTION_NAME: "Local Dev",
     DUCK_UI_EXTERNAL_HOST: "http://localhost",
     DUCK_UI_EXTERNAL_PORT: "8000",
   };
   ```

Build-time variables (`DUCK_UI_BASEPATH`, `DUCK_UI_DUCKDB_WASM_CDN_ONLY`) are read when `bun run build` runs, from the shell or a `.env` file.

## Troubleshooting

### External Connection Not Appearing

**Problem**: External connection doesn't show up on the Connections page

**Solutions**:
- Verify `DUCK_UI_EXTERNAL_CONNECTION_NAME`, `DUCK_UI_EXTERNAL_HOST` and `DUCK_UI_EXTERNAL_PORT` are all set; any one missing skips the connection
- Check Docker logs: `docker logs <container-name>`
- Ensure `DUCK_UI_EXTERNAL_HOST` includes the protocol (`http://` or `https://`)
- Confirm the external DuckDB server is accessible from the browser, not only from the container: the browser makes the requests

### Extension Loading Fails

**Problem**: Extensions fail to load

**Solutions**:
- Set `DUCK_UI_ALLOW_UNSIGNED_EXTENSIONS=true` for unsigned extensions
- Check browser console for error messages
- Verify the extension is compatible with DuckDB WASM; the Extensions page marks extensions without a build for this platform
- Ensure sufficient browser storage/memory

### Connection Timeout

**Problem**: External connection times out

**Solutions**:
- Check network connectivity between the browser and the DuckDB server
- Verify `DUCK_UI_EXTERNAL_HOST` and `DUCK_UI_EXTERNAL_PORT` are correct
- Ensure firewall rules allow the connection
- Check DuckDB server logs for authentication failures

## Next Steps

- [Getting Started](/docs/getting-started) - Complete installation guide
- [Troubleshooting](/docs/troubleshooting) - Common issues and solutions
- [GitHub Issues](https://github.com/caioricciuti/duck-ui/issues) - Report bugs or request features
