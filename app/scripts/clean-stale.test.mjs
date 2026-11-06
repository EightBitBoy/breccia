import { existsSync, mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cleanStale, sizeHint, targetSize } from './clean-stale.mjs'

const DAY = 86_400_000
const NOW = Date.UTC(2026, 10, 4)

/** A file of `size` bytes whose modification time is `ageDays` before NOW. */
function put(path, ageDays, size = 10) {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, 'x'.repeat(size))
  const t = new Date(NOW - ageDays * DAY)
  utimesSync(path, t, t)
}

function scratch() {
  const root = mkdtempSync(join(tmpdir(), 'clean-stale-'))
  const target = join(root, 'target')
  mkdirSync(target)
  return { root, target }
}

describe('cleanStale', () => {
  it('deletes old build outputs, keeps new ones and the newest of each artifact', () => {
    const { target } = scratch()
    const deps = join(target, 'debug', 'deps')
    // Three test programs of the same artifact: the two old ones go, the newest stays even though it is old, too.
    put(join(deps, 'board-aaaa1111.exe'), 40)
    put(join(deps, 'board-bbbb2222.exe'), 30)
    put(join(deps, 'board-cccc3333.exe'), 20)
    put(join(deps, 'board-aaaa1111.pdb'), 40)
    // An artifact with a recent file keeps it, and its old twin goes.
    put(join(deps, 'serde-1111aaaa.rlib'), 10)
    put(join(deps, 'serde-2222bbbb.rlib'), 1)
    // Underscores in the name are part of the artifact name.
    put(join(deps, 'breccia_core-1111aaaa.rmeta'), 9)
    put(join(deps, 'breccia_core-2222bbbb.rmeta'), 0)
    // Incremental sessions: the newest session of each crate stays, an old one goes.
    put(join(target, 'debug', 'incremental', 'breccia_core-xyz', 's-aaa-bbb-1', 'dep-graph.bin'), 30)
    put(join(target, 'debug', 'incremental', 'breccia_core-xyz', 's-aaa-bbb-2', 'dep-graph.bin'), 20)
    put(join(target, 'debug', 'incremental', 'other-xyz', 's-ccc-ddd-1', 'dep-graph.bin'), 50)

    const r = cleanStale(target, { now: NOW, days: 7 })

    expect(existsSync(join(deps, 'board-aaaa1111.exe'))).toBe(false)
    expect(existsSync(join(deps, 'board-bbbb2222.exe'))).toBe(false)
    expect(existsSync(join(deps, 'board-cccc3333.exe'))).toBe(true)
    expect(existsSync(join(deps, 'board-aaaa1111.pdb'))).toBe(true) // the only .pdb of its artifact
    expect(existsSync(join(deps, 'serde-1111aaaa.rlib'))).toBe(false)
    expect(existsSync(join(deps, 'serde-2222bbbb.rlib'))).toBe(true)
    expect(existsSync(join(deps, 'breccia_core-1111aaaa.rmeta'))).toBe(false)
    expect(existsSync(join(deps, 'breccia_core-2222bbbb.rmeta'))).toBe(true)
    const inc = join(target, 'debug', 'incremental')
    expect(existsSync(join(inc, 'breccia_core-xyz', 's-aaa-bbb-1'))).toBe(false)
    expect(existsSync(join(inc, 'breccia_core-xyz', 's-aaa-bbb-2'))).toBe(true)
    expect(existsSync(join(inc, 'other-xyz', 's-ccc-ddd-1'))).toBe(true)
    expect(r.removed).toBe(5)
    expect(r.bytes).toBeGreaterThan(0)
  })

  it('a dry run deletes nothing but reports the same', () => {
    const { target } = scratch()
    const deps = join(target, 'debug', 'deps')
    put(join(deps, 'a-1111.exe'), 30)
    put(join(deps, 'a-2222.exe'), 29)
    const r = cleanStale(target, { now: NOW, days: 7, dryRun: true })
    expect(r.removed).toBe(1)
    expect(existsSync(join(deps, 'a-1111.exe'))).toBe(true)
  })

  it('never touches files outside target, nor things that are not build outputs', () => {
    const { root, target } = scratch()
    put(join(root, 'src', 'old-1111.exe'), 90)
    put(join(root, 'src', 'old-2222.exe'), 91)
    put(join(root, 'notes.md'), 90)
    put(join(target, 'release', 'bundle', 'nsis', 'Breccia_setup.exe'), 90) // an installer: not in deps
    put(join(target, 'debug', 'deps', 'readme-1111.txt'), 90) // unknown kind
    put(join(target, 'debug', 'deps', 'readme-2222.txt'), 90)
    cleanStale(target, { now: NOW, days: 7 })
    expect(existsSync(join(root, 'src', 'old-1111.exe'))).toBe(true)
    expect(existsSync(join(root, 'src', 'old-2222.exe'))).toBe(true)
    expect(existsSync(join(root, 'notes.md'))).toBe(true)
    expect(existsSync(join(target, 'release', 'bundle', 'nsis', 'Breccia_setup.exe'))).toBe(true)
    expect(existsSync(join(target, 'debug', 'deps', 'readme-1111.txt'))).toBe(true)
  })

  it('refuses a folder that is not called target, and a missing one', () => {
    const { root } = scratch()
    expect(() => cleanStale(root, { now: NOW })).toThrow(/target/)
    expect(cleanStale(join(root, 'nope', 'target'), { now: NOW })).toEqual({ removed: 0, bytes: 0 })
  })
})

describe('size hint', () => {
  it('adds up the folder and speaks only over the limit', () => {
    const { target } = scratch()
    put(join(target, 'debug', 'a.bin'), 0, 1000)
    put(join(target, 'debug', 'deps', 'b.bin'), 0, 500)
    expect(targetSize(target)).toBe(1500)
    expect(sizeHint(1500, 2000)).toBeNull()
    const hint = sizeHint(16 * 1024 ** 3, 15 * 1024 ** 3)
    expect(hint).toContain('16.0 GB')
    expect(hint).toContain('just clean-stale')
    expect(targetSize(join(target, 'missing'))).toBe(0)
  })
})
