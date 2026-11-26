// Back and forward between views: what a place in the history is, and which one the main area shows.
import type { MainView } from './mainArea.svelte'
import type { BlockId } from './types'

/** A view the main area can show, as the history keeps it. */
export type NavPlace =
  | { kind: 'page'; key: string }
  /** The journal feed; `day` is the day it was jumped to (null for the plain journal). */
  | { kind: 'feed'; day: string | null }
  | { kind: 'board'; name: string }
  | { kind: 'allPages' }
  | { kind: 'archive' }
  | { kind: 'dailies' }
  | { kind: 'gitLog' }
  | { kind: 'graph' }
  | { kind: 'settings' }

/** The block left from: the edited one with its caret (UTF-16), or the selection from `anchor` to `head`. */
export type NavFocus = { kind: 'edit'; id: BlockId; at: number } | { kind: 'select'; anchor: BlockId; head: BlockId }

/** Back and Forward give the edited or selected block back on a page and in the journal only. */
export function keepsFocus(p: NavPlace): boolean {
  return p.kind === 'page' || p.kind === 'feed'
}

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
 * The place a main-area view is, as the history keeps it; null for the untitled new page, for no view, and for a
 * board, feed or page whose name, day or key is not known.
 */
export function placeOfView(
  v: MainView,
  ctx: { board: string | null; feedDay: string | null; page: string | null },
): NavPlace | null {
  switch (v.kind) {
    case 'newPage':
    case 'none':
      return null
    case 'board':
      return ctx.board === null ? null : { kind: 'board', name: ctx.board }
    case 'feed':
      return { kind: 'feed', day: ctx.feedDay }
    case 'page':
      return ctx.page === null ? null : { kind: 'page', key: ctx.page }
    default:
      return { kind: v.kind }
  }
}

/** The feed's day at the top of the window: the first one whose bottom is below `viewTop`. */
export function topDayOf(days: { key: string; top: number; bottom: number }[], viewTop: number): string | null {
  return days.find((d) => d.bottom > viewTop)?.key ?? null
}
