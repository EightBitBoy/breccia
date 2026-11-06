import { describe, expect, it, test } from 'vitest'
import { CONFIG_NOTE, daysProblem, keepDraft, keepDrafts, minutesProblem, settleRows, settledDraft, zeroNote } from './settingsForm'

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
