import { expect, test } from 'vitest'
import { cardKey, isCardTask, taskSplitAt } from './cardKeys'
import type { Action } from './keys'
import type { BlockView } from './types'

function b(id: number, depth: number): BlockView {
  return { id, depth, text: `b${id}`, html: '', state: null, finished: false, hasChildren: false }
}

// The open card: task 1, with direct children 2, 4 and 5; 3 is under 2.
const card = [b(1, 0), b(2, 1), b(3, 2), b(4, 1), b(5, 1)]

test('Enter on the task makes the new block under it; Enter elsewhere is a plain split', () => {
  expect(cardKey('split', 1, card)).toBe('splitUnder')
  expect(cardKey('split', 2, card)).toBe('asIs')
  expect(cardKey('split', 3, card)).toBe('asIs')
})

test('Shift Tab on a block directly under the task does nothing; deeper blocks outdent', () => {
  expect(cardKey('outdent', 2, card)).toBe('none')
  expect(cardKey('outdent', 5, card)).toBe('none')
  expect(cardKey('outdent', 3, card)).toBe('asIs')
})

test('Alt ↑ on the first and Alt ↓ on the last block under the task do nothing; other moves work', () => {
  expect(cardKey('moveUp', 2, card)).toBe('none')
  expect(cardKey('moveDown', 5, card)).toBe('none')
  expect(cardKey('moveUp', 4, card)).toBe('asIs')
  expect(cardKey('moveDown', 2, card)).toBe('asIs')
  expect(cardKey('moveUp', 3, card)).toBe('asIs')
  expect(cardKey('moveDown', 3, card)).toBe('asIs')
  // The task itself moves with everything in it.
  expect(cardKey('moveUp', 1, card)).toBe('asIs')
  expect(cardKey('moveDown', 1, card)).toBe('asIs')
})

test('Backspace at the start of the task does not merge it into the block above; merges inside work', () => {
  expect(cardKey('merge', 1, card)).toBe('none')
  expect(cardKey('merge', 2, card)).toBe('asIs')
  expect(cardKey('merge', 4, card)).toBe('asIs')
})

test("a sibling kept after the task in the open card does not end the task's children", () => {
  // Block 6 is a sibling of the task shown in the card (made before this rule); 5 is still the last child.
  const kept = [...card, b(6, 0)]
  expect(cardKey('moveDown', 5, kept)).toBe('none')
  expect(cardKey('outdent', 6, kept)).toBe('asIs')
})

test('other keys, blocks outside the card and no open card change nothing', () => {
  const others: Action[] = ['indent', 'cycleState', 'removeState', 'undo', 'redo', 'deleteBlock', 'focusPrev', 'leave']
  for (const a of others) expect(cardKey(a, 1, card)).toBe('asIs')
  expect(cardKey('merge', 99, card)).toBe('asIs')
  // The journal and pages: no open card.
  for (const a of ['split', 'merge', 'outdent', 'moveUp', 'moveDown'] as Action[]) expect(cardKey(a, 1, null)).toBe('asIs')
  expect(cardKey('split', 1, [])).toBe('asIs')
})

test('Enter at the start of the task or inside its state keyword keeps the task line whole', () => {
  const text = 'TODO task now'
  const end = text.length
  for (const caret of [0, 2, 4, 5]) expect(taskSplitAt(text, caret, ['TODO', 'DONE'])).toBe(end)
  // Once the caret is in the title (past "TODO "), the text after the cursor moves, as decided.
  expect(taskSplitAt(text, 6, ['TODO'])).toBe(6)
  expect(taskSplitAt(text, 9, ['TODO'])).toBe(9)
  expect(taskSplitAt(text, end, ['TODO'])).toBe(end)
  // A keyword that ends the line, and property lines after the task's own line.
  expect(taskSplitAt('TODO', 4, ['TODO'])).toBe(4)
  const props = 'TODO x\ncreated:: [[2026-11-23]]'
  expect(taskSplitAt(props, 3, ['TODO'])).toBe(props.length)
  // No keyword: only the very start keeps the line whole.
  expect(taskSplitAt('plain task', 0, ['TODO'])).toBe(10)
  expect(taskSplitAt('plain task', 1, ['TODO'])).toBe(1)
  // A word that only starts like a keyword is no keyword.
  expect(taskSplitAt('TODOS x', 3, ['TODO'])).toBe(3)
})

test('isCardTask names only the open card task', () => {
  expect(isCardTask(1, card)).toBe(true)
  expect(isCardTask(2, card)).toBe(false)
  expect(isCardTask(1, null)).toBe(false)
  expect(isCardTask(1, [])).toBe(false)
})
