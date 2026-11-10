// A menu at the caret inside the block editor: a source finds its query before
// the caret and lists items; the menu takes ↑/↓/Enter/Escape while it is open
// and applies the chosen item. CaretMenu.svelte draws it from what `show` hands out.
import { Prec, type Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'

/** What the source found before the caret: `start` and `end` in UTF-16, `key` names the query. */
export interface MenuQuery {
  start: number
  end: number
  key: string
}

export interface MenuSource<I, Q extends MenuQuery = MenuQuery> {
  /** The query at the caret, from the text before and after it; null if none. */
  query(before: string, after: string): Q | null
  items(q: Q): I[] | Promise<I[]>
  /** Applies `item` to the editor, replacing the query. */
  apply(view: EditorView, q: Q, item: I): void
  label(item: I): string
  /** A note drawn after the label. */
  note?(item: I): string | null
  /** A state colour name: the label is drawn as a state chip, like a task keyword on a page. */
  color?(item: I): string | null
  /** A small picture drawn before the label. */
  icon?(item: I): MenuIcon | null
  /** The menu closed: forget anything kept for this query. */
  reset?(): void
}

export type MenuIcon = 'calendar'

export interface MenuEntry {
  label: string
  note: string | null
  color: string | null
  icon: MenuIcon | null
}

export interface MenuView {
  items: MenuEntry[]
  index: number
  /** Viewport coordinates under the caret. */
  left: number
  top: number
}

export interface MenuHooks {
  /** The menu to draw, or null to hide it. */
  show(menu: MenuView | null): void
  /** Whether an item may be applied now (no command is changing the text). */
  canApply(): boolean
  /** While true the menu stays closed: another menu has the caret. */
  blocked?(): boolean
}

export interface Slash {
  extension: Extension
  /** Applies item `index` of the open menu. */
  choose(index: number): void
  close(): void
  /** Whether the source has a query at the caret (open, or waiting for its items). */
  active(): boolean
  /** Looks for a query at the caret of `view` now: text a fresh editor was mounted with fires no update. */
  sync(view: EditorView): void
}

export function createCaretMenu<I, Q extends MenuQuery = MenuQuery>(source: MenuSource<I, Q>, hooks: MenuHooks): Slash {
  let view: EditorView | null = null
  /** The query at the caret, while it is not dismissed or blocked. */
  let current: Q | null = null
  let open: { q: Q; items: I[]; index: number; left: number; top: number; head: number } | null = null
  /** The query start the user closed the menu at with Escape: it stays closed for that trigger. */
  let dismissed: number | null = null
  /** Counts refreshes, so late items for an older query are dropped. */
  let seq = 0

  function publish() {
    hooks.show(
      open && {
        items: open.items.map((i) => ({
          label: source.label(i),
          note: source.note?.(i) ?? null,
          color: source.color?.(i) ?? null,
          icon: source.icon?.(i) ?? null,
        })),
        index: open.index,
        left: open.left,
        top: open.top,
      },
    )
  }

  function hide() {
    if (!open) return
    open = null
    publish()
  }

  /** Closes the menu and forgets the query, until the caret moves to a query again. */
  function close() {
    seq++
    const had = current !== null || open !== null
    current = null
    hide()
    if (had) source.reset?.()
  }

  function show(v: EditorView, q: Q, head: number, items: I[]) {
    if (!items.length) return hide()
    const same = open !== null && open.q.start === q.start && open.q.key === q.key
    open = {
      q,
      items,
      index: same ? Math.min(open!.index, items.length - 1) : 0,
      left: open?.left ?? 0,
      top: open?.top ?? 0,
      head,
    }
    publish()
    // Layout cannot be read during an update: measure afterwards.
    v.requestMeasure({
      key: open,
      read: (v) => v.coordsAtPos(head),
      write: (c) => {
        if (!c || !open || open.head !== head) return
        open.left = c.left
        open.top = c.bottom
        publish()
      },
    })
  }

  function refresh(v: EditorView) {
    view = v
    const sel = v.state.selection.main
    const doc = v.state.doc
    const q = sel.empty ? source.query(doc.sliceString(0, sel.head), doc.sliceString(sel.head)) : null
    if (!q) dismissed = null
    if (!q || dismissed === q.start || hooks.blocked?.()) return close()
    const token = ++seq
    current = q
    const head = sel.head
    const items = source.items(q)
    if (!(items instanceof Promise)) return show(v, q, head, items)
    items.then(
      (list) => {
        if (token === seq && view === v) show(v, q, head, list)
      },
      (e) => console.error('menu items failed', e),
    )
  }

  function choose(index: number) {
    const item = open?.items[index]
    if (!open || !item || !view || !hooks.canApply()) return
    const q = open.q
    close()
    // What the item wrote may read as a query at the same start again (a plain tag): keep it closed.
    dismissed = q.start
    source.apply(view, q, item)
  }

  const keys = Prec.highest(
    EditorView.domEventHandlers({
      keydown(e) {
        if (!open || e.isComposing || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return false
        const n = open.items.length
        switch (e.key) {
          case 'ArrowUp':
          case 'ArrowDown':
            open.index = (open.index + (e.key === 'ArrowUp' ? n - 1 : 1)) % n
            publish()
            break
          case 'Enter':
            choose(open.index)
            break
          case 'Escape':
            dismissed = open.q.start
            close()
            break
          default:
            return false
        }
        e.preventDefault()
        return true
      },
    }),
  )

  return {
    extension: [
      keys,
      EditorView.updateListener.of((u) => {
        if (u.docChanged || u.selectionSet) refresh(u.view)
      }),
    ],
    choose,
    close,
    active: () => current !== null,
    sync: refresh,
  }
}
