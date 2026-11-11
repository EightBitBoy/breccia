import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { changelogPlugin } from './changelog-plugin.ts'

const ID = '\0virtual:changelog'
const content = '## [9.9.9] - 2030-01-01\n- "quoted" \ line\n'

function hooks(file: string) {
  const p = changelogPlugin(file)
  const narrow = (h: unknown) =>
    (typeof h === 'function' ? h : (h as { handler: unknown }).handler) as (
      this: unknown,
      id: string,
    ) => unknown
  return { resolveId: narrow(p.resolveId), load: narrow(p.load) }
}

test('resolves and loads the virtual module', () => {
  const dir = mkdtempSync(join(tmpdir(), 'chlog-'))
  const file = join(dir, 'CHANGELOG.md')
  writeFileSync(file, content)
  const { resolveId, load } = hooks(file)
  expect(resolveId.call({}, 'virtual:changelog')).toBe(ID)
  expect(resolveId.call({}, 'other') ?? null).toBeNull()
  const watched: string[] = []
  const ctx = { addWatchFile: (f: string) => watched.push(f) }
  const mod = load.call(ctx, ID) as string
  expect(JSON.parse(mod.slice('export default '.length))).toBe(content)
  expect(watched).toEqual([file])
  expect(load.call(ctx, 'other') ?? null).toBeNull()
})

test('a missing file throws', () => {
  const { load } = hooks(join(tmpdir(), 'nope-chlog', 'CHANGELOG.md'))
  expect(() => load.call({ addWatchFile() {} }, ID)).toThrow(/CHANGELOG.md not found at/)
})
