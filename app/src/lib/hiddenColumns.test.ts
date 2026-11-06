import { expect, test } from 'vitest'
import { canHide, hiddenOf, hideDuration, HIDE_MS, markerTitle, parseHidden, PEEK_MS } from './hiddenColumns'

const cols = ['TODO', 'DOING', 'WAITING', 'DONE']

test('hiddenOf keeps the saved states the board has and ignores unknown states', () => {
  expect([...hiddenOf(['WAITING', 'BLOCKED'], cols)]).toEqual(['WAITING'])
  expect(hiddenOf(undefined, cols).size).toBe(0)
})

test('hiddenOf never hides every column: the first one stays', () => {
  expect([...hiddenOf(['DONE', 'TODO', 'WAITING', 'DOING'], cols)].sort()).toEqual(['DOING', 'DONE', 'WAITING'])
  expect(hiddenOf(['TODO'], ['TODO']).size).toBe(0)
})

test('canHide is false for the last visible column and for one already hidden', () => {
  expect(canHide('TODO', cols, new Set(['DOING', 'WAITING']))).toBe(true)
  expect(canHide('TODO', cols, new Set(['DOING', 'WAITING', 'DONE']))).toBe(false)
  expect(canHide('DONE', cols, new Set(['DONE']))).toBe(false)
  expect(canHide('TODO', ['TODO'], new Set())).toBe(false)
  expect(canHide('NOPE', cols, new Set())).toBe(false)
})

test('markerTitle says the state, its card count and what a click does', () => {
  expect(markerTitle('WAITING', 3)).toBe('WAITING (3 cards), click to show')
  expect(markerTitle('DONE', 1)).toBe('DONE (1 card), click to show')
  expect(markerTitle('DONE', 0)).toBe('DONE (0 cards), click to show')
})

test('parseHidden keeps only lists of state names', () => {
  expect(parseHidden({ Tasks: ['WAITING', 3], Focus: ['DONE'], Bad: 'x' })).toEqual({ Tasks: ['WAITING'], Focus: ['DONE'] })
  expect(parseHidden(null)).toEqual({})
  expect(parseHidden([1])).toEqual({})
})

test('hiding takes about 150 ms, and no time with reduced motion; the drag opens after 0.5 s', () => {
  expect(HIDE_MS).toBe(150)
  expect(hideDuration(false)).toBe(150)
  expect(hideDuration(true)).toBe(0)
  expect(PEEK_MS).toBe(500)
})
