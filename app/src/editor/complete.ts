// The `[[` and `#` autocomplete: a caret-menu source that offers page names for
// the link or tag being typed, and writes the chosen one (or a new name) as a link.
import { EditorSelection } from '@codemirror/state'
import { completions, linkQuery, linkText, type CompletionItem } from '../lib/complete'
import type { NameView } from '../lib/types'
import type { MenuQuery, MenuSource } from './menu'

export interface LinkMenuQuery extends MenuQuery {
  kind: 'page' | 'tag'
  query: string
}

/** `fetchNames` lists the pages (`pages.list`); it runs once per opening of the menu. */
export function linkSource(fetchNames: () => Promise<NameView[]>): MenuSource<CompletionItem, LinkMenuQuery> {
  let fetched: Promise<NameView[]> | null = null
  let names: NameView[] | null = null

  return {
    query(before, after) {
      const q = linkQuery(before, after)
      return q && { start: q.from, end: q.to, key: `${q.kind}:${q.query}`, kind: q.kind, query: q.query }
    },
    items(q) {
      if (names) return completions(names, q.query)
      if (!fetched) {
        const p: Promise<NameView[]> = fetchNames().then((list) => {
          // A reset while fetching drops the answer.
          if (fetched === p) names = list
          return list
        })
        fetched = p
      }
      return fetched.then((list) => completions(list, q.query))
    },
    apply(view, q, item) {
      const insert = linkText(q.kind, item.name)
      view.dispatch({
        changes: { from: q.start, to: q.end, insert },
        selection: EditorSelection.cursor(q.start + insert.length),
        userEvent: 'input',
        scrollIntoView: true,
      })
    },
    label: (item) => item.label,
    reset() {
      fetched = null
      names = null
    },
  }
}
