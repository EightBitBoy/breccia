import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { PAGE_COLOR_ROWS } from '../src/lib/pageColors.ts'

const here = dirname(fileURLToPath(import.meta.url))

it('the page-colors fence of format.md equals the picker rows', () => {
  const md = readFileSync(join(here, '..', '..', 'docs', 'format.md'), 'utf8')
  const m = /```text page-colors\n([\s\S]*?)\n```/.exec(md)
  expect(m, 'page-colors fence').not.toBeNull()
  const rows = m[1].split('\n').map((l) => l.trim().split(/\s+/))
  expect(rows).toHaveLength(5)
  expect(rows).toEqual(PAGE_COLOR_ROWS.map((r) => [...r]))
})

it('the vividness bounds and default of the core and the frontend agree', () => {
  const rs = readFileSync(join(here, '..', '..', 'crates', 'core', 'src', 'color.rs'), 'utf8')
  const ts = readFileSync(join(here, '..', 'src', 'lib', 'pageColors.ts'), 'utf8')
  for (const name of ['MIN_VIVID', 'MAX_VIVID', 'DEFAULT_VIVID']) {
    const core = new RegExp(String.raw`pub const ${name}: u8 = ([0-9]+);`).exec(rs)
    const app = new RegExp(String.raw`export const ${name} = ([0-9]+)`).exec(ts)
    expect(core, `${name} in color.rs`).not.toBeNull()
    expect(app, `${name} in pageColors.ts`).not.toBeNull()
    expect(Number(app[1]), name).toBe(Number(core[1]))
  }
})
