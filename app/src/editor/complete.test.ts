import { EditorSelection, EditorState, type TransactionSpec } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { expect, test } from 'vitest'
import type { NameView } from '../lib/types'
import { linkSource } from './complete'

const names: NameView[] = [{ key: 'project x', name: 'Project X', exists: true }]

/** Just enough of a view for `apply`: its state and dispatch. */
function fakeView(doc: string, caret: number) {
  const v = {
    state: EditorState.create({ doc, selection: EditorSelection.cursor(caret) }),
    dispatch(spec: TransactionSpec) {
      v.state = v.state.update(spec).state
    },
  }
  return v
}

test('names are fetched once until the menu resets', async () => {
  let fetches = 0
  const src = linkSource(() => (fetches++, Promise.resolve(names)))
  const q = src.query('[[pro', '')!
  expect(await src.items(q)).toEqual([
    { kind: 'page', name: 'Project X', label: 'Project X' },
    { kind: 'create', name: 'pro', label: 'Create page “pro”' },
  ])
  expect(src.items(src.query('[[proj', '')!)).toHaveLength(2)
  expect(fetches).toBe(1)
  src.reset!()
  await src.items(q)
  expect(fetches).toBe(2)
})

test('choosing replaces the query and a closing ]] with the link, caret after it', () => {
  const src = linkSource(() => Promise.resolve(names))
  const v = fakeView('see [[pro]] x', 9)
  const q = src.query('see [[pro', ']] x')!
  src.apply(v as unknown as EditorView, q, { kind: 'page', name: 'Project X', label: 'Project X' })
  expect(v.state.doc.toString()).toBe('see [[Project X]] x')
  expect(v.state.selection.main.head).toBe(17)
})

test('create writes the typed name as a tag', () => {
  const src = linkSource(() => Promise.resolve(names))
  const v = fakeView('a #new', 6)
  const q = src.query('a #new', '')!
  src.apply(v as unknown as EditorView, q, { kind: 'create', name: 'new', label: 'Create page “new”' })
  expect(v.state.doc.toString()).toBe('a #new')
  expect(v.state.selection.main.head).toBe(6)
  const w = fakeView('#[[two wo', 9)
  src.apply(w as unknown as EditorView, src.query('#[[two wo', '')!, { kind: 'create', name: 'two wo', label: '' })
  expect(w.state.doc.toString()).toBe('#[[two wo]]')
})
