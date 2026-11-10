import { EditorSelection, EditorState, type TransactionSpec } from '@codemirror/state'
import { EditorView, type ViewUpdate } from '@codemirror/view'
import { expect, test } from 'vitest'
import { createCaretMenu, type MenuSource, type MenuView } from './menu'

/**
 * Drives a caret menu without a DOM: a fake view whose dispatch runs the
 * menu's update listener, as a real view would after each transaction.
 */
function harness(source: MenuSource<string>, blocked = () => false) {
  const shown: (MenuView | null)[] = []
  const menu = createCaretMenu(source, { show: (m) => shown.push(m), canApply: () => true, blocked })
  const view = {
    state: EditorState.create({ extensions: [menu.extension] }),
    requestMeasure() {},
    dispatch(spec: TransactionSpec) {
      const tr = view.state.update(spec)
      view.state = tr.state
      const u = { view, docChanged: tr.docChanged, selectionSet: !!tr.selection } as unknown as ViewUpdate
      for (const f of view.state.facet(EditorView.updateListener)) f(u)
    },
  }
  const type = (s: string) => view.dispatch(view.state.replaceSelection(s))
  const last = () => shown[shown.length - 1] ?? null
  return { menu, view, type, last }
}

/** `@word` before the caret; items are the word repeated; applying writes `<item>`. */
const at = (items: (w: string) => string[] | Promise<string[]> = (w) => [w, w + w]): MenuSource<string> => ({
  query(before) {
    const m = /@(\w*)$/.exec(before)
    return m && { start: m.index, end: before.length, key: m[1] }
  },
  items: (q) => items(q.key),
  apply(view, q, item) {
    view.dispatch({ changes: { from: q.start, to: q.end, insert: `<${item}>` }, selection: EditorSelection.cursor(q.start + item.length + 2) })
  },
  label: (item) => item,
})

test('opens on a query, follows it, and closes when it is gone', () => {
  const h = harness(at())
  h.type('x @ab')
  expect(h.last()?.items.map((i) => i.label)).toEqual(['ab', 'abab'])
  expect(h.menu.active()).toBe(true)
  h.type(' ')
  expect(h.last()).toBeNull()
  expect(h.menu.active()).toBe(false)
})

test('choosing applies the item and closes the menu', () => {
  const h = harness(at())
  h.type('@a')
  h.menu.choose(1)
  expect(h.view.state.doc.toString()).toBe('<aa>')
  expect(h.last()).toBeNull()
})

test('a blocked menu stays closed', () => {
  let blocked = true
  const h = harness(at(), () => blocked)
  h.type('@a')
  expect(h.last()).toBeNull()
  blocked = false
  h.type('b')
  expect(h.last()?.items.map((i) => i.label)).toEqual(['ab', 'abab'])
})

test('late items for an older query are dropped', async () => {
  const pending: ((v: string[]) => void)[] = []
  const h = harness(at(() => new Promise((r) => pending.push(r))))
  h.type('@a')
  h.type('b')
  pending[1](['new'])
  pending[0](['old'])
  await Promise.resolve()
  await Promise.resolve()
  expect(h.last()?.items.map((i) => i.label)).toEqual(['new'])
  h.menu.close()
  expect(h.menu.active()).toBe(false)
})

test("a source's icon reaches the menu view", () => {
  const h = harness({ ...at(), icon: (item) => (item === 'ab' ? 'calendar' : null) })
  h.type('@ab')
  expect(h.last()?.items.map((i) => i.icon)).toEqual(['calendar', null])
})

test('a source without icons gives null', () => {
  const h = harness(at())
  h.type('@ab')
  expect(h.last()?.items.map((i) => i.icon)).toEqual([null, null])
})

test('sync looks for a query in text the editor was mounted with', () => {
  const h = harness(at())
  // A fresh editor holding text with a query: no update has run yet.
  h.view.state = EditorState.create({ doc: 'x @ab', selection: EditorSelection.cursor(5), extensions: [h.menu.extension] })
  expect(h.last()).toBeNull()
  h.menu.sync(h.view as unknown as EditorView)
  expect(h.last()?.items.map((i) => i.label)).toEqual(['ab', 'abab'])
  expect(h.menu.active()).toBe(true)
})
