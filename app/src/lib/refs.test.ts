import { expect, test } from 'vitest'
import { RefsRefresh, pageChanged, pageOfBlock, patchRefs, refBlocks, type PageChangedHost } from './refs'
import { countsInFlight } from './sync'
import type { BlockView, PageView, RefsView } from './types'

function b(id: number, depth: number, hasChildren = false): BlockView {
  return { id, depth, text: `t${id}`, html: '', state: null, finished: false, hasChildren }
}

function pageOf(key: string, blocks: BlockView[]): PageView {
  return { key, name: key, kind: 'page', title: key, preambleHtml: '', hasFile: true, blocks }
}

/** Refs to 'a': group 'p' (root 7) and group 'j' (root 5). */
function refs(): RefsView {
  return {
    key: 'a',
    count: 2,
    groups: [
      { page: 'p', title: 'P', kind: 'page', refs: [{ crumbs: [], blocks: [b(7, 0)] }] },
      { page: 'j', title: 'J', kind: 'journal', refs: [{ crumbs: ['t4'], blocks: [b(5, 0)] }] },
    ],
  }
}

test('patchRefs takes the fresh subtree with relative depths', () => {
  const j = pageOf('j', [b(4, 0, true), b(5, 1, true), b(9, 2), b(6, 1)])
  const out = patchRefs(refs(), j)
  const g = out.groups.find((g) => g.page === 'j')!
  expect(g.refs[0].blocks.map((x) => x.id)).toEqual([5, 9])
  expect(g.refs[0].blocks.map((x) => x.depth)).toEqual([0, 1])
  expect(g.refs[0].crumbs).toEqual(['t4'])
  expect(out.count).toBe(2)
})

test('patchRefs drops a ref whose root is gone and the empty group', () => {
  const r = refs()
  r.groups = [r.groups[1]]
  r.count = 1
  const out = patchRefs(r, pageOf('j', [b(4, 0), b(6, 0)]))
  expect(out.groups).toEqual([])
  expect(out.count).toBe(0)
})

test('patchRefs leaves other groups alone', () => {
  const r = refs()
  const out = patchRefs(r, pageOf('j', [b(5, 0)]))
  expect(out.groups[0]).toBe(r.groups[0])
  expect(patchRefs(r, pageOf('zzz', [b(5, 0)]))).toBe(r)
})

test('patchRefs drops a ref whose root moved inside another ref', () => {
  const r: RefsView = {
    key: 'a',
    count: 2,
    groups: [
      {
        page: 'j',
        title: 'J',
        kind: 'journal',
        refs: [
          { crumbs: [], blocks: [b(1, 0)] },
          { crumbs: [], blocks: [b(2, 0)] },
        ],
      },
    ],
  }
  const out = patchRefs(r, pageOf('j', [b(1, 0, true), b(2, 1)]))
  expect(out.groups[0].refs.map((x) => x.blocks.map((y) => y.id))).toEqual([[1, 2]])
  expect(out.count).toBe(1)
})

test('refBlocks hides folded descendants', () => {
  const r = patchRefs(refs(), pageOf('j', [b(4, 0, true), b(5, 1, true), b(9, 2), b(6, 1)]))
  expect(refBlocks(r, new Set()).map((x) => x.id)).toEqual([7, 5, 9])
  expect(refBlocks(r, new Set([5])).map((x) => x.id)).toEqual([7, 5])
})

test('pageOfBlock finds outline and ref blocks', () => {
  const r = patchRefs(refs(), pageOf('j', [b(4, 0, true), b(5, 1, true), b(9, 2)]))
  const a = pageOf('a', [b(1, 0)])
  expect(pageOfBlock(a, r, 1)).toBe('a')
  expect(pageOfBlock(a, r, 9)).toBe('j')
  expect(pageOfBlock(a, r, 7)).toBe('p')
  expect(pageOfBlock(a, r, 77)).toBeNull()
  expect(pageOfBlock(null, null, 1)).toBeNull()
})

/** A refresh whose runs finish when the test says so. */
function refresh(key: string | null = 'a') {
  const runs: { key: string; done: () => void }[] = []
  const state = { busy: false, key }
  const r = new RefsRefresh({
    key: () => state.key,
    busy: () => state.busy,
    run: (k) => new Promise<void>((done) => runs.push({ key: k, done })),
  })
  return { r, runs, state }
}

test('RefsRefresh keeps at most one run pending', async () => {
  const { r, runs } = refresh()
  r.request()
  r.request()
  r.request()
  expect(runs.length).toBe(1)
  runs[0].done()
  await Promise.resolve()
  await Promise.resolve()
  expect(runs.length).toBe(2)
  runs[1].done()
  await Promise.resolve()
  await Promise.resolve()
  expect(runs.length).toBe(2)
})

test('RefsRefresh waits while busy and runs once the editor leaves', () => {
  const { r, runs, state } = refresh()
  state.busy = true
  r.request()
  r.request()
  expect(runs.length).toBe(0)
  r.pump()
  expect(runs.length).toBe(0)
  state.busy = false
  r.pump()
  expect(runs.map((x) => x.key)).toEqual(['a'])
  r.pump()
  expect(runs.length).toBe(1)
})

test('RefsRefresh does nothing without a page', () => {
  const { r, runs } = refresh(null)
  r.request()
  expect(runs.length).toBe(0)
})

test('patchRefs shows blocks made right after a root while editing there', () => {
  // Enter at the end of the childless root 5 made block 10, then Enter in 10 made 11 (with a child 12).
  const j = pageOf('j', [b(4, 0, true), b(5, 1), b(10, 1), b(11, 1, true), b(12, 2), b(6, 1)])
  const shown = patchRefs(refs(), j, new Set([10, 11]))
  const g = shown.groups.find((g) => g.page === 'j')!
  expect(g.refs[0].blocks.map((x) => x.id)).toEqual([5, 10, 11, 12])
  expect(g.refs[0].blocks.map((x) => x.depth)).toEqual([0, 0, 0, 1])
  expect(refBlocks(shown, new Set()).map((x) => x.id)).toEqual([7, 5, 10, 11, 12])
  expect(pageOfBlock(null, shown, 10)).toBe('j')
  // Only an unbroken run of them right after the root.
  const apart = pageOf('j', [b(4, 0, true), b(5, 1), b(6, 1), b(10, 1)])
  expect(patchRefs(refs(), apart, new Set([10])).groups[1].refs[0].blocks.map((x) => x.id)).toEqual([5])
  // Without them kept (the references reloaded), the root's subtree alone.
  expect(patchRefs(refs(), j).groups[1].refs[0].blocks.map((x) => x.id)).toEqual([5])
})

function changedHost(over: Partial<PageChangedHost> = {}) {
  const log: string[] = []
  const h: PageChangedHost = {
    shows: (k) => k === 'a',
    active: () => true,
    own: () => false,
    isGroup: (k) => k === 'p',
    reload: (k) => log.push(`reload ${k}`),
    patch: (p) => log.push(`patch ${p.key}`),
    refresh: () => log.push('refresh'),
    reconcile: () => log.push('reconcile'),
    ...over,
  }
  return { h, log }
}

test('a change to the shown page queues a reload of it instead of showing the event', () => {
  const { h, log } = changedHost()
  pageChanged(h, pageOf('a', []))
  expect(log).toEqual(['reload a'])
})

test('a change to a references group patches it; any other page reloads the references', () => {
  const { h, log } = changedHost()
  pageChanged(h, pageOf('p', []))
  pageChanged(h, pageOf('x', []))
  expect(log).toEqual(['patch p', 'reconcile', 'refresh', 'refresh'])
})

test('our own echoes and events without a shown page change nothing', () => {
  const own = changedHost({ own: () => true })
  pageChanged(own.h, pageOf('a', []))
  const none = changedHost({ active: () => false, shows: () => false })
  pageChanged(none.h, pageOf('a', []))
  expect([...own.log, ...none.log]).toEqual([])
})

test('a refs reload started by one event never hides the next event for the shown page', () => {
  // One watcher batch: another page's event, then the shown page's, back to back.
  const { h, log } = changedHost({ isGroup: () => false })
  expect(countsInFlight('page.refs')).toBe(false)
  pageChanged(h, pageOf('other', []))
  pageChanged(h, pageOf('a', []))
  expect(log).toEqual(['refresh', 'reload a'])
})

test('pageChanged reloads a loaded feed day', () => {
  const { h, log } = changedHost({ shows: (k) => k === 'd1' })
  pageChanged(h, pageOf('d1', []))
  expect(log).toEqual(['reload d1'])
  const own = changedHost({ shows: (k) => k === 'd1', own: () => true })
  pageChanged(own.h, pageOf('d1', []))
  expect(own.log).toEqual([])
})
