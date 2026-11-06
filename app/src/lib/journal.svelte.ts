// The state of the journal feed: which days are listed and loaded, and the
// commands that keep it up to date.
import { errorMessage } from '../api'
import { Refreshes } from './external'
import { isNewDay, missingDays, openFeed, withPages, type Feed } from './feed'
import type { Command, FeedView, Notice, Output, PageView } from './types'

export interface JournalEnv {
  /** Queues a command; its output reaches App.apply, which hands the feed parts back. */
  run(cmd: Command): Promise<Output>
  notify(n: Notice): void
}

export class Journal {
  feed = $state<Feed | null>(null)
  /** The day the feed should scroll to once (jump to a date), or null. */
  target = $state<string | null>(null)
  /** The feed was asked for and its answer is awaited (or it is shown). */
  private wanted = false
  /** Days a `pages.get` was sent for. */
  private asked = new Set<string>()
  /** The rows of the last `want`; a feed answer loads what it puts there. */
  private range: [number, number] | null = null
  private reloads: Refreshes

  constructor(private env: JournalEnv) {
    this.reloads = new Refreshes(() => this.env.run({ type: 'journal.feed' }))
  }

  /** The day the feed was last opened at (`openAt`), null for the plain journal: its place in the history. */
  at = $state<string | null>(null)

  /** The user asked for the feed (sidebar, startup, home): runs `journal.feed`. */
  open(): Promise<void> {
    return this.load(null)
  }

  /**
   * The feed, scrolled to day `scrollTo` once it lists it (`targetReached`). `at` is the day it counts as opened at;
   * a restore by Back scrolls to the day that was at the top but keeps the place it had.
   */
  async openAt(scrollTo: string, at: string | null = scrollTo): Promise<void> {
    await this.load(at)
    if (this.wanted) this.target = scrollTo // not after a failed open with no feed shown
  }

  /** `at` is set before the answer arrives, so the feed never shows with the wrong one. */
  private async load(at: string | null): Promise<void> {
    this.wanted = true
    this.at = at
    this.asked.clear()
    try {
      await this.env.run({ type: 'journal.feed' })
    } catch (e) {
      this.wanted = this.feed !== null
      if (!this.wanted) this.at = null
      this.env.notify({ kind: 'refused', message: errorMessage(e) })
    }
  }

  /** The feed scrolled to the target (or gave up on it). */
  targetReached(): void {
    this.target = null
  }

  /** A page is shown instead: the feed and what it loaded go. */
  close(): void {
    this.wanted = false
    this.target = null
    this.at = null
    this.feed = null
    this.asked.clear()
    this.range = null
  }

  /**
   * A `journal.feed` answer: applied only while the feed is shown or was asked for. Returns whether it is shown.
   * Days it no longer lists are forgotten, and days it puts inside the last range are loaded: the rows on screen
   * keep their indexes, so the feed view reports no new range for them.
   */
  applyFeed(view: FeedView): boolean {
    if (!this.wanted && this.feed === null) return false
    this.wanted = true
    this.feed = openFeed(this.feed, view)
    const listed = new Set(view.days.map((d) => d.key))
    for (const k of this.asked) if (!listed.has(k)) this.asked.delete(k)
    if (this.range) this.want(...this.range)
    return true
  }

  applyPages(pages: PageView[]): void {
    if (this.feed) this.feed = withPages(this.feed, pages)
  }

  /** Rows `from..=to` are on screen or near: loads the missing days with one `pages.get`. A failure is shown and they are asked again later. */
  want(from: number, to: number): void {
    this.range = [from, to]
    if (!this.feed) return
    const keys = missingDays(this.feed, from, to, this.asked)
    if (keys.length === 0) return
    for (const k of keys) this.asked.add(k)
    this.env.run({ type: 'pages.get', keys }).catch((e) => {
      for (const k of keys) this.asked.delete(k)
      this.env.notify({ kind: 'refused', message: errorMessage(e) })
    })
  }

  /** Re-runs `journal.feed` while the feed is shown; at most one queued (`Refreshes`). */
  refresh(): void {
    if (this.feed) this.reloads.request('feed')
  }

  /** Another view or program changed `p`: `isNewDay` makes the feed reload. */
  changed(p: PageView): void {
    if (this.feed && isNewDay(this.feed, p)) this.refresh()
  }

  /** Pages are gone: if the feed lists one, it reloads. */
  removed(keys: string[]): void {
    const feed = this.feed
    if (feed && keys.some((k) => feed.days.some((d) => d.key === k))) this.refresh()
  }

  /** The loaded day keys while the feed is shown, else null. */
  loaded(): ReadonlySet<string> | null {
    return this.feed ? new Set(Object.keys(this.feed.loaded)) : null
  }
}
