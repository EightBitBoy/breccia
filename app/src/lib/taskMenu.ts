// The task right-click menu in a page's outline: which row is a task, and its due date.
import type { BlockId, BlockView } from './types'

/** A task row under the pointer: its block and its due date (a day key), or none. */
export interface TaskSpot {
  id: BlockId
  due: string | null
}

/** The task of the row `id` among `blocks`: a block with a state is a task. Other rows, and ids not there, give null. */
export function taskOf(id: BlockId, blocks: readonly BlockView[]): TaskSpot | null {
  const b = blocks.find((v) => v.id === id)
  return b && b.state !== null ? { id: b.id, due: b.due ?? null } : null
}
