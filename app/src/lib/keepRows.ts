// Keeping the rows a user looks at in place when rows are added above them (a new commit on top of the Git history).
// The virtualised rows are absolutely placed, so the browser's scroll anchoring has nothing to follow; the view
// raises its scroll position by the rows that came in above instead.

/** The index of the row at the top edge of the scroller, or -1 while the rows have not been scrolled into. */
export function firstShown(scrollTop: number, margin: number, rowHeight: number): number {
  if (scrollTop <= margin) return -1
  return Math.floor((scrollTop - margin) / rowHeight)
}

/**
 * How many rows the row at `first` in `before` moved in `after`: positive when rows came in above it, negative when
 * rows above it went. 0 when nothing was scrolled (`first` < 0), or that row is not in `after`.
 */
export function rowsMoved<K>(before: readonly K[], after: readonly K[], first: number): number {
  if (first < 0 || first >= before.length) return 0
  const at = after.indexOf(before[first])
  return at < 0 ? 0 : at - first
}
