import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { bundleProblems, mainBundle } from './bundle.mjs'

const assets = fileURLToPath(new URL('../dist/assets', import.meta.url))

describe('main bundle', () => {
  it('finds graph code and a size over the ceiling', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bundle-'))
    const file = join(dir, 'index-x.js')
    writeFileSync(file, 'const ok = 1\n')
    expect(bundleProblems(file)).toEqual([])
    writeFileSync(file, 'new WebGLRenderer()\n')
    expect(bundleProblems(file)).toEqual([
      'main bundle holds graph code ("WebGL"); load it lazily, like NetworkView',
    ])
    expect(bundleProblems(file, 5)[0]).toBe('main bundle is 20 bytes, over the ceiling of 5')
    expect(mainBundle(join(dir, 'missing'))).toBeNull()
  })

  // Runs on the real build: `just test` builds first. Without a build (a bare `npx vitest`), it is skipped.
  const built = mainBundle(assets)
  it.skipIf(built === null)('the built main bundle has no graph code and fits the ceiling', () => {
    expect(bundleProblems(built)).toEqual([])
  })
})
