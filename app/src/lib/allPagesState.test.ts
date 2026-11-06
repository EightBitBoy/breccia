import { expect, test } from 'vitest'
import { AllPages } from './allPages.svelte'
import type { Command, Notice, Output, PageRowView } from './types'

const empty: Output = {
  page: null, focus: null, notices: [], folder: null, config: null, refs: null, names: null, tree: null,
  changed: [], removed: [], dirty: null, feed: null, pages: [], board: null, table: null, search: null, renamed: [], git: null, usage: null, usageSkipped: null, graph: null, saved: [],
}
const row = (o: Partial<PageRowView>): PageRowView => ({
  key: (o.name ?? 'a').toLowerCase(), name: 'a', title: o.name ?? 'a', kind: 'page', folder: '',
  created: null, edited: null, linkedFrom: 0, linksOut: 0, linkedOnly: false, ...o,
})

function setup(fail = false) {
  const sent: Command[] = []
  const notices: Notice[] = []
  const pending: Array<() => void> = []
  let hold = false
  const a = new AllPages({
    run: (cmd) => {
      sent.push(cmd)
      if (fail) return Promise.reject({ code: 'internal', message: 'boom' })
      if (!hold) return Promise.resolve({ ...empty, table: [] })
      return new Promise((res) => pending.push(() => res({ ...empty, table: [] })))
    },
    notify: (n) => notices.push(n),
  })
  return { a, sent, notices, pending, holdAnswers: () => (hold = true) }
}
const tick = () => new Promise((r) => setTimeout(r, 0))

test('open shows the table, empties the filter and runs pages.table', async () => {
  const { a, sent } = setup()
  a.filter = 'x'
  await a.open()
  expect(a.shown).toBe(true)
  expect(a.filter).toBe('')
  expect(sent).toEqual([{ type: 'pages.table' }])
})

test('an answer is applied only while shown', async () => {
  const { a } = setup()
  a.applyTable([row({ name: 'A' })])
  expect(a.rows).toBeNull()
  await a.open()
  a.applyTable([row({ name: 'A' })])
  expect(a.visible().map((r) => r.title)).toEqual(['A'])
  a.close()
  expect(a.rows).toBeNull()
  a.applyTable([row({ name: 'A' })])
  expect(a.rows).toBeNull()
})

test('sort and the journal switch outlast closing', async () => {
  const { a } = setup()
  await a.open()
  a.sortBy('edited')
  a.showJournals = true
  a.close()
  await a.open()
  expect(a.sort).toEqual({ key: 'edited', dir: 'desc' })
  expect(a.showJournals).toBe(true)
})

test('refresh while one is in flight runs once more after it', async () => {
  const { a, sent, pending, holdAnswers } = setup()
  await a.open()
  holdAnswers()
  a.refresh()
  a.refresh()
  a.refresh()
  expect(sent.length).toBe(2)
  pending.shift()!()
  await tick()
  expect(sent.length).toBe(3)
  pending.shift()!()
  await tick()
  expect(sent.length).toBe(3)
})

test('refresh does nothing while hidden; a failed pages.table is a notice', async () => {
  const { a, sent } = setup()
  a.refresh()
  expect(sent).toEqual([])
  const f = setup(true)
  await f.a.open()
  expect(f.notices).toEqual([{ kind: 'refused', message: 'boom' }])
})

test('total counts the rows under the journal switch', async () => {
  const { a } = setup()
  await a.open()
  a.applyTable([row({ name: 'A' }), row({ name: 'B' }), row({ key: '2026-10-02', name: '2026-10-02', title: 'x', kind: 'journal' })])
  a.filter = 'a'
  expect([a.visible().length, a.total()]).toEqual([1, 2])
  a.showJournals = true
  expect(a.total()).toBe(3)
})

test('a failed refresh is a notice too', async () => {
  let fail = false
  const notices: Notice[] = []
  const a = new AllPages({
    run: () => (fail ? Promise.reject({ code: 'internal', message: 'boom' }) : Promise.resolve({ ...empty, table: [] })),
    notify: (n) => notices.push(n),
  })
  await a.open()
  fail = true
  a.refresh()
  await tick()
  expect(notices).toEqual([{ kind: 'refused', message: 'boom' }])
})

test('a page change from another program reloads the shown table; our own echo does not (§6)', async () => {
  const { a, sent } = setup()
  expect(a.changed(false)).toBe(false) // hidden: nothing happens, the other views take it
  expect(sent).toEqual([])
  await a.open()
  expect(a.changed(true)).toBe(true)
  await tick()
  expect(sent.length).toBe(1)
  expect(a.changed(false)).toBe(true)
  await tick()
  expect(sent).toEqual([{ type: 'pages.table' }, { type: 'pages.table' }])
})

test('sortBy returns true when the order changed: a new key, a reversal', async () => {
  const { a } = setup()
  await a.open()
  expect(a.sortBy('edited')).toBe(true)
  expect(a.sortBy('edited')).toBe(true)
  expect(a.sort).toEqual({ key: 'edited', dir: 'asc' })
  expect(a.sortBy('name')).toBe(true)
})
