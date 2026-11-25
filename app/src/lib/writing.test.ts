import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DEFAULT_STATES, writingGroups, writingRows } from './writing'

const formatDoc = readFileSync(new URL('../../../docs/format.md', import.meta.url), 'utf8')

describe('writing', () => {
  it('names every syntax of the Writing tab in docs/format.md', () => {
    const missing = writingRows(DEFAULT_STATES).filter((r) => !formatDoc.includes(r.doc)).map((r) => `${r.example}: ${r.doc}`)
    expect(missing).toEqual([])
  })
  it('has no empty entry, and each doc quote is a whole backtick or bold span', () => {
    for (const r of writingRows(DEFAULT_STATES)) {
      for (const t of [r.group, r.example, r.what, r.doc]) expect(t.trim(), r.example).not.toBe('')
      expect(/^(`[^`]+`|`` .+ ``|\*\*[^*]+\*\*)$/.test(r.doc), r.doc).toBe(true)
    }
  })
  it("lists Breccia's own syntax first, then the Markdown basics", () => {
    const groups = writingGroups(DEFAULT_STATES, '').map((g) => g.name)
    expect(groups).toEqual(['Links and tags', 'Tasks and properties', 'Markdown'])
    const examples = writingRows(DEFAULT_STATES).map((r) => r.example)
    for (const e of ['[[Project X]]', '[[Project X#Plans]]', '#idea', 'owner:: [[Anna]]', 'due:: [[2026-12-01]]', 'priority:: 2', '**bold**', '<https://example.com>', '<name@example.com>'])
      expect(examples, e).toContain(e)
  })
  it('shows the configured states in the task row, or the defaults when none are known', () => {
    const task = (states: string[]) => writingRows(states).find((r) => r.group === 'Tasks and properties')!
    expect(task(['NEXT', 'LATER', 'FINISHED'])).toMatchObject({ example: 'NEXT Call Ben' })
    expect(task(['NEXT', 'LATER', 'FINISHED']).what).toContain('NEXT, LATER, FINISHED')
    expect(task([]).example).toBe('TODO Call Ben')
    expect(task([]).what).toContain(DEFAULT_STATES.join(', '))
  })
  it('narrows to the rows whose example, words or group hold the filter, in any case', () => {
    expect(writingGroups(DEFAULT_STATES, 'BOLD').flatMap((g) => g.rows.map((r) => r.example))).toEqual(['**bold**'])
    expect(writingGroups(DEFAULT_STATES, 'due::').flatMap((g) => g.rows.map((r) => r.example))).toEqual(['due:: [[2026-12-01]]'])
    expect(writingGroups(DEFAULT_STATES, 'markdown').map((g) => g.name)).toEqual(['Markdown'])
    expect(writingGroups(DEFAULT_STATES, 'qqqq')).toEqual([])
  })
})
