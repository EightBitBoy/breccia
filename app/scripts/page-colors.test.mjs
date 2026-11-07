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
