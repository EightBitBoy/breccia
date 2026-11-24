// Dragging a page or journal day from the sidebar into the outline inserts a `[[link]]` to it: the link a row's drag
// carries, and what a drop on a block or an empty page does. Pure; the DOM glue is `linkTarget` and `watchLinkDrops`
// in dnd.ts.
import { linkText } from './complete'
import { canDrag } from './treeDrop'
import type { Row } from './treeRows'
import type { BlockId, Command } from './types'

/** The key of the link in a tree row's drag data (null for a folder). */
export const LINK = 'breccia-link'

/** The link a row's drag carries: a page by its name (as `[[` completion writes it), a journal day by its date. */
export function rowLink(row: Row): string | null {
  if (row.kind === 'page' && row.key !== undefined) return linkText('page', row.label)
  if (row.kind === 'day' && row.key !== undefined) return linkText('page', row.key)
  return null
}

/** Whether a tree row can be dragged: to move it (pages, folders) or for its link (pages, journal days). */
export function canLinkDrag(row: Row): boolean {
  return canDrag(row) || rowLink(row) !== null
}

/** The link in a drag's data, or null when the drag carries none. */
export function linkData(data: Record<string | symbol, unknown>): string | null {
  const link = data[LINK]
  return typeof link === 'string' ? link : null
}

/** Where a link can be dropped: on a block row, or on the "start writing" line of an empty page or journal day. */
export type LinkSpot = { block: BlockId } | { page: string }

/** What a drop does: insert the link at the point under the pointer in the edited block, or send a command. */
export type LinkDrop = { kind: 'caret'; text: string } | { kind: 'command'; cmd: Command }

/**
 * The drop of `link` on `spot`: in the block being edited, at the caret under the pointer; on a rendered block, a
 * new block after it (after its children) holding the link; on an empty page, its first block. Null when the
 * block's page is not known.
 */
export function linkDrop(
  spot: LinkSpot,
  link: string,
  editingId: BlockId | null,
  pageOf: (id: BlockId) => string | null,
): LinkDrop | null {
  if ('page' in spot) return { kind: 'command', cmd: { type: 'block.insert', page: spot.page, after: null, text: link } }
  if (spot.block === editingId) return { kind: 'caret', text: link }
  const page = pageOf(spot.block)
  if (page === null) return null
  return { kind: 'command', cmd: { type: 'block.insert', page, after: spot.block, text: link } }
}
