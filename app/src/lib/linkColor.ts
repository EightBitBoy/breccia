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
