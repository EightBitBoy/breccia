import { existsSync, readFileSync } from 'node:fs'
import type { Plugin } from 'vite'

const ID = 'virtual:changelog'
const RESOLVED = '\0' + ID

// Serves the repository's CHANGELOG.md as the module `virtual:changelog` (its text as the default export).
export function changelogPlugin(file: string): Plugin {
  return {
    name: 'breccia-changelog',
    resolveId(id) {
      return id === ID ? RESOLVED : null
    },
    load(id) {
      if (id !== RESOLVED) return null
      if (!existsSync(file)) throw new Error(`CHANGELOG.md not found at ${file}`)
      this.addWatchFile(file)
      return `export default ${JSON.stringify(readFileSync(file, 'utf8'))}`
    },
  }
}
