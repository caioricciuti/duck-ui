import { defineConfig, loadEnv } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'
import pkg from './package.json' with { type: 'json' }

// Applied by `vite preview` and the Docker serve config (serve.json, keep the
// two in sync). Not applied to `vite dev`, whose HMR needs inline scripts.
// 'wasm-unsafe-eval' is DuckDB WASM and Pyodide; jsDelivr is the optional WASM
// CDN mode and the default Pyodide source for Python notebook cells; broad
// connect-src is the point of the app (httpfs reads, external servers, AI
// providers). No 'unsafe-inline' for scripts: env.js and theme.js are real files.
const CSP = [
  "default-src 'self'",
  "script-src 'self' blob: 'wasm-unsafe-eval' https://cdn.jsdelivr.net",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https: http: data: blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

// DuckDB OPFS and the Python kernel's SharedArrayBuffer need cross-origin isolation.
const ISOLATION_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
}

export default defineConfig(({ mode }) => {
  // Only DUCK_UI_ prefixed vars are loaded, so CI secrets cannot leak into the bundle.
  const env = loadEnv(mode, process.cwd(), 'DUCK_UI_')
  const buildDuckdbCdnOnly = env.DUCK_UI_DUCKDB_WASM_CDN_ONLY === 'true'

  // Keys that are not valid JS identifiers are skipped (Windows exposes env
  // vars like "=::"). See https://github.com/caioricciuti/duck-ui/issues/26
  const envDefines: Record<string, string> = {}
  for (const key in env) {
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
      envDefines[`import.meta.env.${key}`] = JSON.stringify(env[key])
    }
  }

  return {
    appType: 'spa',
    base: process.env.DUCK_UI_BASEPATH ?? '/',
    plugins: [svelte(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
      dedupe: [
        '@codemirror/state',
        '@codemirror/view',
        '@codemirror/language',
        '@codemirror/autocomplete',
        '@codemirror/commands',
        '@codemirror/search',
        '@lezer/common',
        '@lezer/highlight',
        '@lezer/lr',
      ],
    },
    server: {
      host: '127.0.0.1',
      port: 5173,
      headers: ISOLATION_HEADERS,
    },
    preview: {
      host: '127.0.0.1',
      headers: { ...ISOLATION_HEADERS, 'Content-Security-Policy': CSP },
    },
    define: {
      __DUCK_UI_VERSION__: JSON.stringify(pkg.version),
      __DUCK_UI_RELEASE_DATE__: JSON.stringify(pkg.release_date),
      __DUCK_UI_BUILD_DUCKDB_CDN_ONLY__: JSON.stringify(buildDuckdbCdnOnly),
      ...envDefines,
    },
    build: {
      target: 'es2022',
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined
            if (id.includes('@codemirror') || id.includes('@lezer')) return 'codemirror'
            if (id.includes('lucide-svelte')) return 'icons'
            if (id.includes('uplot')) return 'charts'
            return undefined
          },
        },
      },
    },
  }
})
