// The rows of the quick search list: a date, page names, groups of block matches.
import { completions } from './complete'
import type { BlockId, NameView, SearchView, Segment, StateView } from './types'

export type SearchRow =
  | { kind: 'date'; key: string; title: string; inFeed: boolean }
  | { kind: 'page'; name: string }
  | { kind: 'create'; name: string }
  /** A header, never selected. */
  | { kind: 'group'; page: string; title: string }
  | { kind: 'hit'; page: string; id: BlockId; state: string | null; segments: Segment[] }
  /** The "more matches" line, never selected. */
  | { kind: 'more' }

/** The date row, page names (not while filtered), then each group's header and hits, then the more line. */
export function searchRows(view: SearchView, names: NameView[]): SearchRow[] {
  const rows: SearchRow[] = []
  if (view.date) rows.push({ kind: 'date', ...view.date })
  if (!view.filtered && view.text.trim() !== '') {
    for (const item of completions(names, view.text, 8)) {
      if (item.kind === 'create') {
        if (!view.date) rows.push({ kind: 'create', name: item.name })
      } else rows.push({ kind: 'page', name: item.name })
    }
  }
  for (const g of view.groups) {
    rows.push({ kind: 'group', page: g.page, title: g.title })
    for (const h of g.hits) rows.push({ kind: 'hit', page: g.page, id: h.id, state: h.state, segments: h.segments })
  }
  if (view.more) rows.push({ kind: 'more' })
  return rows
}

/** A row's identity, stable across answers (the `more` line is never selected). */
export function rowKey(row: SearchRow): string {
  switch (row.kind) {
    case 'date': return `date:${row.key}`
    case 'page': return `page:${row.name}`
    case 'create': return `create:${row.name}`
    case 'hit': return `hit:${row.id}`
    case 'group': return `group:${row.page}`
    case 'more': return 'more'
  }
}

export function selectable(row: SearchRow): boolean {
  return row.kind !== 'group' && row.kind !== 'more'
}

/** The first selectable row, or -1. */
export function firstSelectable(rows: SearchRow[]): number {
  return rows.findIndex(selectable)
}

/** The next selectable row from `at` in direction `dir`; `at` itself at the ends. */
export function moveSelection(rows: SearchRow[], at: number, dir: 1 | -1): number {
  for (let i = at + dir; i >= 0 && i < rows.length; i += dir) if (selectable(rows[i])) return i
  return at
}

/**
 * A hit's line without its leading state keyword, which the row shows as a chip (as a rendered block does).
 * A line cut before its start, or with the keyword itself highlighted, is kept as it is.
 */
export function hitSegments(state: string | null, segments: Segment[]): Segment[] {
  const first = segments[0]
  if (state === null || !first || first.hit) return segments
  if (first.text === state) return segments.slice(1) // a block that is only the keyword: the chip alone
  const lead = state + ' '
  if (!first.text.startsWith(lead)) return segments
  const rest = first.text.slice(lead.length)
  return rest === '' ? segments.slice(1) : [{ text: rest, hit: false }, ...segments.slice(1)]
}

/** The configured colour of state `keyword` (the `data-color` of a rendered chip). */
export function stateColor(states: StateView[], keyword: string): string | undefined {
  return states.find((s) => s.keyword === keyword)?.color
}
