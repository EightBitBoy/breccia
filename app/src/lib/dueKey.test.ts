import { expect, test } from 'vitest'
import { dueKeyAction } from './dueKey'

test('Ctrl D does nothing while the search or a dialog is open, even on a task', () => {
  expect(dueKeyAction({ state: 'TODO', due: '2026-12-01' }, true)).toEqual({ kind: 'none' })
  expect(dueKeyAction({ state: null }, true)).toEqual({ kind: 'none' })
})

test('Ctrl D on a block the window no longer has does nothing and says nothing', () => {
  expect(dueKeyAction(undefined, false)).toEqual({ kind: 'none' })
})

test('Ctrl D on a block that is not a task is refused', () => {
  expect(dueKeyAction({ state: null }, false)).toEqual({ kind: 'refuse' })
})

test('Ctrl D on a task opens the calendar on its due date, or on none', () => {
  expect(dueKeyAction({ state: 'TODO', due: '2026-12-01' }, false)).toEqual({ kind: 'open', due: '2026-12-01' })
  expect(dueKeyAction({ state: 'DONE' }, false)).toEqual({ kind: 'open', due: null })
})
