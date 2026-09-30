import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    // cli/ is plain Node ESM, tested alongside the app.
    include: ['src/**/*.test.ts', 'cli/**/*.test.js'],
    // The engine drivers read Vite's build-time globals at import time, so
    // they must exist before any module in the graph is evaluated.
    setupFiles: ['./src/test/setup.ts'],
    // Ships uncompiled .svelte files, so it has to go through the plugin.
    server: { deps: { inline: ['svelte-sonner'] } },
  },
  define: {
    __DUCK_UI_VERSION__: JSON.stringify('0.0.0-test'),
    __DUCK_UI_RELEASE_DATE__: JSON.stringify('1970-01-01'),
    __DUCK_UI_BUILD_DUCKDB_CDN_ONLY__: JSON.stringify(false),
  },
})
