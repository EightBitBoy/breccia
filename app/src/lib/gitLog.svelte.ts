// The state of the Git history view: the loaded commits, "Show more", and reloads while it is open.
import { errorMessage } from '../api'
import { PAGE_SIZE } from './gitLog'
import type { LogEntry, Output } from './types'

export interface GitLogEnv {
  /** Sends `git.log`; the shell answers it outside the command queue and the session lock. */
  log(skip: number, limit: number): Promise<Output>
}

export class GitLog {
  shown = $state(false)
  /** Newest first; null until the first answer and after `close`. */
  entries = $state.raw<LogEntry[] | null>(null)
  /** Whether older commits follow. */
  more = $state(false)
  /** Why the last load failed; null after an answer. */
  error = $state<string | null>(null)
  /** A "Show more" is on its way. */
  loadingMore = $state(false)
  /**
   * Counts the loads from the top (`open`, `refresh`). An answer of an older count is dropped, and so is a
   * "Show more" sent before the latest one: the history may have moved under it.
   */
  #epoch = 0
  /** Loads from the top still on their way; "Show more" waits for them. */
  #reloading = 0

  constructor(private env: GitLogEnv) {}

  /** Shows the view and loads the newest commits. */
  async open(): Promise<void> {
    this.shown = true
    this.entries = null
    this.more = false
    this.error = null
    await this.#reload(PAGE_SIZE)
  }

  /** Hides the view and forgets what it loaded; answers on their way are dropped. */
  close(): void {
    this.shown = false
    this.entries = null
    this.more = false
    this.error = null
    this.loadingMore = false
    this.#epoch++
  }

  /** Loads again from the top, as many rows as are shown (at least a page), so a new commit shows at the top. */
  refresh(): void {
    if (this.shown) void this.#reload(Math.max(PAGE_SIZE, this.entries?.length ?? 0))
  }

  /** Appends the next page. Nothing while one is loading, while a reload is on its way, or with nothing more. */
  async showMore(): Promise<void> {
    if (!this.shown || this.entries === null || !this.more || this.loadingMore || this.#reloading > 0) return
    const epoch = this.#epoch
    const skip = this.entries.length
    this.loadingMore = true
    try {
      const page = (await this.env.log(skip, PAGE_SIZE)).gitLog
      if (epoch !== this.#epoch || !page || this.entries === null || page.skip !== this.entries.length) return
      const have = new Set(this.entries.map((e) => e.hash))
      this.entries = [...this.entries, ...page.entries.filter((e) => !have.has(e.hash))]
      this.more = page.more
      this.error = null
    } catch (e) {
      if (epoch === this.#epoch) this.error = errorMessage(e)
    } finally {
      if (epoch === this.#epoch) this.loadingMore = false
    }
  }

  async #reload(limit: number): Promise<void> {
    const epoch = ++this.#epoch
    // A "Show more" on its way is now stale; the button works again once this answer is in.
    this.loadingMore = false
    this.#reloading++
    try {
      const page = (await this.env.log(0, limit)).gitLog
      if (epoch !== this.#epoch || !page) return
      this.entries = page.entries
      this.more = page.more
      this.error = null
    } catch (e) {
      if (epoch === this.#epoch) this.error = errorMessage(e)
    } finally {
      this.#reloading--
    }
  }
}
