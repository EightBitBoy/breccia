// After an internal error the core recovers its session and says so (`session:recovered`). This decides what the
// window shows: one notice per error, one reload of the notes, and what the refusals that error caused say.
import type { Command, Notice, RecoveredEvent } from './types'

/** One notice of the same words, and at most one reload, per this many ms. */
const WINDOW_MS = 60_000
/** Answers queued before the reload come back `stale` until this long after it ended. */
const STALE_MS = 2_000
/** What every recovery notice of the core starts with. */
const RECOVERY_TEXT = 'Breccia hit an internal error'
/** What the core's `stale` refusal starts with. */
const STALE_TEXT = 'request is for generation'

/** Shown instead of a second reload within a minute: a reload did not help. */
export const AGAIN = 'Breccia hit an internal error again. Please restart Breccia.'
/** What a refusal of the old session says once a restart was asked for (`AGAIN`). */
export const NEEDS_RESTART = 'Not done: Breccia needs a restart after an internal error.'

export interface RecoveryEnv {
  /** Shows a notice; never filtered by `message`. */
  notify(n: Notice): void
  /** Leaves the edited block: what was typed there becomes pending text. */
  leave(): void
  /**
   * Clears the shown view (feed, page, board, search, selection): from now until the reload shows the folder again, no
   * block of the old session can be clicked or edited, as the new session reuses its block ids.
   */
  clear(): void
  /** Sends the pending text (`client.flush()`): saved, or shown to copy. */
  flush(): Promise<void>
  /** `folder.status`, then the folder's views when a folder is open (else the Welcome screen). */
  reload(): Promise<void>
  /** The time in ms. */
  now(): number
}

export class Recovery {
  /** When the last recovery notice was shown, and its words. */
  private noticeAt: number | null = null
  private noticeText: string | null = null
  /** When the last reload started and ended. */
  private reloadAt: number | null = null
  private reloadEnd: number | null = null
  /** The flush and reload under way; later events join it. */
  private running: Promise<void> | null = null
  /** Another error reopened the session while the reload ran: a restart is asked for when it ends. */
  private againDuringReload = false
  /** A restart was asked for (`AGAIN`): the old session's refusals say so. */
  private needsRestart = false

  constructor(private env: RecoveryEnv) {}

  /** The core recovered: one notice, and when the session was reopened, one reload. */
  recovered(e: RecoveredEvent): Promise<void> {
    const now = this.env.now()
    if (this.running) {
      // An error during the reload: a kept session says so now; a reopened one makes the reload's end ask for a restart.
      if (e.reopened) this.againDuringReload = true
      else this.show(e.notice, now)
      return this.running
    }
    if (e.reopened && within(this.reloadAt, now, WINDOW_MS)) {
      // A reload a moment ago did not help; another could loop.
      this.restart(AGAIN, now)
      return Promise.resolve()
    }
    // The same words again within a minute stay quiet; something else that happened (reopened, closed) is shown.
    if (!within(this.noticeAt, now, WINDOW_MS) || e.notice.message !== this.noticeText) this.show(e.notice, now)
    if (!e.reopened) return Promise.resolve()
    this.reloadAt = now
    this.needsRestart = false
    // At once, before anything waits: typed text first, then nothing of the old session stays clickable.
    this.env.leave()
    this.env.clear()
    const run = (async () => {
      try {
        await this.env.flush()
        await this.env.reload()
      } finally {
        this.running = null
        this.reloadEnd = this.env.now()
        if (this.againDuringReload) {
          this.againDuringReload = false
          this.restart(AGAIN, this.reloadEnd)
        }
      }
    })()
    this.running = run
    return run
  }

  /**
   * What a refusal with error `code` of `cmd` and text `raw` says, or null when it stays unshown: `recovered` (the event
   * brings the notice), a repeat of the recovery notice, and `stale` around a reload; `stale` after a restart was asked
   * for says so. Typed text (`block.setText`) always keeps its notice, unchanged.
   */
  message(code: string | null, cmd: Command | null, raw: string): string | null {
    if (cmd?.type === 'block.setText') return raw
    if (code === 'recovered') return null
    if (raw.startsWith(RECOVERY_TEXT) && within(this.noticeAt, this.env.now(), WINDOW_MS)) return null
    if (code === 'stale' || raw.startsWith(STALE_TEXT)) {
      if (this.inStaleWindow()) return null
      if (this.needsRestart) return NEEDS_RESTART
    }
    return raw
  }

  private restart(message: string, now: number) {
    this.needsRestart = true
    this.show({ kind: 'refused', message }, now)
  }

  private show(n: Notice, now: number) {
    this.noticeAt = now
    this.noticeText = n.message
    this.env.notify(n)
  }

  /** From the start of the reload until `STALE_MS` after its end: answers queued before it come back `stale`. */
  private inStaleWindow(): boolean {
    return this.running !== null || (this.reloadEnd !== null && this.env.now() - this.reloadEnd <= STALE_MS)
  }
}

/** Whether `at` is less than `ms` before `now`. */
function within(at: number | null, now: number, ms: number): boolean {
  return at !== null && now - at < ms
}
