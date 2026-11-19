import { describe, expect, it, test } from 'vitest'
import {
  CONFIG_NOTE,
  daysProblem,
  keepDraft,
  keepDrafts,
  minutesProblem,
  numberCommit,
  oneAtATime,
  settleRows,
  settledDraft,
  zeroNote,
} from './settingsForm'

describe('minutesProblem', () => {
  const msg = 'Enter whole minutes from 0 to 1440.'
  it('accepts 0 and 1440', () => {
    expect(minutesProblem('0')).toBeNull()
    expect(minutesProblem('1440')).toBeNull()
  })
  it('rejects the rest', () => {
    for (const v of ['1441', '-1', '2.5', '', 'abc']) expect(minutesProblem(v)).toBe(msg)
  })
})
describe('daysProblem', () => {
  const msg = 'Enter whole days from 1 to 3650.'
  it('accepts 1 and 3650', () => {
    expect(daysProblem('1')).toBeNull()
    expect(daysProblem('3650')).toBeNull()
  })
  it('rejects 0 and 3651', () => {
    expect(daysProblem('0')).toBe(msg)
    expect(daysProblem('3651')).toBe(msg)
    expect(daysProblem('')).toBe(msg)
  })
})
describe('notes', () => {
  it('texts', () => {
    expect(CONFIG_NOTE).toBe('Stored in breccia/config.toml in the notes folder, so every computer that syncs this folder shares it.')
    expect(zeroNote('commit')).toBe('0: only when you click the Git item, before a pull and when Breccia closes.')
    expect(zeroNote('pull')).toBe('0: only when Breccia starts and when you click the Git item.')
  })
})
test('keepDraft keeps typing unless that value changed', () => {
  expect(keepDraft('7', '5', '5')).toBe('7')
  expect(keepDraft('7', '5', '9')).toBe('9')
  expect(keepDraft('5', '5', '9')).toBe('9')
})
test('keepDrafts follows each state, not its row', () => {
  expect(keepDrafts(['TODO', 'WAIT', 'DONE'], ['TODO', 'WAITING', 'DONE'], ['NEW', 'TODO', 'WAITING', 'DONE']))
    .toEqual(['NEW', 'TODO', 'WAIT', 'DONE'])
  expect(keepDrafts(['TODO', 'WAIT'], ['TODO', 'WAITING'], ['TODO'])).toEqual(['TODO'])
  expect(keepDrafts(['TODO', 'BLOCKED'], ['TODO', 'WAITING'], ['TODO', 'BLOCKED'])).toEqual(['TODO', 'BLOCKED'])
})
describe('settledDraft', () => {
  it('shows the file value when the box still holds what was sent', () => {
    expect(settledDraft('5', '5', '10')).toBe('10')
    expect(settledDraft('5', '5', '5')).toBe('5')
  })
  it('keeps text typed during the wait', () => {
    expect(settledDraft('7', '5', '10')).toBe('7')
  })
})
describe('settleRows', () => {
  it('shows the named keywords and keeps the other rows', () => {
    expect(settleRows(['NOW', 'LATR', 'DONE'], ['NOW', 'LATER', 'DONE'], ['LATER'])).toEqual(['NOW', 'LATER', 'DONE'])
    expect(settleRows(['NOWW', 'LATR', 'DONE'], ['NOW', 'LATER', 'DONE'], ['LATER'])).toEqual(['NOWW', 'LATER', 'DONE'])
  })
  it('reads missing drafts as the keyword', () => {
    expect(settleRows(['A'], ['A', 'B'], [])).toEqual(['A', 'B'])
  })
})
describe('numberCommit', () => {
  it('sends nothing for the number stored, unless the file holds a refused value', () => {
    expect(numberCommit('14', 14, false, null)).toBeNull()
    expect(numberCommit('14', 14, true, null)).toBe(14)
    expect(numberCommit(' 14 ', 14, true, null)).toBe(14)
  })
  it('sends another number', () => {
    expect(numberCommit('15', 14, false, null)).toBe(15)
    expect(numberCommit('0', 5, false, minutesProblem('0'))).toBe(0)
  })
  it('sends nothing while the box has a problem', () => {
    expect(numberCommit('0', 14, true, daysProblem('0'))).toBeNull()
    expect(numberCommit('1441', 5, true, minutesProblem('1441'))).toBeNull()
  })
})
describe('oneAtATime', () => {
  /** A promise and its resolver. */
  function gate() {
    let open = () => {}
    const p = new Promise<void>((r) => (open = r))
    return { p, open }
  }
  /** A days box over a file holding a refused value (read as 14): each run sends what `numberCommit` gives, waits for `wait`, then stores it. */
  function box(wait: Promise<void>) {
    const s = { typed: '14', stored: 14, invalid: true, runs: 0, sent: [] as number[] }
    const f = async () => {
      s.runs++
      const n = numberCommit(s.typed, s.stored, s.invalid, daysProblem(s.typed))
      if (n === null) return
      s.sent.push(n)
      await wait
      s.stored = n
      s.invalid = false
    }
    return { s, f }
  }

  it('runs once more after a call made while it runs, and that run finds nothing to send', async () => {
    const g = gate()
    const { s, f } = box(g.p)
    const commit = oneAtATime(f)
    const first = commit() // Enter
    const second = commit() // then a click elsewhere, before the answer
    expect(s.runs).toBe(1)
    g.open()
    await Promise.all([first, second])
    expect(s.runs).toBe(2)
    expect(s.sent).toEqual([14])
  })
  it('runs only once more for three calls in flight', async () => {
    const g = gate()
    const { s, f } = box(g.p)
    const commit = oneAtATime(f)
    const calls = [commit(), commit(), commit()]
    g.open()
    await Promise.all(calls)
    expect(s.runs).toBe(2)
    expect(s.sent).toEqual([14])
  })
  it('sends a number typed while the first save is on its way', async () => {
    const g = gate()
    const { s, f } = box(g.p)
    const commit = oneAtATime(f)
    const first = commit()
    s.typed = '20'
    const second = commit()
    g.open()
    await Promise.all([first, second])
    expect(s.sent).toEqual([14, 20])
  })
  it('runs again for a call after it settled', async () => {
    const { s, f } = box(Promise.resolve())
    const commit = oneAtATime(f)
    await commit()
    s.typed = '30'
    await commit()
    expect(s.runs).toBe(2)
    expect(s.sent).toEqual([14, 30])
  })
})
