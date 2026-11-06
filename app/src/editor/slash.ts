// The slash menu inside the block editor: a caret-menu source that finds
// `/query` before the caret and applies the chosen state, link, date or time.
import { EditorSelection } from '@codemirror/state'
import { slashEdit, slashItems, slashQuery, type SlashItem } from '../lib/slash'
import { createCaretMenu, type MenuHooks, type MenuSource, type Slash } from './menu'

export interface SlashHooks extends MenuHooks {
  /** The configured states, in order. */
  states(): { keyword: string }[]
  /** A state was chosen; the `/query` is already gone from the editor's text. */
  setState(keyword: string): void
}

export function slashSource(hooks: Pick<SlashHooks, 'states' | 'setState'>): MenuSource<SlashItem> {
  return {
    query(before) {
      const q = slashQuery(before)
      // `end` is the caret.
      return q && { start: q.start, end: before.length, key: q.query }
    },
    items: (q) => slashItems(hooks.states(), q.key),
    apply(view, q, item) {
      const r = slashEdit(view.state.doc.toString(), q.start, q.end, item, new Date())
      view.dispatch({
        changes: { from: r.from, to: r.to, insert: r.insert },
        selection: EditorSelection.cursor(r.caret),
        userEvent: 'input',
        scrollIntoView: true,
      })
      if (r.setState !== null) hooks.setState(r.setState)
    },
    label: (item) => item.label,
    note: (item) => (item.kind === 'state' ? 'state' : null),
  }
}

export function createSlash(hooks: SlashHooks): Slash {
  return createCaretMenu(slashSource(hooks), hooks)
}
