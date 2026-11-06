// Back and forward between views: what a place in the history is, and which one the main area shows.

/** A view the main area can show, as the history keeps it. */
export type NavPlace =
  | { kind: 'page'; key: string }
  /** The journal feed; `day` is the day it was jumped to (null for the plain journal). */
  | { kind: 'feed'; day: string | null }
  | { kind: 'board'; name: string }
  | { kind: 'allPages' }
  | { kind: 'archive' }
  | { kind: 'gitLog' }
  | { kind: 'graph' }
  | { kind: 'settings' }

/** Whether `a` and `b` are the same place (two nulls are). */
export function samePlace(a: NavPlace | null, b: NavPlace | null): boolean {
  if (a === null || b === null) return a === b
  if (a.kind !== b.kind) return false
  if (a.kind === 'page') return a.key === (b as typeof a).key
  if (a.kind === 'feed') return a.day === (b as typeof a).day
  if (a.kind === 'board') return a.name === (b as typeof a).name
  return true
}

/**
 * The place the main area shows, in the order App's template picks a view; null for the untitled new page
 * and between two views.
 */
export function placeHere(shown: {
  newPage: boolean
  settings: boolean
  graph: boolean
  board: string | null
  gitLog: boolean
  archive: boolean
  allPages: boolean
  feed: boolean
  feedDay: string | null
  page: string | null
}): NavPlace | null {
  if (shown.newPage) return null
  if (shown.settings) return { kind: 'settings' }
  if (shown.graph) return { kind: 'graph' }
  if (shown.board !== null) return { kind: 'board', name: shown.board }
  if (shown.gitLog) return { kind: 'gitLog' }
  if (shown.archive) return { kind: 'archive' }
  if (shown.allPages) return { kind: 'allPages' }
  if (shown.feed) return { kind: 'feed', day: shown.feedDay }
  if (shown.page !== null) return { kind: 'page', key: shown.page }
  return null
}

/** The feed's day at the top of the window: the first one whose bottom is below `viewTop`. */
export function topDayOf(days: { key: string; top: number; bottom: number }[], viewTop: number): string | null {
  return days.find((d) => d.bottom > viewTop)?.key ?? null
}
