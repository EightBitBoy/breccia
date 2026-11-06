// The journal feed: the days listed by the core and the pages loaded for them so
// far. Pure functions; `Journal` (journal.svelte.ts) holds the state.
import { visible } from './tree'
import type { BlockId, BlockView, FeedView, JournalDay, PageView } from './types'

export interface Feed {
  today: string
  /** Newest first, as the core listed them. */
  days: JournalDay[]
  /** Day pages loaded so far, by key. */
  loaded: Record<string, PageView>
}

/** A feed from a `journal.feed` answer; days still listed keep their loaded page. */
export function openFeed(prev: Feed | null, view: FeedView): Feed {
  const loaded: Record<string, PageView> = {}
  for (const d of view.days) {
    const p = prev?.loaded[d.key]
    if (p) loaded[d.key] = p
  }
  return { today: view.today, days: view.days, loaded }
}

/** `feed` with these pages loaded; pages of days it does not list are ignored. Same object if nothing changed. */
export function withPages(feed: Feed, pages: PageView[]): Feed {
  const listed = new Set(feed.days.map((d) => d.key))
  const fresh = pages.filter((p) => listed.has(p.key) && feed.loaded[p.key] !== p)
  if (fresh.length === 0) return feed
  const loaded = { ...feed.loaded }
  for (const p of fresh) loaded[p.key] = p
  return { ...feed, loaded }
}

/** The row of day `key` in the feed, or -1 when the feed does not list it. */
export function dayIndex(feed: Feed, key: string): number {
  return feed.days.findIndex((d) => d.key === key)
}

/** The visible blocks of the loaded days, in feed order (the editor's `blocks()`). */
export function feedBlocks(feed: Feed, folded: ReadonlySet<number>): BlockView[] {
  return feed.days.flatMap((d) => {
    const p = feed.loaded[d.key]
    return p ? visible(p.blocks, folded) : []
  })
}

/**
 * The visible blocks of the longest run of consecutive loaded days that contains `id`'s day, in
 * feed order; `[]` if `id` is in no loaded day. Up/down walk this, so they stop at an unloaded day.
 */
export function feedRun(feed: Feed, folded: ReadonlySet<number>, id: BlockId): BlockView[] {
  const day = dayOfBlock(feed, id)
  if (day === null) return []
  const at = feed.days.findIndex((d) => d.key === day)
  let from = at
  let to = at
  while (from > 0 && feed.days[from - 1].key in feed.loaded) from--
  while (to < feed.days.length - 1 && feed.days[to + 1].key in feed.loaded) to++
  return feed.days.slice(from, to + 1).flatMap((d) => visible(feed.loaded[d.key].blocks, folded))
}

export function dayOfBlock(feed: Feed, id: BlockId): string | null {
  for (const d of feed.days) {
    if (feed.loaded[d.key]?.blocks.some((b) => b.id === id)) return d.key
  }
  return null
}

/** Keys of the days in rows `from..=to` (clamped) that are neither loaded nor in `asked`. */
export function missingDays(feed: Feed, from: number, to: number, asked: ReadonlySet<string>): string[] {
  const out: string[] = []
  for (let i = Math.max(0, from); i <= Math.min(to, feed.days.length - 1); i++) {
    const key = feed.days[i].key
    if (!(key in feed.loaded) && !asked.has(key)) out.push(key)
  }
  return out
}

/** Whether `p` is a journal day up to today that the feed does not list. */
export function isNewDay(feed: Feed, p: PageView): boolean {
  // Journal keys are ISO dates, which sort as text.
  return p.kind === 'journal' && p.key <= feed.today && !feed.days.some((d) => d.key === p.key)
}

/** The rows to render: `indexes` plus `pin` (the day being edited), sorted, once. */
export function pinRange(indexes: number[], pin: number | null): number[] {
  if (pin === null || indexes.includes(pin)) return indexes
  return [...indexes, pin].sort((a, b) => a - b)
}

/** Milliseconds from `now` to one second after the next local midnight. */
export function msUntilNextDay(now: Date): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1)
  return next.getTime() - now.getTime()
}

/** Whether blocks `a` and `b` are both in one loaded day (multi-select stays within a day). */
export function sameDay(feed: Feed, a: BlockId, b: BlockId): boolean {
  const day = dayOfBlock(feed, a)
  return day !== null && day === dayOfBlock(feed, b)
}

export interface Timers {
  set(run: () => void, ms: number): ReturnType<typeof setTimeout>
  clear(t: ReturnType<typeof setTimeout>): void
}

/**
 * Runs `run` just after every local midnight (as told by `now`); the returned function stops it.
 * The timers are called as plain functions: a browser's setTimeout throws "Illegal invocation" as a method of another object.
 */
export function everyMidnight(
  run: () => void,
  now: () => Date = () => new Date(),
  timers: Timers = { set: setTimeout, clear: clearTimeout },
): () => void {
  const { set, clear } = timers
  let t: ReturnType<typeof setTimeout>
  const arm = () => {
    t = set(() => {
      run()
      arm()
    }, msUntilNextDay(now()))
  }
  arm()
  return () => clear(t)
}
