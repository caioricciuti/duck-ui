import { defineConfig, loadEnv } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
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
    plugins: [
      svelte(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['logo.png', 'logo-light.png', 'logo-padding.png', 'logo-192.png', 'badge.svg'],
        manifest: {
          name: 'Duck-UI',
          short_name: 'Duck-UI',
          description:
            'DuckDB in your browser: SQL editor, notebooks, charts, and AI, fully local.',
          theme_color: '#000000',
          background_color: '#000000',
          display: 'standalone',
          start_url: '.',
          icons: [
            { src: 'logo-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'logo-padding.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: 'logo-padding.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          // Precache only the app shell. Precaching every chunk would push
          // tens of megabytes to first-time visitors (exceljs, both DuckDB
          // workers, the map). Hashed /assets/* chunks, the WASM binaries and
          // AI models are cached at runtime on first use instead, so after
          // one session the app works fully offline.
          globPatterns: [
            'index.html',
            'registerSW.js',
            'manifest.webmanifest',
            '*.{svg,png,ico}',
            'theme.js',
            'fonts/*.woff2',
            'assets/index-*.{js,css}',
          ],
          globIgnores: ['**/env.js', '**/screenshot.png'],
          maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
          navigateFallback: 'index.html',
          runtimeCaching: [
            {
              // Hashed build chunks (immutable filenames), cached as the app
              // loads them.
              urlPattern: /\/assets\/.+\.(js|css)$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'duckui-chunks',
                expiration: { maxEntries: 300 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              // Same-origin WASM (DuckDB engine bundles)
              urlPattern: /\.wasm$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'duckui-wasm',
                expiration: { maxEntries: 12 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /^https:\/\/(community-)?extensions\.duckdb\.org\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'duckdb-extensions',
                expiration: { maxEntries: 60 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              // Pyodide (Python cells): a pinned, versioned path whose files
              // never change, and large enough (runtime + wheels) that it
              // must not evict the DuckDB bundles from the jsdelivr cache.
              urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/pyodide\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'pyodide',
                expiration: { maxEntries: 80, maxAgeSeconds: 30 * 24 * 60 * 60 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              // StaleWhileRevalidate (not CacheFirst): this route caches
              // opaque no-cors responses, so a poisoned/failed entry must be
              // able to self-heal from the network.
              urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/.*/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'jsdelivr-cdn',
                expiration: { maxEntries: 40, maxAgeSeconds: 7 * 24 * 60 * 60 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              // Runtime config: fresh from the server when online, last-seen
              // value when offline (env.js is excluded from the precache).
              urlPattern: /\/env\.js$/,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'duckui-env',
                expiration: { maxEntries: 1 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
      }),
    ],
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
