// The board's pure functions: what a card shows, the open card as a references
// view, drops, and editing a board's columns.
import type { BlockId, BlockView, BoardSummary, CardView, Command, PageView, RefsView, StateView } from './types'

/** The card's description: blocks under the root with no state and no stated block between them and the root, depth minus 1. */
export function descriptionOf(card: CardView): BlockView[] {
  const out: BlockView[] = []
  let skipBelow: number | null = null
  for (const b of card.blocks.slice(1)) {
    if (skipBelow !== null) {
      if (b.depth > skipBelow) continue
      skipBelow = null
    }
    if (b.state !== null) {
      skipBelow = b.depth
      continue
    }
    out.push({ ...b, depth: b.depth - 1 })
  }
  return out
}

export function clip<T>(items: T[], n: number): { shown: T[]; more: number } {
  return { shown: items.slice(0, n), more: Math.max(0, items.length - n) }
}

/** `29 Oct 2026` or `29 Oct 2026 · ✓ 28 Oct`. */
export function sourceLine(card: CardView): string {
  return card.done ? `${card.source} · ✓ ${card.done}` : card.source
}

/** `1/2 subtasks`, or null without subtasks. */
export function subtaskHint(card: CardView): string | null {
  return card.subtasksTotal > 0 ? `${card.subtasksDone}/${card.subtasksTotal} subtasks` : null
}

/** The open card as a one-group, one-ref references view (for patchRefs and refBlocks). */
export function cardFromView(card: CardView): RefsView {
  return {
    key: card.page,
    count: 1,
    groups: [{ page: card.page, title: card.pageName, kind: card.pageKind, refs: [{ crumbs: [], blocks: card.blocks }] }],
  }
}

/** The open card for block `id` of `page` (its subtree, relative depths); null if `id` is not in `page`. */
export function cardOf(page: PageView, id: BlockId): RefsView | null {
  const i = page.blocks.findIndex((b) => b.id === id)
  if (i < 0) return null
  const d = page.blocks[i].depth
  let end = i + 1
  while (end < page.blocks.length && page.blocks[end].depth > d) end++
  const blocks = page.blocks.slice(i, end).map((b) => ({ ...b, depth: b.depth - d }))
  return { key: page.key, count: 1, groups: [{ page: page.key, title: page.title, kind: page.kind, refs: [{ crumbs: [], blocks }] }] }
}

/** The root block of an open card, or null. */
export function cardRoot(card: RefsView | null): BlockId | null {
  return card?.groups[0]?.refs[0]?.blocks[0]?.id ?? null
}

/** A card's place on screen, for a drop: its block and its top and bottom edge. */
export interface CardBox {
  id: BlockId
  top: number
  bottom: number
}

/**
 * The card a pointer at `y` drops above: the first card (top to bottom, `dragged` left out) whose middle is below
 * `y`; null below them all (the column's end).
 */
export function dropBefore(cards: CardBox[], dragged: BlockId, y: number): BlockId | null {
  const below = cards.find((c) => c.id !== dragged && (c.top + c.bottom) / 2 > y)
  return below?.id ?? null
}

/**
 * `board.place` for card `card` dropped in column `column` (its keyword, whether it is finished, and its cards' ids
 * top to bottom) above card `before` (null: at the end). Null when the drop changes nothing: within a finished column,
 * or at the card's own place (on itself, or above the card already below it).
 */
export function placeCommand(
  card: { id: BlockId; state: string },
  column: { keyword: string; finished: boolean; ids: BlockId[] },
  before: BlockId | null,
): Command | null {
  const own = card.state === column.keyword
  if (own) {
    if (column.finished) return null
    const i = column.ids.indexOf(card.id)
    if (i >= 0 && (before === card.id || before === (column.ids[i + 1] ?? null))) return null
  }
  return { type: 'board.place', id: card.id, keyword: column.keyword, before }
}

/**
 * The items of a card's menu in column `column`: "Move to" the other columns, and Archive. A card on a board is never
 * archived; a task leaves the archive only by a change of state, so there is no Unarchive.
 */
export function cardMenu(column: string, columns: string[]): { moveTo: string[]; archive: boolean } {
  return { moveTo: columns.filter((k) => k !== column), archive: true }
}

/** Whether an added card's text is still only its keyword, with the `created::` line "+ Add" writes. */
export function isBareKeyword(text: string, keyword: string): boolean {
  const [first, ...rest] = text.split('\n')
  return first.trim() === keyword && rest.every((l) => l.trim() === '' || /^created::( |$)/.test(l))
}

/** What an added card's editor opens with: a space after the keyword, for the caret, and the block's other lines. */
export function addedText(text: string, keyword: string): string {
  return `${keyword} ${text.slice(keyword.length)}`
}

/** Every state except finished states outside the cycle. */
export function defaultColumns(states: StateView[]): string[] {
  return states.filter((s) => !s.finished || s.inCycle).map((s) => s.keyword)
}

/** `cols` with item `i` moved one place (`dir`); unchanged at the ends. */
export function moveColumn(cols: string[], i: number, dir: -1 | 1): string[] {
  const j = i + dir
  if (i < 0 || i >= cols.length || j < 0 || j >= cols.length) return cols
  const out = [...cols]
  ;[out[i], out[j]] = [out[j], out[i]]
  return out
}

/** The states that can still be added as columns, in config order. */
export function addableColumns(states: StateView[], cols: string[]): string[] {
  return states.map((s) => s.keyword).filter((k) => !cols.includes(k))
}

/** `list` with board `i` replaced by `b` (board settings saved). */
export function withBoard(list: BoardSummary[], i: number, b: BoardSummary): BoardSummary[] {
  return list.map((x, j) => (j === i ? b : x))
}

/** `list` without board `i` (board deleted). */
export function withoutBoard(list: BoardSummary[], i: number): BoardSummary[] {
  return list.filter((_, j) => j !== i)
}

/** The board index to show after board `deleted` is gone; `'feed'` if it was the one shown. */
export function shownAfterDelete(shown: number | null, deleted: number): number | null | 'feed' {
  if (shown === null) return null
  if (shown === deleted) return 'feed'
  return shown > deleted ? shown - 1 : shown
}

/** The board-settings dialog (open for board `open`) after `boards.set` for board `i` was answered: closed only when accepted, so a refused edit keeps the user's input. */
export function settingsAfterSet(open: number | null, i: number, accepted: boolean, code: string | null = null): number | null {
  // Refused because config.toml changed since the dialog opened: it closes, so it shows the file's values when opened again.
  return (accepted || code === 'configChanged') && open === i ? null : open
}

/** The board dialog's index after the config changed: its board is found by name (a hand edit can reorder boards), else null and the dialog closes. */
export function settingsIndexAfterConfig(open: { index: number; name: string } | null, boards: BoardSummary[]): number | null {
  if (open === null) return null
  const name = open.name.toLowerCase()
  const i = boards.findIndex((b) => b.name.toLowerCase() === name)
  return i < 0 ? null : i
}

/** The board list with board `i` swapped with its neighbour in direction `dir`; unchanged at the ends. */
export function moveBoard(boards: BoardSummary[], i: number, dir: -1 | 1): BoardSummary[] {
  const j = i + dir
  if (i < 0 || i >= boards.length || j < 0 || j >= boards.length) return boards
  const out = [...boards]
  ;[out[i], out[j]] = [out[j], out[i]]
  return out
}

/** The board list with the board named `name` (any case) moved one place in direction `dir`; null when it is gone or at that end. */
export function moveBoardNamed(boards: BoardSummary[], name: string, dir: -1 | 1): BoardSummary[] | null {
  const key = name.toLowerCase()
  const i = boards.findIndex((b) => b.name.toLowerCase() === key)
  const out = moveBoard(boards, i, dir)
  return out === boards ? null : out
}

/** The board dialog after a new config: the index of its board found by name, or closed with a notice when the board is gone. */
export function boardDialogAfterConfig(
  open: { index: number; name: string } | null,
  boards: BoardSummary[],
): { index: number | null; notice: string | null } {
  if (open === null) return { index: null, notice: null }
  const index = settingsIndexAfterConfig(open, boards)
  return { index, notice: index === null ? `The board ${open.name} changed in breccia/config.toml.` : null }
}
