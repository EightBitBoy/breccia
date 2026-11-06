import { expect, test } from 'vitest'
import { settleCommand, typedState } from './settle'

const keywords = ['TODO', 'DOING', 'DONE']

test('the state a text starts with: a keyword followed by a space or ending the first line', () => {
  expect(typedState('TODO call Anna', keywords)).toBe('TODO')
  expect(typedState('DONE', keywords)).toBe('DONE')
  expect(typedState('DOING\ncreated:: 2026-11-04 09:12:30', keywords)).toBe('DOING')
  for (const t of ['TODOs list', 'todo x', 'Ask TODO x', '', ' TODO x', 'x\nTODO y']) expect(typedState(t, keywords), t).toBeNull()
  expect(typedState('TODO x', [])).toBeNull()
})

test('closing the editor settles the block only when its state changed since it opened', () => {
  // Typed by hand: from none to a state, from a state to another, or removed.
  expect(settleCommand(4, null, 'TODO call Anna', keywords)).toEqual({ type: 'block.settle', id: 4, before: null })
  expect(settleCommand(4, 'TODO', 'DONE call Anna', keywords)).toEqual({ type: 'block.settle', id: 4, before: 'TODO' })
  expect(settleCommand(4, 'DONE', 'call Anna\ncreated:: 2026-11-04 09:12:30', keywords)).toEqual({ type: 'block.settle', id: 4, before: 'DONE' })
  // The same state, or none before and after: nothing is sent.
  expect(settleCommand(4, 'TODO', 'TODO call Anna and Ben', keywords)).toBeNull()
  expect(settleCommand(4, null, 'call Anna', keywords)).toBeNull()
})
