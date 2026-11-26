import { svelte } from '@sveltejs/vite-plugin-svelte'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { changelogPlugin } from './changelog-plugin.ts'

export default defineConfig({
  plugins: [svelte(), changelogPlugin(fileURLToPath(new URL('../CHANGELOG.md', import.meta.url)))],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  // One bundle for a desktop app; CodeMirror makes it larger than the default limit.
  build: { target: 'es2022', chunkSizeWarningLimit: 1024 },
  // The layout worker is a module worker (our own file, loaded from 'self').
  worker: { format: 'es' },
  // Vitest: Svelte's client build, so `$effect` and `flushSync` work in `*.svelte.test.ts` (see vitest-client-env.ts).
  resolve: process.env.VITEST ? { alias: [{ find: /^svelte$/, replacement: fileURLToPath(new URL('./node_modules/svelte/src/index-client.js', import.meta.url)) }] } : undefined,
  test: {
    css: true,
    passWithNoTests: true,
    projects: [
      { extends: true, test: { name: 'unit', environment: 'node', exclude: ['**/node_modules/**', '**/*.svelte.test.ts'] } },
      { extends: true, test: { name: 'client', environment: './vitest-client-env.ts', include: ['src/**/*.svelte.test.ts'] } },
    ],
  },
})
