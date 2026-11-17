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

/** A `key:: value` property line: the same rule as `inline::property` in the core. */
function isPropertyLine(line: string): boolean {
  const at = line.indexOf('::')
  if (at <= 0 || !/^[A-Za-z0-9_-]+$/.test(line.slice(0, at))) return false
  const rest = line.slice(at + 2)
  return rest === '' || rest.startsWith(' ')
}

/**
 * Where a block's own text ends, as a UTF-16 offset: the start of its property lines (`key:: value` lines directly
 * after the first line) when they run to the end of the text, else the end of the text. The same rule as
 * `own_text_end` in `crates/core/src/edit.rs`, which the core uses when `Backspace` joins a block onto this one.
 */
export function ownTextEnd(text: string): number {
  const lines = text.split('\n')
  const rest = lines.slice(1)
  if (rest.length > 0 && rest.every(isPropertyLine)) return lines[0].length
  return text.length
}
