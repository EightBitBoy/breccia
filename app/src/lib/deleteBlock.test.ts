import { expect, test } from 'vitest'
import { deleteFocus } from './deleteBlock'

const rows = (...r: [number, number][]) => r.map(([id, depth]) => ({ id, depth }))

test('goes to the end of the row above', () => {
  expect(deleteFocus(rows([1, 0], [2, 0], [3, 0]), 2)).toEqual({ id: 1, at: 'end' })
  expect(deleteFocus(rows([1, 0], [2, 0], [3, 0]), 3)).toEqual({ id: 2, at: 'end' })
  // A row with children: the row above, whatever its depth.
  expect(deleteFocus(rows([1, 0], [5, 1], [2, 0], [6, 1], [3, 0]), 2)).toEqual({ id: 5, at: 'end' })
})

test('the first row goes to the start of the row after its subtree', () => {
  expect(deleteFocus(rows([1, 0], [2, 1], [3, 0]), 1)).toEqual({ id: 3, at: 'start' })
})

test('a folded row above is the target, not its hidden children', () => {
  // 1 is folded: its children are not among the shown rows.
  expect(deleteFocus(rows([1, 0], [3, 0]), 3)).toEqual({ id: 1, at: 'end' })
})

test('the only row of the page keeps the caret in it', () => {
  expect(deleteFocus(rows([4, 0]), 4)).toEqual({ id: 4, at: 'start' })
})

test('a row with children and nothing after them, first on the page → itself', () => {
  expect(deleteFocus(rows([4, 0], [5, 1], [6, 2]), 4)).toEqual({ id: 4, at: 'start' })
})

test('a row that is not shown keeps the caret on itself', () => {
  expect(deleteFocus(rows([1, 0]), 9)).toEqual({ id: 9, at: 'start' })
})
