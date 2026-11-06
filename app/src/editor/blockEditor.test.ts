import { EditorSelection, EditorState } from '@codemirror/state'
import { expect, test } from 'vitest'
import { caretFloor } from './blockEditor'

// "a😀 b" split at 1 while "xy" was typed: the new block's part starts at 1.
function stateWith(floor: number | null) {
  return EditorState.create({
    doc: 'axy😀 b',
    selection: EditorSelection.cursor(7),
    extensions: [caretFloor(() => floor)],
  })
}

test('a keyboard caret move stays in the new block part while a split runs', () => {
  const s = stateWith(1).update({ selection: EditorSelection.cursor(0), userEvent: 'select' }).state
  expect(s.selection.main.head).toBe(1)
})

test('a keyboard selection is cut at the new block part while a split runs', () => {
  const s = stateWith(1).update({ selection: EditorSelection.range(5, 0), userEvent: 'select' }).state
  expect([s.selection.main.anchor, s.selection.main.head]).toEqual([5, 1])
})

test('caret moves are free when no split runs, and for the pointer', () => {
  const home = (floor: number | null, userEvent: string) =>
    stateWith(floor).update({ selection: EditorSelection.cursor(0), userEvent }).state.selection.main.head
  expect(home(null, 'select')).toBe(0)
  expect(home(1, 'select.pointer')).toBe(0)
})
