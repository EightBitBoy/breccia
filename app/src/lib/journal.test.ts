import { expect, test } from 'vitest'
import { Journal } from './journal.svelte'
import type { Command, FeedView, Notice, Output, PageView } from './types'

const empty: Output = {
  page: null,
  focus: null,
  notices: [],
  folder: null,
  config: null,
  refs: null,
  names: null,
  tree: null,
  changed: [],
  removed: [],
  dirty: null,
  feed: null,
  pages: [],
  board: null, table: null, search: null, renamed: [], git: null, usage: null, usageSkipped: null, graph: null, saved: [],
}

const page = (key: string): PageView => ({
  key,
  name: key,
  kind: 'journal',
  title: key,
  preambleHtml: '', hasFile: true,
  blocks: [],
})

const keys = ['2026-10-30', '2026-10-28', '2026-10-27', '2026-10-26', '2026-10-25']
const view: FeedView = { today: keys[0], days: keys.map((key) => ({ key, title: key })) }
const tick = () => new Promise((r) => setTimeout(r, 0))

function setup(fail: (cmd: Command) => boolean = () => false) {
  const sent: Command[] = []
  const notices: Notice[] = []
  const j = new Journal({
    run: async (cmd) => {
      sent.push(cmd)
      if (fail(cmd)) throw { code: 'internal', message: 'boom' }
      return empty
    },
    notify: (n) => notices.push(n),
  })
  const types = () => sent.map((c) => c.type)
  return { j, sent, notices, types }
}

async function shown() {
  const s = setup()
  await s.j.open()
  s.j.applyFeed(view)
  s.sent.length = 0
  return s
}

test('open asks for the feed and its answer shows it', async () => {
  const { j, sent } = setup()
  await j.open()
  expect(sent).toEqual([{ type: 'journal.feed' }])
  expect(j.applyFeed(view)).toBe(true)
  expect(j.feed?.today).toBe(keys[0])
  expect(j.loaded()).toEqual(new Set())
})

test('a feed answer nobody asked for is ignored while a page is shown', () => {
  const { j } = setup()
  expect(j.applyFeed(view)).toBe(false)
  expect(j.feed).toBeNull()
})

test('want loads the missing days once, with one pages.get', async () => {
  const { j, sent } = await shown()
  j.want(0, 2)
  expect(sent).toEqual([{ type: 'pages.get', keys: keys.slice(0, 3) }])
  j.want(1, 3)
  expect(sent[1]).toEqual({ type: 'pages.get', keys: [keys[3]] })
  j.want(0, 3)
  expect(sent).toHaveLength(2)
  // Loaded days are not asked again either.
  j.applyPages([page(keys[4])])
  j.want(4, 4)
  expect(sent).toHaveLength(2)
})

test('a failed pages.get is shown and asked again', async () => {
  const { j, sent, notices } = setup((c) => c.type === 'pages.get')
  await j.open()
  j.applyFeed(view)
  j.want(0, 0)
  await tick()
  expect(notices).toHaveLength(1)
  expect(notices[0].kind).toBe('refused')
  j.want(0, 0)
  expect(sent.filter((c) => c.type === 'pages.get')).toEqual([
    { type: 'pages.get', keys: [keys[0]] },
    { type: 'pages.get', keys: [keys[0]] },
  ])
})

test('changed reloads the feed for a new day only; removed for a listed day only', async () => {
  const { j, types } = await shown()
  j.changed(page('2026-10-29'))
  expect(types()).toEqual(['journal.feed'])
  await tick()
  j.changed(page(keys[1]))
  j.removed(['x'])
  expect(types()).toEqual(['journal.feed'])
  j.removed([keys[1]])
  expect(types()).toEqual(['journal.feed', 'journal.feed'])
})

test('close drops the feed and loaded() is null', async () => {
  const { j, types } = await shown()
  j.applyPages([page(keys[0])])
  expect(j.loaded()).toEqual(new Set([keys[0]]))
  j.close()
  expect(j.feed).toBeNull()
  expect(j.loaded()).toBeNull()
  expect(j.applyFeed(view)).toBe(false)
  // With no feed shown, nothing reloads or loads.
  j.changed(page('2026-10-29'))
  j.removed([keys[0]])
  j.want(0, 1)
  j.refresh()
  expect(types()).toEqual([])
})

test('a feed answer that inserts a day inside the last range loads it with one pages.get', async () => {
  const { j, sent } = await shown()
  j.want(0, 2)
  j.applyPages(keys.slice(0, 3).map(page))
  sent.length = 0
  const inserted = [keys[0], '2026-10-29', ...keys.slice(1)]
  j.applyFeed({ today: keys[0], days: inserted.map((key) => ({ key, title: key })) })
  expect(sent).toEqual([{ type: 'pages.get', keys: ['2026-10-29'] }])
})

test('a day loaded, dropped by a reload and listed again is asked again', async () => {
  const { j, sent } = await shown()
  j.want(0, 0)
  j.applyPages([page(keys[0])])
  const without = keys.slice(1)
  j.applyFeed({ today: keys[1], days: without.map((key) => ({ key, title: key })) })
  j.applyPages([page(keys[1])])
  sent.length = 0
  j.applyFeed(view)
  expect(sent).toEqual([{ type: 'pages.get', keys: [keys[0]] }])
})

test('a failed open notifies and leaves the feed unwanted when none is shown', async () => {
  const { j, notices } = setup((c) => c.type === 'journal.feed')
  await j.open()
  expect(notices).toHaveLength(1)
  expect(notices[0].kind).toBe('refused')
  expect(j.applyFeed(view)).toBe(false)
  expect(j.feed).toBeNull()
})

test('a journal.feed answer arriving after close is ignored', async () => {
  const { j } = setup()
  await j.open()
  j.close()
  expect(j.applyFeed(view)).toBe(false)
  expect(j.feed).toBeNull()
})

test('openAt runs journal.feed and sets the target', async () => {
  const { j, types } = setup()
  await j.openAt('2026-10-26')
  expect(types()).toEqual(['journal.feed'])
  expect(j.target).toBe('2026-10-26')
})

test('targetReached clears the target', async () => {
  const { j } = setup()
  await j.openAt('2026-10-26')
  j.targetReached()
  expect(j.target).toBeNull()
})

test('close clears the target', async () => {
  const { j } = setup()
  await j.openAt('2026-10-26')
  j.close()
  expect(j.target).toBeNull()
})

test('openAt after a failed open sets no target', async () => {
  const { j } = setup((c) => c.type === 'journal.feed')
  await j.openAt('2026-10-26')
  expect(j.target).toBeNull()
})

test('the feed remembers the day it was opened at, apart from the day it scrolls to', async () => {
  const { j } = setup()
  await j.openAt('2026-10-27')
  expect(j.at).toBe('2026-10-27')
  expect(j.target).toBe('2026-10-27')
  await j.open()
  expect(j.at).toBeNull()
  await j.openAt('2026-10-25', null)
  expect(j.target).toBe('2026-10-25')
  expect(j.at).toBeNull()
  await j.openAt('2026-10-26', '2026-10-27')
  expect(j.at).toBe('2026-10-27')
  j.close()
  expect(j.at).toBeNull()
  const failing = setup(() => true)
  await failing.j.openAt('2026-10-27')
  expect(failing.j.at).toBeNull()
})
