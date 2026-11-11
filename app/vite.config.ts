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
  test: { environment: 'node', css: true, passWithNoTests: true },
})
