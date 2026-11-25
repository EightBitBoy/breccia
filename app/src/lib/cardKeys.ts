// An open card on a board keeps its text inside the task (§7.6): the outline keys that would take a block out of
// the task do nothing there, and Enter on the task makes the new block under it.
import type { Action, KeyInput } from './keys'
import { typedState } from './settle'
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

/** Whether block `id` is the task of the open card `card` (null when no card is open). */
export function isCardTask(id: BlockId, card: readonly BlockView[] | null): boolean {
  return card?.[0]?.id === id
}

/**
 * Where Enter on an open card's task splits its text `text` (UTF-16) with the caret at `caret`: at the caret, except
 * at the very start or inside the state keyword (up to and including the space after it), where the task line stays
 * whole and the new block under it starts empty (the split is at the end of the text).
 */
export function taskSplitAt(text: string, caret: number, keywords: readonly string[]): number {
  const k = typedState(text, keywords)
  const prefix = k === null ? 0 : k.length + (text[k.length] === ' ' ? 1 : 0)
  return caret <= prefix ? text.length : caret
}

/** What a key on a closed card that has the keyboard focus does: open the card, open its due date calendar, open its
 *  menu, or nothing. */
export type FocusedCardKey = 'open' | 'due' | 'menu' | null

/**
 * A key `e` on a closed card that itself has the keyboard focus (not a button in it, and never an open card's editor,
 * where `Ctrl D` is the task's own key): `Enter` or `Space` opens the card, `Ctrl D` (`Cmd D` on a Mac) opens its due
 * date calendar (`Ctrl Shift D` stays the date picker), and `Shift F10` or the context-menu key opens its menu.
 */
export function focusedCardKey(e: KeyInput, mac: boolean): FocusedCardKey {
  const mod = mac ? e.meta : e.ctrl
  const other = mac ? e.ctrl : e.meta
  if (e.key === 'ContextMenu' && !mod && !other && !e.alt) return 'menu'
  if (e.key === 'F10' && e.shift && !mod && !other && !e.alt) return 'menu'
  if (other || e.alt) return null
  if (mod) return !e.shift && e.key.toLowerCase() === 'd' ? 'due' : null
  if (e.shift) return null
  return e.key === 'Enter' || e.key === ' ' ? 'open' : null
}
