import { describe, expect, it } from 'vitest'
import { PAGE_SIZE, formatWhen, formatWhenFull, historyItem, historyStale } from './gitLog'
import { GitLog } from './gitLog.svelte'
import type { GitLogView, GitView, LogEntry, Output } from './types'

const v = (o: Partial<GitView> = {}): GitView => ({
  state: 'ready', top: 'C:/notes', remote: null, ahead: 0, lastCommit: null, lastSync: null, head: 'h1', problem: null, ...o,
})

const entry = (n: number, pushed = true): LogEntry => ({
  hash: `${n}`.padStart(40, '0'), short: `${n}`.padStart(7, '0'), timeMs: n * 1000, author: 'A', subject: `c${n}`, pushed,
})

/** `count` entries numbered from `from` down. */
const run = (from: number, count: number) => Array.from({ length: Math.max(0, count) }, (_, i) => entry(from - i))

const answer = (page: GitLogView): Output => ({ gitLog: page }) as unknown as Output

/** A fake shell over a history of `total` commits, newest first, numbered total..1; answers when `release` is called. */
function shell(total: number) {
  const calls: { skip: number; limit: number; resolve: () => void; reject: (e: unknown) => void }[] = []
  const state = { total }
  const log = (skip: number, limit: number) =>
    new Promise<Output>((res, rej) => {
      calls.push({
        skip,
        limit,
        resolve: () => {
          const all = run(state.total, state.total)
          res(answer({ entries: all.slice(skip, skip + limit), more: skip + limit < all.length, skip }))
        },
        reject: rej,
      })
    })
  return { calls, state, log }
}

const settle = () => new Promise((r) => setTimeout(r, 0))
const subjects = (g: GitLog) => g.entries?.map((e) => e.subject)

describe('formatWhen', () => {
  it('is the local day, month, year and time', () => {
    const ms = new Date(2026, 10, 3, 14, 5, 9).getTime()
    expect(formatWhen(ms)).toBe('3 Nov 2026 14:05')
    expect(formatWhen(new Date(2026, 0, 9, 7, 3).getTime())).toBe('9 Jan 2026 07:03')
  })
  it('the tooltip has the weekday, the full month and the seconds', () => {
    const ms = new Date(2026, 10, 3, 14, 5, 9).getTime()
    expect(formatWhenFull(ms)).toBe('Tuesday, 3 November 2026, 14:05:09')
  })
})

describe('historyItem', () => {
  it('shows right of the Git item only while the folder is in a repository', () => {
    const item = historyItem(v(), false)!
    expect(item).toMatchObject({ id: 'gitLog', side: 'right', action: true, tip: 'Git history', icon: 'history', pressed: false })
    expect(item.order).toBeGreaterThan(10)
    for (const state of ['off', 'noGit', 'notRepo'] as const) expect(historyItem(v({ state, top: null }), false)).toBeNull()
    expect(historyItem(v({ state: 'problem', top: null }), false)).toBeNull()
    expect(historyItem(v({ state: 'off' }), false)).toBeNull()
    expect(historyItem(null, false)).toBeNull()
    expect(historyItem(v({ state: 'working' }), false)).not.toBeNull()
    expect(historyItem(v({ state: 'problem' }), false)).not.toBeNull()
  })
  it('is pressed while the view is open', () => {
    expect(historyItem(v(), true)?.pressed).toBe(true)
  })
})

describe('historyStale', () => {
  it('a new head, a push (ahead) or another remote reloads the view', () => {
    expect(historyStale(v(), v())).toBe(false)
    expect(historyStale(v(), v({ lastSync: 5 }))).toBe(false)
    expect(historyStale(v(), v({ head: 'h2' }))).toBe(true)
    expect(historyStale(v({ ahead: 2 }), v({ ahead: 0 }))).toBe(true)
    expect(historyStale(v(), v({ remote: 'origin' }))).toBe(true)
    expect(historyStale(null, v())).toBe(true)
  })
})

describe('GitLog', () => {
  it('open shows the newest page; close forgets it', async () => {
    const s = shell(3)
    const g = new GitLog({ log: s.log })
    const opened = g.open()
    expect(g.shown).toBe(true)
    expect(g.entries).toBeNull()
    expect(s.calls.map((c) => [c.skip, c.limit])).toEqual([[0, PAGE_SIZE]])
    s.calls[0].resolve()
    await opened
    expect(subjects(g)).toEqual(['c3', 'c2', 'c1'])
    expect(g.more).toBe(false)
    g.close()
    expect([g.shown, g.entries, g.more, g.error]).toEqual([false, null, false, null])
  })

  it('an answer that comes after close is dropped', async () => {
    const s = shell(3)
    const g = new GitLog({ log: s.log })
    const opened = g.open()
    g.close()
    s.calls[0].resolve()
    await opened
    expect(g.entries).toBeNull()
  })

  it('Show more appends the next page', async () => {
    const s = shell(PAGE_SIZE + 5)
    const g = new GitLog({ log: s.log })
    const opened = g.open()
    s.calls[0].resolve()
    await opened
    expect(g.entries?.length).toBe(PAGE_SIZE)
    expect(g.more).toBe(true)
    const more = g.showMore()
    expect(g.loadingMore).toBe(true)
    // A second click while it loads asks for nothing more.
    void g.showMore()
    expect(s.calls.map((c) => [c.skip, c.limit])).toEqual([[0, PAGE_SIZE], [PAGE_SIZE, PAGE_SIZE]])
    s.calls[1].resolve()
    await more
    expect(g.entries?.length).toBe(PAGE_SIZE + 5)
    expect(subjects(g)!.slice(-2)).toEqual(['c2', 'c1'])
    expect([g.more, g.loadingMore]).toEqual([false, false])
    // Nothing more to show: no request.
    await g.showMore()
    expect(s.calls.length).toBe(2)
  })

  it('refresh puts a new commit at the top and keeps the rows already shown', async () => {
    const s = shell(PAGE_SIZE + 50)
    const g = new GitLog({ log: s.log })
    const opened = g.open()
    s.calls[0].resolve()
    await opened
    const more = g.showMore()
    s.calls[1].resolve()
    await more
    expect(g.entries?.length).toBe(PAGE_SIZE + 50)
    s.state.total += 1
    g.refresh()
    expect([s.calls[2].skip, s.calls[2].limit]).toEqual([0, PAGE_SIZE + 50])
    s.calls[2].resolve()
    await settle()
    expect(g.entries?.[0].subject).toBe(`c${PAGE_SIZE + 51}`)
    expect(g.entries?.length).toBe(PAGE_SIZE + 50)
    expect(g.more).toBe(true)
  })

  it('refresh does nothing while the view is closed', () => {
    const s = shell(1)
    const g = new GitLog({ log: s.log })
    g.refresh()
    expect(s.calls.length).toBe(0)
  })

  it('a Show more answer that a refresh overtook is dropped: no row twice, none lost', async () => {
    const s = shell(PAGE_SIZE + 10)
    const g = new GitLog({ log: s.log })
    const opened = g.open()
    s.calls[0].resolve()
    await opened
    const more = g.showMore() // skip PAGE_SIZE, under the old history
    s.state.total += 1 // a commit lands
    g.refresh()
    expect(g.loadingMore).toBe(false)
    s.calls[1].resolve() // the old Show more answer comes late
    await more
    expect(g.entries?.length).toBe(PAGE_SIZE)
    s.calls[2].resolve()
    await settle()
    expect(g.entries?.[0].subject).toBe(`c${PAGE_SIZE + 11}`)
    const again = g.showMore()
    s.calls[3].resolve()
    await again
    const hashes = g.entries!.map((e) => e.hash)
    expect(new Set(hashes).size).toBe(hashes.length)
    expect(hashes.length).toBe(PAGE_SIZE + 11)
  })

  it('Show more waits while a refresh is on its way', async () => {
    const s = shell(PAGE_SIZE + 10)
    const g = new GitLog({ log: s.log })
    const opened = g.open()
    s.calls[0].resolve()
    await opened
    g.refresh()
    await g.showMore()
    expect(s.calls.length).toBe(2)
  })

  it('of two refreshes the later answer wins, whatever order they come in', async () => {
    const s = shell(2)
    const g = new GitLog({ log: s.log })
    const opened = g.open()
    s.calls[0].resolve()
    await opened
    s.state.total = 3
    g.refresh()
    s.state.total = 4
    g.refresh()
    s.calls[2].resolve() // state.total is 4 for both answers; resolve the newer first
    await settle()
    s.state.total = 3
    s.calls[1].resolve()
    await settle()
    expect(subjects(g)?.[0]).toBe('c4')
  })

  it('a failed load shows its message; a later answer clears it', async () => {
    const s = shell(1)
    const g = new GitLog({ log: s.log })
    const opened = g.open()
    s.calls[0].reject({ code: 'git', message: 'The notes folder is not in a Git repository.' })
    await opened
    expect(g.error).toBe('The notes folder is not in a Git repository.')
    expect(g.entries).toBeNull()
    g.refresh()
    s.calls[1].resolve()
    await settle()
    expect(g.error).toBeNull()
    expect(subjects(g)).toEqual(['c1'])
  })

  it('a failed Show more keeps the rows and lets the user try again', async () => {
    const s = shell(PAGE_SIZE + 1)
    const g = new GitLog({ log: s.log })
    const opened = g.open()
    s.calls[0].resolve()
    await opened
    const more = g.showMore()
    s.calls[1].reject({ code: 'git', message: 'boom' })
    await more
    expect(g.entries?.length).toBe(PAGE_SIZE)
    expect([g.more, g.loadingMore, g.error]).toEqual([true, false, 'boom'])
  })

  it('no commits yet: an empty list, not null', async () => {
    const s = shell(0)
    const g = new GitLog({ log: s.log })
    const opened = g.open()
    s.calls[0].resolve()
    await opened
    expect(g.entries).toEqual([])
  })
})
