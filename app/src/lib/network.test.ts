import { expect, test } from 'vitest'
import { Network } from './network.svelte'
import { DEFAULT_FILTERS } from './graph'
import type { Command, GraphView, Notice, Output } from './types'

const empty: Output = {
  page: null, focus: null, notices: [], folder: null, config: null, refs: null, names: null, tree: null,
  changed: [], removed: [], dirty: null, feed: null, pages: [], board: null, table: null, search: null, renamed: [], git: null, usage: null, usageSkipped: null, graph: null, saved: [],
}
const view = (o: Partial<GraphView> = {}): GraphView => ({ nodes: [], links: [], ...o }) as unknown as GraphView

function setup(fail: 'none' | 'all' = 'none') {
  const sent: Command[] = []
  const notices: Notice[] = []
  const pending: Array<() => void> = []
  let hold = false
  const n = new Network({
    run: (cmd) => {
      sent.push(cmd)
      if (fail === 'all') return Promise.reject({ code: 'internal', message: 'boom' })
      if (!hold) return Promise.resolve(empty)
      return new Promise((res) => pending.push(() => res(empty)))
    },
    notify: (x) => notices.push(x),
  })
  return { n, sent, notices, pending, hold: () => (hold = true) }
}
const tick = () => new Promise((r) => setTimeout(r, 0))

test('open runs graph.get and shows the answer', async () => {
  const { n, sent } = setup()
  await n.open()
  expect(n.shown).toBe(true)
  expect(sent).toEqual([{ type: 'graph.get' }])
  const v = view()
  n.applyGraph(v)
  expect(n.view).toBe(v)
})

test('an answer after close is dropped', async () => {
  const { n } = setup()
  await n.open()
  n.close()
  n.applyGraph(view())
  expect(n.view).toBeNull()
  expect(n.shown).toBe(false)
})

test('close keeps the filters; newFolder resets them', async () => {
  const { n } = setup()
  await n.open()
  n.setFilters({ hideJournals: false, hideTagOnly: true })
  n.close()
  expect(n.filters).toEqual({ hideJournals: false, hideTagOnly: true, limit: null })
  n.newFolder()
  expect(n.shown).toBe(false)
  expect(n.filters).toEqual(DEFAULT_FILTERS)
})

test('newFolder leaves DEFAULT_FILTERS itself unchanged after setFilters', () => {
  const { n } = setup()
  n.setFilters({ hideJournals: false })
  n.newFolder()
  expect(DEFAULT_FILTERS).toEqual({ hideJournals: true, hideTagOnly: false, limit: null })
  expect(n.filters).not.toBe(DEFAULT_FILTERS)
})

test('a vanished limit resets to everything', async () => {
  const { n } = setup()
  await n.open()
  n.setFilters({ limit: { kind: 'folder', folder: 'Gone' } })
  n.applyGraph(view())
  expect(n.filters.limit).toBeNull()
})

test('changed refreshes for news, not for own echoes, and only while shown', async () => {
  const { n, sent } = setup()
  expect(n.changed(false)).toBe(false)
  expect(sent.length).toBe(0)
  await n.open()
  expect(n.changed(true)).toBe(true)
  await tick()
  expect(sent.length).toBe(1)
  expect(n.changed(false)).toBe(true)
  await tick()
  expect(sent.length).toBe(2)
})

test('refresh coalesces: one in flight, one pending', async () => {
  const { n, sent, pending, hold } = setup()
  await n.open()
  hold()
  n.refresh()
  n.refresh()
  n.refresh()
  expect(sent.length).toBe(2)
  pending.shift()!()
  await tick()
  expect(sent.length).toBe(3)
  pending.shift()!()
  await tick()
  expect(sent.length).toBe(3)
})

test('a failed graph.get is a refused notice; a failed save is not', async () => {
  const { n, notices, sent } = setup('all')
  await n.open()
  expect(notices).toEqual([{ kind: 'refused', message: expect.any(String) }])
  const orig = console.error
  console.error = () => {}
  try {
    n.saveLayout([{ key: 'a', x: 1, y: 2 }] as never)
    await tick()
  } finally {
    console.error = orig
  }
  expect(sent.at(-1)?.type).toBe('graph.saveLayout')
  expect(notices.length).toBe(1)
})
