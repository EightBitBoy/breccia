import { expect, test } from 'vitest'
import { taskOf } from './taskMenu'
import type { BlockView } from './types'

function row(id: number, state: string | null, due?: string): BlockView {
  const b: BlockView = { id, depth: 0, text: '', html: '', state, finished: false, hasChildren: false }
  if (due !== undefined) b.due = due
  return b
}

test('a row is a task when its block has a state, with its due date or none', () => {
  const blocks = [row(1, null), row(2, 'TODO', '2026-12-01'), row(3, 'DONE')]
  expect(taskOf(2, blocks)).toEqual({ id: 2, due: '2026-12-01' })
  expect(taskOf(3, blocks)).toEqual({ id: 3, due: null })
})

test('a row that is not a task, or not among the blocks, gives no task', () => {
  const blocks = [row(1, null), row(2, 'TODO')]
  expect(taskOf(1, blocks)).toBeNull()
  expect(taskOf(9, blocks)).toBeNull()
})
