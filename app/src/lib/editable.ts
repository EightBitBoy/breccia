// What the editor may touch in the shown view: its blocks, the order ↑/↓ walk, and the page of a block.
import { dayOfBlock, feedBlocks, feedRun, type Feed } from './feed'
import { pageOfBlock, refBlocks } from './refs'
import { visible } from './tree'
import type { BlockId, BlockView, PageView, RefsView } from './types'

export interface EditableView {
  /** Whether a board is shown. */
  board: boolean
  /** The open card on the board, or null. */
  card: RefsView | null
  /** The journal feed, or null while none is shown. */
  feed: Feed | null
  /** The shown page, or null. */
  page: PageView | null
  /** The shown page's linked references, or null. */
  refs: RefsView | null
}

/** The open card on a board ([] without one), the feed's loaded days, or the page and its references. */
export function editableBlocks(v: EditableView, folded: ReadonlySet<number>): BlockView[] {
  if (v.board) return v.card ? refBlocks(v.card, folded) : []
  if (v.feed) return feedBlocks(v.feed, folded)
  return [...(v.page ? visible(v.page.blocks, folded) : []), ...(v.refs ? refBlocks(v.refs, folded) : [])]
}

/** The blocks ↑/↓ walk from `id`: in the feed (no board) its run of loaded days (`feedRun`), else `editableBlocks`. */
export function walkOrder(v: EditableView, folded: ReadonlySet<number>, id: BlockId): BlockView[] {
  return v.feed && !v.board ? feedRun(v.feed, folded, id) : editableBlocks(v, folded)
}

/** The page key `id` belongs to in the shown view, or null. */
export function editablePageOf(v: EditableView, id: BlockId): string | null {
  if (v.board) return pageOfBlock(null, v.card, id)
  if (v.feed) return dayOfBlock(v.feed, id)
  return pageOfBlock(v.page, v.refs, id)
}
