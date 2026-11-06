import { describe, expect, it } from 'vitest'
import {
  PALETTE, addState, keywordProblem, moveState, newStateKeyword, normalizeKeyword, removeQuestion, renameQuestion,
  statesSet, withState, withoutState, usageLabel, skippedNote, keywordCommit, keywordCommitFor, removeCommit,
} from './stateEdit'
import type { StateView } from './types'

const st = (keyword: string): StateView => ({ keyword, color: 'grey', finished: false, inCycle: false })

describe('normalizeKeyword', () => {
  it('trims and upper-cases', () => expect(normalizeKeyword(' waiting ')).toBe('WAITING'))
})
describe('keywordProblem', () => {
  const states = [st('TODO'), st('DONE')]
  const shape = 'A keyword starts with a letter A–Z and holds only A–Z, 0–9 and _.'
  it('rejects bad shapes', () => {
    expect(keywordProblem('', states, 0)).toBe(shape)
    expect(keywordProblem('1X', states, 0)).toBe(shape)
    expect(keywordProblem('TO DO', states, 0)).toBe(shape)
  })
  it('rejects a duplicate at another index', () => expect(keywordProblem('DONE', states, 0)).toBe('There is already a state DONE.'))
  it('accepts the keyword at its own index', () => expect(keywordProblem('TODO', states, 0)).toBeNull())
  it('accepts a free keyword', () => expect(keywordProblem('A_1', states, 0)).toBeNull())
})
describe('newStateKeyword', () => {
  it('is NEW, then NEW2, NEW3', () => {
    expect(newStateKeyword([])).toBe('NEW')
    expect(newStateKeyword([st('NEW')])).toBe('NEW2')
    expect(newStateKeyword([st('NEW'), st('NEW2')])).toBe('NEW3')
  })
})
describe('list edits', () => {
  const s = [st('A'), st('B'), st('C')]
  it('addState appends a grey state', () => {
    expect(addState(s)[3]).toEqual({ keyword: 'NEW', color: 'grey', finished: false, inCycle: false })
    expect(s).toHaveLength(3)
  })
  it('moveState swaps, and is a no-op at the ends', () => {
    expect(moveState(s, 0, 1).map((x) => x.keyword)).toEqual(['B', 'A', 'C'])
    expect(moveState(s, 0, -1)).toEqual(s)
    expect(moveState(s, 2, 1)).toEqual(s)
  })
  it('withState patches one', () => expect(withState(s, 1, { finished: true })[1]).toEqual({ ...st('B'), finished: true }))
  it('withoutState removes one', () => expect(withoutState(s, 1).map((x) => x.keyword)).toEqual(['A', 'C']))
  it('PALETTE order', () => expect(PALETTE).toEqual(['grey', 'amber', 'violet', 'green', 'dim', 'blue', 'red', 'teal']))
})
describe('questions', () => {
  it('rename', () => {
    expect(renameQuestion('WAITING', 'BLOCKED', { keyword: 'WAITING', blocks: 3, pages: 2 })).toBe(
      'Rename WAITING to BLOCKED? 3 blocks in 2 pages start with WAITING. Breccia changes that word at the start of each of them and nothing else, and boards that show WAITING show BLOCKED.',
    )
    expect(renameQuestion('WAITING', 'BLOCKED', { keyword: 'WAITING', blocks: 1, pages: 1 })).toBe(
      'Rename WAITING to BLOCKED? 1 block in 1 page starts with WAITING. Breccia changes that word at the start of each of them and nothing else, and boards that show WAITING show BLOCKED.',
    )
    expect(renameQuestion('A', 'B', { keyword: 'A', blocks: 0, pages: 0 })).toBeNull()
    expect(renameQuestion('A', 'B', undefined)).not.toBeNull() // not counted: asked
  })
  it('remove', () => {
    expect(removeQuestion('WAITING', { keyword: 'WAITING', blocks: 3, pages: 2 })).toBe(
      'Remove the state WAITING? 3 blocks in 2 pages start with WAITING. Their text stays as it is; WAITING is just no longer a state, so they leave the boards.',
    )
    expect(removeQuestion('W', { keyword: 'W', blocks: 1, pages: 1 })).toBe(
      'Remove the state W? 1 block in 1 page starts with W. Their text stays as it is; W is just no longer a state, so they leave the boards.',
    )
    expect(removeQuestion('W', { keyword: 'W', blocks: 0, pages: 0 })).toBeNull()
    expect(removeQuestion('W', undefined)).not.toBeNull() // not counted: asked
  })
})
describe('statesSet', () => {
  it('builds the command', () =>
    expect(statesSet([st('A')], [{ from: 'A', to: 'B' }], 4)).toEqual({
      type: 'states.set', states: [st('A')], renames: [{ from: 'A', to: 'B' }], version: 4,
    }))
})

describe('usageLabel', () => {
  it('counts blocks', () => {
    expect(usageLabel(undefined)).toBe('no blocks')
    expect(usageLabel({ keyword: 'A', blocks: 0, pages: 0 })).toBe('no blocks')
    expect(usageLabel({ keyword: 'A', blocks: 1, pages: 1 })).toBe('1 block')
    expect(usageLabel({ keyword: 'A', blocks: 3, pages: 2 })).toBe('3 blocks')
  })
})

describe('skippedNote', () => {
  it('names pages that could not be read', () => {
    expect(skippedNote(0)).toBe('')
    expect(skippedNote(1)).toBe(' 1 page could not be read, so Breccia does not change it.')
    expect(skippedNote(2)).toBe(' 2 pages could not be read, so Breccia does not change them.')
  })
})

describe('keywordCommit', () => {
  const s = [
    { keyword: 'TODO', color: 'grey', finished: false, inCycle: true },
    { keyword: 'DONE', color: 'green', finished: true, inCycle: true },
  ]
  const usage = [{ keyword: 'TODO', blocks: 2, pages: 1 }]
  it('does nothing for the same keyword', () => {
    expect(keywordCommit(' todo ', s, 0, usage, 0)).toEqual({ kind: 'none' })
  })
  it('sends nothing while the keyword has a problem', () => {
    expect(keywordCommit('DONE', s, 0, usage, 0)).toEqual({ kind: 'problem' })
    expect(keywordCommit('1X', s, 0, usage, 0)).toEqual({ kind: 'problem' })
  })
  it('renames, asking first when blocks use the old keyword', () => {
    const counted = [...usage, { keyword: 'DONE', blocks: 0, pages: 0 }]
    expect(keywordCommit('later', s, 1, counted, 0)).toMatchObject({ kind: 'rename', from: 'DONE', to: 'LATER', question: null })
    expect(keywordCommit('next', s, 0, usage, 1)).toMatchObject({
      kind: 'rename',
      from: 'TODO',
      to: 'NEXT',
      question: renameQuestion('TODO', 'NEXT', usage[0]) + skippedNote(1),
    })
  })
})

describe('decided before asking', () => {
  const s: StateView[] = [
    { keyword: 'TODO', color: 'grey', finished: false, inCycle: true },
    { keyword: 'WAITING', color: 'violet', finished: false, inCycle: false },
  ]
  const usage = [{ keyword: 'WAITING', blocks: 1, pages: 1 }]
  it('a rename carries the list it was made from', () => {
    const c = keywordCommit('blocked', s, 1, usage, 0)
    expect(c.kind === 'rename' && c.states).toEqual(withState(s, 1, { keyword: 'BLOCKED' }))
  })
  it('a remove carries the list it was made from and its question', () => {
    expect(removeCommit(s, 1, usage)).toEqual({ states: [s[0]], question: removeQuestion('WAITING', usage[0]) })
    const counted = [...usage, { keyword: 'TODO', blocks: 0, pages: 0 }]
    expect(removeCommit(s, 0, counted)).toEqual({ states: [s[1]], question: null })
  })
})

describe('a state the count does not know (added since it was counted)', () => {
  // LATER was added to config.toml by hand while Settings was open: the usage has no entry for it.
  const s: StateView[] = [
    { keyword: 'TODO', color: 'grey', finished: false, inCycle: true },
    { keyword: 'LATER', color: 'blue', finished: false, inCycle: false },
  ]
  const usage = [{ keyword: 'TODO', blocks: 0, pages: 0 }]
  it('a rename asks, never takes it for unused', () => {
    const c = keywordCommit('someday', s, 1, usage, 0)
    expect(c.kind === 'rename' && c.question).toBe(renameQuestion('LATER', 'SOMEDAY', undefined))
    expect(renameQuestion('LATER', 'SOMEDAY', undefined)).toContain('Rename LATER to SOMEDAY?')
  })
  it('a remove asks too', () => {
    expect(removeCommit(s, 1, usage).question).toBe(removeQuestion('LATER', undefined))
    expect(removeQuestion('LATER', undefined)).toContain('Remove the state LATER?')
  })
  it('a counted state with no blocks is not asked', () => {
    expect(renameQuestion('TODO', 'OPEN', usage[0])).toBeNull()
    expect(removeQuestion('TODO', usage[0])).toBeNull()
  })
})

describe('keywordCommitFor', () => {
  const waiting = { keyword: 'WAITING', color: 'blue', finished: false, inCycle: true }
  const later = { keyword: 'LATER', color: 'grey', finished: false, inCycle: true }
  it('renames the state the user typed into, even when another state moved into its place meanwhile', () => {
    const now = [later, waiting] // a pull put LATER where WAITING was
    const c = keywordCommitFor('BLOCKED', 'WAITING', now, [], 0)
    expect(c.kind).toBe('rename')
    if (c.kind === 'rename') {
      expect(c.from).toBe('WAITING')
      expect(c.states.map((s) => s.keyword)).toEqual(['LATER', 'BLOCKED'])
    }
  })
  it('does nothing when that state is gone', () => {
    expect(keywordCommitFor('BLOCKED', 'WAITING', [later], [], 0)).toEqual({ kind: 'none' })
  })
})
