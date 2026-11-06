import { expect, test, vi } from 'vitest'
import {
  dayIndex,
  dayOfBlock,
  everyMidnight,
  feedBlocks,
  feedRun,
  isNewDay,
  missingDays,
  msUntilNextDay,
  openFeed,
  pinRange,
  sameDay,
  withPages,
  type Feed,
} from './feed'
import type { BlockView, FeedView, PageView } from './types'

function b(id: number, depth: number, hasChildren = false): BlockView {
  return { id, depth, text: `t${id}`, html: '', state: null, finished: false, hasChildren }
}

function day(key: string, blocks: BlockView[] = []): PageView {
  return { key, name: key, kind: 'journal', title: key, preambleHtml: '', hasFile: true, blocks }
}

const jd = (key: string) => ({ key, title: key })
const view = (today: string, keys: string[]): FeedView => ({ today, days: keys.map(jd) })

function feedOf(keys: string[], loaded: PageView[] = [], today = keys[0]): Feed {
  return { today, days: keys.map(jd), loaded: Object.fromEntries(loaded.map((p) => [p.key, p])) }
}

test('openFeed keeps the loaded days still listed', () => {
  const prev = feedOf(['a', 'b'], [day('a'), day('b')])
  const f = openFeed(prev, view('a', ['a', 'c']))
  expect(Object.keys(f.loaded)).toEqual(['a'])
  expect(f.loaded.a).toBe(prev.loaded.a)
  expect(f.days.map((d) => d.key)).toEqual(['a', 'c'])
  expect(openFeed(null, view('a', ['a'])).loaded).toEqual({})
})

test('withPages ignores pages the feed does not list and keeps identity when nothing changed', () => {
  const f = feedOf(['a', 'b'])
  expect(withPages(f, [day('zzz')])).toBe(f)
  expect(withPages(f, [])).toBe(f)
  const a = day('a')
  const g = withPages(f, [a, day('zzz')])
  expect(g).not.toBe(f)
  expect(g.loaded).toEqual({ a })
  // The same page object again changes nothing.
  expect(withPages(g, [a])).toBe(g)
  // A fresh page for a loaded day replaces it.
  const a2 = day('a', [b(1, 0)])
  expect(withPages(g, [a2]).loaded.a).toBe(a2)
})

test('feedBlocks walks loaded days in feed order and hides folded children', () => {
  const f = feedOf(['t', 'y', 'u'], [day('y', [b(3, 0)]), day('t', [b(1, 0, true), b(2, 1)])])
  expect(feedBlocks(f, new Set()).map((x) => x.id)).toEqual([1, 2, 3])
  expect(feedBlocks(f, new Set([1])).map((x) => x.id)).toEqual([1, 3])
})

test('dayOfBlock', () => {
  const f = feedOf(['t', 'y'], [day('t', [b(1, 0)]), day('y', [b(3, 0)])])
  expect(dayOfBlock(f, 3)).toBe('y')
  expect(dayOfBlock(f, 99)).toBeNull()
})

test('missingDays lists rows neither loaded nor asked, clamped to the feed', () => {
  const f = feedOf(['d0', 'd1', 'd2', 'd3'], [day('d0')])
  expect(missingDays(f, 0, 9, new Set(['d2']))).toEqual(['d1', 'd3'])
  expect(missingDays(f, -3, 1, new Set())).toEqual(['d1'])
  expect(missingDays(f, 5, 9, new Set())).toEqual([])
})

test('isNewDay: an unlisted journal day up to today, never a page or a future day', () => {
  const f = feedOf(['2026-10-30', '2026-10-28'])
  expect(isNewDay(f, day('2026-10-29'))).toBe(true)
  expect(isNewDay(f, day('2026-10-28'))).toBe(false)
  expect(isNewDay(f, day('2026-10-31'))).toBe(false)
  expect(isNewDay(f, { ...day('x'), kind: 'page' })).toBe(false)
})

test('pinRange adds the pinned row in order, once', () => {
  expect(pinRange([3, 4, 5], 0)).toEqual([0, 3, 4, 5])
  expect(pinRange([3, 4, 5], 4)).toEqual([3, 4, 5])
  expect(pinRange([3, 4], 9)).toEqual([3, 4, 9])
  expect(pinRange([3, 4], null)).toEqual([3, 4])
})

test('msUntilNextDay', () => {
  expect(msUntilNextDay(new Date(2026, 9, 30, 23, 59, 0))).toBe(61_000)
  expect(msUntilNextDay(new Date(2026, 9, 30, 12, 0, 0))).toBe(12 * 3_600_000 + 1_000)
})

test('sameDay: two blocks of one loaded day; shift-click across days does not select', () => {
  const f = feedOf(['t', 'y'], [day('t', [b(1, 0), b(2, 0)]), day('y', [b(3, 0)])])
  expect(sameDay(f, 1, 2)).toBe(true)
  expect(sameDay(f, 1, 3)).toBe(false)
  expect(sameDay(f, 1, 99)).toBe(false)
  expect(sameDay(f, 98, 99)).toBe(false)
})

test('everyMidnight runs just after each local midnight and stops when told', () => {
  vi.useFakeTimers()
  try {
    vi.setSystemTime(new Date(2026, 9, 30, 23, 59, 0))
    const run = vi.fn()
    const stop = everyMidnight(run, () => new Date(), { set: setTimeout, clear: clearTimeout })
    vi.advanceTimersByTime(60_000)
    expect(run).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1_000)
    expect(run).toHaveBeenCalledTimes(1)
    // Re-armed for the next midnight.
    vi.advanceTimersByTime(24 * 3600_000)
    expect(run).toHaveBeenCalledTimes(2)
    stop()
    vi.advanceTimersByTime(48 * 3600_000)
    expect(run).toHaveBeenCalledTimes(2)
  } finally {
    vi.useRealTimers()
  }
})

test('everyMidnight calls its timers as plain functions, as a browser requires', () => {
  // A browser's setTimeout throws "Illegal invocation" when called as a method of another object.
  function set(this: unknown) {
    if (this !== undefined) throw new TypeError('Illegal invocation')
    return 1 as unknown as ReturnType<typeof setTimeout>
  }
  function clear(this: unknown) {
    if (this !== undefined) throw new TypeError('Illegal invocation')
  }
  everyMidnight(() => {}, undefined, { set, clear })()
})

test('feedRun stops at a day that is not loaded', () => {
  const pg = (key: string, ids: number[]): PageView => ({
    key,
    name: key,
    kind: 'journal',
    title: key,
    preambleHtml: '', hasFile: true,
    blocks: ids.map((id) => ({ id, depth: 0, text: '', html: '', state: null, finished: false, hasChildren: false })),
  })
  const days = ['d1', 'd2', 'd3'].map((key) => ({ key, title: key }))
  const feed: Feed = { today: 'd1', days, loaded: { d1: pg('d1', [1, 2]), d3: pg('d3', [5]) } }
  expect(feedRun(feed, new Set(), 2).map((b) => b.id)).toEqual([1, 2])
  expect(feedRun(feed, new Set(), 5).map((b) => b.id)).toEqual([5])
  expect(feedRun(feed, new Set(), 9)).toEqual([])
  const all: Feed = { ...feed, loaded: { ...feed.loaded, d2: pg('d2', [3]) } }
  expect(feedRun(all, new Set(), 5).map((b) => b.id)).toEqual([1, 2, 3, 5])
})

test('dayIndex finds a listed day', () => {
  const f = openFeed(null, {
    today: '2026-10-30',
    days: [
      { key: '2026-10-30', title: 't' },
      { key: '2026-03-12', title: 'm' },
    ],
  })
  expect(dayIndex(f, '2026-03-12')).toBe(1)
  expect(dayIndex(f, '2026-03-11')).toBe(-1)
})
