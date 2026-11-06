/** What a click on a rendered anchor means. `link` is true for a page link (`[[Page#Heading]]` then opens `Page`), false for a tag. */
export type LinkClick =
  | { kind: 'page'; name: string; link: boolean }
  | { kind: 'external'; url: string }
  | { kind: 'none' }

export interface AnchorInfo {
  className: string
  dataPage: string | null
  /** The target as typed, from `data-name`. */
  dataName: string | null
  href: string | null
  /** Ctrl (Cmd on macOS) was held: kept free for "open in a new tab" later. */
  mod?: boolean
}

/**
 * A page link or tag opens the name the core wrote into `data-name` (the target as
 * typed), falling back to its `data-page` key. An `ext` anchor opens its href in the
 * system browser. Anything else does nothing, and so does a page link clicked with
 * Ctrl (Cmd): that gesture is reserved.
 */
export function linkClick(a: AnchorInfo): LinkClick {
  const classes = a.className.split(/\s+/)
  if (classes.includes('ext')) return a.href ? { kind: 'external', url: a.href } : { kind: 'none' }
  if (!a.dataPage || a.mod) return { kind: 'none' }
  if (classes.includes('tag') || classes.includes('link')) {
    return { kind: 'page', name: a.dataName ?? a.dataPage, link: classes.includes('link') }
  }
  return { kind: 'none' }
}
