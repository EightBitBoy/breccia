// Which link or tag a right-click in a journal day gives a color to, and what that right-click does.
import type { TargetView } from './types'

/** The parts of a rendered anchor that name its target. */
export interface LinkAnchor {
  className: string
  /** The raw link key (`data-page`). */
  dataPage: string | null
}

/**
 * The target of a page link (`a.link`) or a tag (`a.tag`) with that `data-page`, when its page can be given a
 * color. External links, other elements and keys the list does not hold give null.
 */
export function colorTarget(a: LinkAnchor, targets: readonly TargetView[]): TargetView | null {
  if (a.dataPage === null) return null
  const classes = a.className.split(/\s+/)
  const kind = classes.includes('ext') ? null : classes.includes('link') ? 'link' : classes.includes('tag') ? 'tag' : null
  if (kind === null) return null
  return targets.find((t) => t.kind === kind && t.raw === a.dataPage) ?? null
}

/** What a right-click in a journal day's outline does. */
export type LinkMenuAction = { kind: 'native' } | { kind: 'none' } | { kind: 'menu'; target: TargetView }

/**
 * In the block editor, the native menu stays (cut, copy, paste). On a colorable link or tag, the link menu opens.
 * On selected text, the native menu stays (copy). Anywhere else, no menu opens.
 */
export function linkMenuAction(
  e: { inEditor: boolean; onSelection: boolean; anchor: LinkAnchor | null },
  targets: readonly TargetView[],
): LinkMenuAction {
  if (e.inEditor) return { kind: 'native' }
  const target = e.anchor ? colorTarget(e.anchor, targets) : null
  if (target) return { kind: 'menu', target }
  return e.onSelection ? { kind: 'native' } : { kind: 'none' }
}

/** A rectangle in viewport pixels, as `DOMRect` gives it. */
export interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

/** Whether the point lies in one of the boxes, edges included. */
export function pointInBoxes(x: number, y: number, boxes: readonly Box[]): boolean {
  return boxes.some((b) => x >= b.left && x <= b.right && y >= b.top && y <= b.bottom)
}

/** Where a link stands in the outline, so it can be found again after its row is drawn anew. */
export interface LinkSpot {
  /** Its row's `data-block-id`. */
  block: string
  /** Its `data-page`. */
  page: string
  /** Its index among the row's links and tags with that `data-page`. */
  nth: number
}

/** The row's links and tags to `page`, in order. */
function linksTo(row: Element, page: string): HTMLElement[] {
  return [...row.querySelectorAll<HTMLElement>('a.link, a.tag')].filter((a) => a.getAttribute('data-page') === page)
}

/** The place of a link or tag in its row, or null outside a row. */
export function spotOf(a: Element): LinkSpot | null {
  const row = a.closest('[data-block-id]')
  const block = row?.getAttribute('data-block-id')
  const page = a.getAttribute('data-page')
  if (!row || !block || page === null) return null
  const nth = linksTo(row, page).indexOf(a as HTMLElement)
  return nth < 0 ? null : { block, page, nth }
}

/** The link or tag at `spot` inside `zone` now, or null if it is no longer there. */
export function findSpot(zone: Element, spot: LinkSpot): HTMLElement | null {
  const row = zone.querySelector(`[data-block-id="${CSS.escape(spot.block)}"]`)
  return row ? (linksTo(row, spot.page)[spot.nth] ?? null) : null
}

/**
 * The color an open picker marks for the page of `picking`: the list's entry for that page now, so the mark follows a
 * save while the picker stays open; the color it had when the picker opened if the list no longer holds the page.
 */
export function pickingColor(targets: readonly TargetView[], picking: TargetView): string | null {
  const now = targets.find((t) => t.key === picking.key) ?? picking
  return now.color ?? null
}
