import { expect, test, vi } from 'vitest'
import { Search } from './search.svelte'
import * as rowsModule from './search'
import type { SearchRow } from './search'
import type { Command, NameView, Notice, Output, SearchView } from './types'

vi.mock('./search', async (importOriginal) => {
  const orig = await importOriginal<typeof import('./search')>()
  return { ...orig, searchRows: vi.fn(orig.searchRows) }
})

const empty: Output = {
  page: null, focus: null, notices: [], folder: null, config: null, refs: null, names: null, tree: null,
  changed: [], removed: [], dirty: null, feed: null, pages: [], board: null, table: null, search: null, renamed: [], git: null, usage: null, usageSkipped: null, graph: null, saved: [],
}
const view = (text: string, over: Partial<SearchView> = {}): SearchView => ({
  query: text, text, filtered: false, date: null, more: false,
  groups: [{ page: 'a', title: 'A', kind: 'page', hits: [{ id: 1, state: null, segments: [{ text: 'a', hit: true }] }] }],
  ...over,
})

function setup(fail = false) {
  const sent: Command[] = []
  const notices: Notice[] = []
  const chosen: SearchRow[] = []
  const pending: Array<() => void> = []
  const back: number[] = []
  let hold = false
  const s = new Search({
    run: (cmd) => {
      sent.push(cmd)
      if (fail && cmd.type === 'search.query') return Promise.reject({ code: 'internal', message: 'boom' })
      if (!hold) return Promise.resolve(empty)
      return new Promise((res) => pending.push(() => res(empty)))
    },
    notify: (n) => notices.push(n),
    choose: (row) => chosen.push(row),
    back: (id) => back.push(id),
  })
  return { s, sent, notices, chosen, pending, back, hold: () => (hold = true) }
}
const tick = () => new Promise((r) => setTimeout(r, 0))
const queries = (sent: Command[]) => sent.filter((c) => c.type === 'search.query').map((c) => (c as { text: string }).text)

test('show runs pages.list once and resets', () => {
  const { s, sent } = setup()
  s.text = 'x'
  s.show()
  expect(s.shown).toBe(true)
  expect(s.text).toBe('')
  expect(s.view).toBeNull()
  expect(s.selected).toBe(-1)
  expect(sent).toEqual([{ type: 'pages.list' }])
  s.text = 'keep'
  s.show()
  expect(s.text).toBe('keep')
  expect(sent.length).toBe(1)
})

test('type sends search.query', () => {
  const { s, sent } = setup()
  s.show()
  s.type('ab')
  expect(s.text).toBe('ab')
  expect(sent[1]).toEqual({ type: 'search.query', text: 'ab' })
})

test('a text typed while a query is in flight is sent once after it, only the newest', async () => {
  const { s, sent, pending, hold } = setup()
  s.show()
  hold()
  s.type('a')
  s.type('ab')
  s.type('abc')
  expect(queries(sent)).toEqual(['a'])
  pending.shift()!()
  await tick()
  expect(queries(sent)).toEqual(['a', 'abc'])
  pending.shift()!()
  await tick()
  expect(queries(sent)).toEqual(['a', 'abc'])
  expect(s.busy).toBe(false)
})

test('an answer for an older text is ignored', () => {
  const { s } = setup()
  s.show()
  s.type('ab')
  s.applySearch(view('a'))
  expect(s.view).toBeNull()
})

test('an answer while closed is ignored', () => {
  const { s } = setup()
  s.text = 'a'
  s.applySearch(view('a'))
  expect(s.view).toBeNull()
})

test('applySearch selects the first selectable row', () => {
  const { s } = setup()
  s.show()
  s.type('a')
  s.applySearch(view('a', { filtered: true }))
  expect(s.rows().map((r) => r.kind)).toEqual(['group', 'hit'])
  expect(s.selected).toBe(1)
  expect(s.chosen()).toMatchObject({ kind: 'hit', id: 1 })
})

test('move steps over headers', () => {
  const { s } = setup()
  s.show()
  s.type('a')
  s.applySearch(view('a', { filtered: true, groups: [view('a').groups[0], { ...view('a').groups[0], page: 'b' }] }))
  expect(s.rows().map((r) => r.kind)).toEqual(['group', 'hit', 'group', 'hit'])
  s.move(1)
  expect(s.selected).toBe(3)
  s.move(-1)
  expect(s.selected).toBe(1)
})

test('applyNames is ignored while closed', () => {
  const { s } = setup()
  const names: NameView[] = [{ key: 'a', name: 'A', exists: true }]
  s.applyNames(names)
  expect(s.names).toEqual([])
  s.show()
  s.applyNames(names)
  expect(s.names).toEqual(names)
})

test('refresh re-runs the current text while open', async () => {
  const { s, sent } = setup()
  s.show()
  s.type('ab')
  await tick()
  s.refresh()
  await tick()
  expect(queries(sent)).toEqual(['ab', 'ab'])
})

test('refresh does nothing while closed or empty', () => {
  const { s, sent } = setup()
  s.refresh()
  s.show()
  s.refresh()
  expect(queries(sent)).toEqual([])
})

test('a failed query is a notice', async () => {
  const { s, notices } = setup(true)
  s.show()
  s.type('a')
  await tick()
  expect(notices).toEqual([{ kind: 'refused', message: expect.stringContaining('boom') }])
  expect(s.busy).toBe(false)
})

test('empty text clears the view without a query', () => {
  const { s, sent } = setup()
  s.show()
  s.type('a')
  s.applySearch(view('a'))
  s.type('')
  expect(s.view).toBeNull()
  expect(queries(sent)).toEqual(['a'])
})

test('close forgets text and view', () => {
  const { s } = setup()
  s.show()
  s.type('a')
  s.applySearch(view('a'))
  s.close()
  expect([s.shown, s.text, s.view]).toEqual([false, '', null])
})

test('enter chooses the selected row of the answer for the current text', () => {
  const { s, chosen } = setup()
  s.show()
  s.type('a')
  s.applySearch(view('a', { filtered: true }))
  s.enter()
  expect(chosen).toEqual([expect.objectContaining({ kind: 'hit', id: 1 })])
})

test('enter while the answer is for an older text waits for the current answer', () => {
  const { s, chosen } = setup()
  s.show()
  s.type('a')
  s.applySearch(view('a', { filtered: true }))
  s.type('ab')
  s.enter()
  expect(chosen).toEqual([])
  s.applySearch(view('ab', { filtered: true, groups: [{ ...view('a').groups[0], hits: [{ id: 2, state: null, segments: [] }] }] }))
  expect(chosen).toEqual([expect.objectContaining({ kind: 'hit', id: 2 })])
  s.applySearch(view('ab', { filtered: true }))
  expect(chosen.length).toBe(1)
})

test('enter before any answer chooses once the answer arrives', () => {
  const { s, chosen } = setup()
  s.show()
  s.type('a')
  s.enter()
  expect(chosen).toEqual([])
  s.applySearch(view('a', { filtered: true }))
  expect(chosen).toEqual([expect.objectContaining({ kind: 'hit', id: 1 })])
})

test('a newer keystroke cancels a waiting enter', () => {
  const { s, chosen } = setup()
  s.show()
  s.type('a')
  s.enter()
  s.type('ab')
  s.applySearch(view('ab', { filtered: true }))
  expect(chosen).toEqual([])
})

test('closing cancels a waiting enter', () => {
  const { s, chosen } = setup()
  s.show()
  s.type('a')
  s.enter()
  s.close()
  s.show()
  s.type('a')
  s.applySearch(view('a', { filtered: true }))
  expect(chosen).toEqual([])
})

test('enter with empty text does nothing', () => {
  const { s, chosen } = setup()
  s.show()
  s.enter()
  s.type('a')
  s.applySearch(view('a', { filtered: true }))
  expect(chosen).toEqual([])
})

test('a failed query cancels a waiting enter', async () => {
  const { s, chosen } = setup(true)
  s.show()
  s.type('a')
  s.enter()
  await tick()
  s.applySearch(view('a', { filtered: true }))
  expect(chosen).toEqual([])
})

test('close drops a text queued behind the query in flight', async () => {
  const { s, sent, pending, hold } = setup()
  s.show()
  hold()
  s.type('a')
  s.type('ab')
  s.close()
  s.show()
  pending.shift()!()
  await tick()
  expect(queries(sent)).toEqual(['a'])
})

test('moving the selection does not compute the rows again', () => {
  const { s } = setup()
  s.show()
  s.type('a')
  s.applySearch(view('a', { filtered: true, groups: [view('a').groups[0], { ...view('a').groups[0], page: 'b' }] }))
  s.rows()
  const calls = vi.mocked(rowsModule.searchRows).mock.calls.length
  s.move(1)
  s.move(-1)
  s.chosen()
  s.rows()
  expect(vi.mocked(rowsModule.searchRows).mock.calls.length).toBe(calls)
  s.applyNames([{ key: 'x', name: 'X', exists: true }])
  s.rows()
  expect(vi.mocked(rowsModule.searchRows).mock.calls.length).toBe(calls + 1)
})

test('dismissing returns to the block edited when the box opened, once', () => {
  const { s, back, chosen } = setup()
  s.show(5)
  s.dismiss()
  expect(back).toEqual([5])
  s.show()
  s.dismiss()
  expect(back).toEqual([5])
  s.show(6)
  s.type('a')
  s.applySearch(view('a', { filtered: true }))
  s.enter()
  s.close() // a chosen row closes the box: no return
  s.dismiss()
  expect(back).toEqual([5])
  expect(chosen.length).toBe(1)
})

const hit = (id: number) => ({ id, state: null, segments: [{ text: 'a', hit: true }] })

test('applySearch keeps the selected hit when it is still there, else the first selectable', () => {
  const { s } = setup()
  s.show()
  s.type('a')
  const g = view('a').groups[0]
  s.applySearch(view('a', { filtered: true, groups: [{ ...g, hits: [hit(5), hit(7)] }] }))
  s.move(1)
  expect(s.chosen()).toMatchObject({ kind: 'hit', id: 7 })
  s.applySearch(view('a', { filtered: true, groups: [{ ...g, hits: [hit(6), hit(7)] }] }))
  expect(s.chosen()).toMatchObject({ kind: 'hit', id: 7 })
  s.applySearch(view('a', { filtered: true, groups: [{ ...g, hits: [hit(8), hit(9)] }] }))
  expect(s.chosen()).toMatchObject({ kind: 'hit', id: 8 })
})

test('refreshNames sends pages.list only while shown', () => {
  const { s, sent } = setup()
  s.refreshNames()
  expect(sent).toEqual([])
  s.show()
  s.refreshNames()
  expect(sent).toEqual([{ type: 'pages.list' }, { type: 'pages.list' }])
})

test('a new text selects its first row; a refresh of the same text keeps the selected row', () => {
  const { s } = setup()
  s.show()
  const g = view('a').groups[0]
  s.type('a')
  s.applySearch(view('a', { filtered: true, groups: [{ ...g, hits: [hit(1), hit(2)] }] }))
  s.move(1)
  expect(s.chosen()).toMatchObject({ id: 2 })
  s.type('b')
  s.applySearch(view('b', { filtered: true, groups: [{ ...g, hits: [hit(3), hit(2)] }] }))
  expect(s.chosen()).toMatchObject({ id: 3 })
  s.move(1)
  s.applySearch(view('b', { filtered: true, groups: [{ ...g, hits: [hit(4), hit(2)] }] }))
  expect(s.chosen()).toMatchObject({ id: 2 })
})

test('a refresh while a query is in flight is sent once after it', async () => {
  const { s, sent, pending, hold } = setup()
  s.show()
  hold()
  s.type('abc')
  expect(queries(sent)).toEqual(['abc'])
  expect(pending.length).toBe(1)
  s.refresh()
  s.refresh()
  s.refresh()
  expect(queries(sent)).toEqual(['abc'])
  pending.shift()!()
  await tick()
  expect(queries(sent)).toEqual(['abc', 'abc'])
  pending.shift()!()
  await tick()
  expect(queries(sent)).toEqual(['abc', 'abc'])
  expect(s.busy).toBe(false)
})
