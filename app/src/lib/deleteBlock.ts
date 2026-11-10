import type { BlockId } from './types'

/**
 * Where the caret goes after `Ctrl Shift K` deletes block `id` with its children. `rows` are the shown rows of the
 * block's own page, in order. The row above gets the caret at its end; for the page's first row, the first row after
 * its children gets it at its start; with nothing else on the page the core keeps the block, emptied, and the caret
 * stays in it.
 */
export function deleteFocus(
  rows: readonly { id: BlockId; depth: number }[],
  id: BlockId,
): { id: BlockId; at: 'end' | 'start' } {
  const i = rows.findIndex((r) => r.id === id)
  if (i < 0) return { id, at: 'start' }
  if (i > 0) return { id: rows[i - 1].id, at: 'end' }
  const depth = rows[i].depth
  const after = rows.slice(i + 1).find((r) => r.depth <= depth)
  return after ? { id: after.id, at: 'start' } : { id, at: 'start' }
}
