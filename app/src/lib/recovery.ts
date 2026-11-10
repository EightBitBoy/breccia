// After an internal error the core recovers its session and says so (`session:recovered`). This decides what the
// window shows: one notice per error, one reload of the notes, and which refusals that error caused stay quiet.
import type { Command, Notice, RecoveredEvent } from './types'

/** One notice, and at most one reload, per this many ms. */
const WINDOW_MS = 60_000
/** Answers queued before the reload come back `stale` until this long after it ended. */
const STALE_MS = 2_000
/** What every recovery notice of the core starts with. */
const RECOVERY_TEXT = 'Breccia hit an internal error'
/** What the core's `stale` refusal starts with. */
const STALE_TEXT = 'request is for generation'

/** Shown instead of a second reload within a minute: a reload did not help. */
export const AGAIN = 'Breccia hit an internal error again. Please restart Breccia.'

export interface RecoveryEnv {
  /** Shows a notice; never filtered by `quietMessage`. */
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
  /** When the last recovery notice was shown. */
  private noticeAt: number | null = null
  /** When the last reload started and ended. */
  private reloadAt: number | null = null
  private reloadEnd: number | null = null
  /** The flush and reload under way; later events join it. */
  private running: Promise<void> | null = null
  /** Another error reopened the session while the reload ran: a restart is asked for when it ends. */
  private againDuringReload = false

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
      this.show({ kind: 'refused', message: AGAIN }, now)
      return Promise.resolve()
    }
    if (!within(this.noticeAt, now, WINDOW_MS)) this.show(e.notice, now)
    if (!e.reopened) return Promise.resolve()
    this.reloadAt = now
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
          this.show({ kind: 'refused', message: AGAIN }, this.reloadEnd)
        }
      }
    })()
    this.running = run
    return run
  }

  /**
   * Whether a refusal with error `code` of `cmd` stays unshown: `recovered` (the event brings the notice), and `stale`
   * around a reload. Typed text (`block.setText`) always keeps its notice.
   */
  quiet(code: string | null, cmd: Command | null): boolean {
    if (cmd?.type === 'block.setText') return false
    if (code === 'recovered') return true
    return code === 'stale' && this.reloading()
  }

  /** Whether a refusal notice with `message` stays unshown: it repeats the recovery notice, or is `stale` around a reload. */
  quietMessage(message: string): boolean {
    if (message.startsWith(RECOVERY_TEXT)) return within(this.noticeAt, this.env.now(), WINDOW_MS)
    return message.startsWith(STALE_TEXT) && this.reloading()
  }

  private show(n: Notice, now: number) {
    this.noticeAt = now
    this.env.notify(n)
  }

  private reloading(): boolean {
    return this.running !== null || (this.reloadEnd !== null && this.env.now() - this.reloadEnd <= STALE_MS)
  }
}

/** Whether `at` is less than `ms` before `now`. */
function within(at: number | null, now: number, ms: number): boolean {
  return at !== null && now - at < ms
}
