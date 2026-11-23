// An open card on a board keeps its text inside the task (§7.6): the outline keys that would take a block out of
// the task do nothing there, and Enter on the task makes the new block under it.
import type { Action } from './keys'
import type { BlockId, BlockView } from './types'

/** What an outline key does in an open card: as in the journal, nothing, or a split whose new block goes under the task. */
export type CardKey = 'asIs' | 'none' | 'splitUnder'

/**
 * What action `a` on block `id` does, given the open card's blocks `card` (its task first, depths relative to the
 * task, folded blocks included), or null when no card is open:
 * - `Enter` on the task makes the new block its first child;
 * - `Backspace` at the start of the task does not merge it into the block above;
 * - `Shift Tab` on a block directly under the task, `Alt ↑` on the first and `Alt ↓` on the last of them do nothing.
 * Everything else, and every key outside an open card, works as in the journal.
 */
export function cardKey(a: Action, id: BlockId, card: readonly BlockView[] | null): CardKey {
  const root = card?.[0]
  if (!card || !root) return 'asIs'
  if (id === root.id) {
    if (a === 'split') return 'splitUnder'
    if (a === 'merge') return 'none'
    return 'asIs'
  }
  // The task's own blocks end at the first block back at its level (a sibling kept in the open card).
  const end = card.findIndex((b, i) => i > 0 && b.depth <= root.depth)
  const inside = card.slice(1, end < 0 ? card.length : end)
  const direct = inside.filter((b) => b.depth === root.depth + 1)
  if (!direct.some((b) => b.id === id)) return 'asIs'
  if (a === 'outdent') return 'none'
  if (a === 'moveUp' && direct[0].id === id) return 'none'
  if (a === 'moveDown' && direct[direct.length - 1].id === id) return 'none'
  return 'asIs'
}
