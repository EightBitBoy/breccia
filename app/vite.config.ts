import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [svelte()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  // One bundle for a desktop app; CodeMirror makes it larger than the default limit.
  build: { target: 'es2022', chunkSizeWarningLimit: 1024 },
  // The layout worker is a module worker (our own file, loaded from 'self').
  worker: { format: 'es' },
  test: { environment: 'node', css: true, passWithNoTests: true },
})
