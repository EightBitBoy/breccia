// A Vitest environment without a DOM that transforms for the client: Svelte compiles for the browser, so `$effect` runs.
import type { Environment } from 'vitest/runtime'

export default <Environment>{
  name: 'client-node',
  viteEnvironment: 'client',
  setup() {
    return { teardown() {} }
  },
}
