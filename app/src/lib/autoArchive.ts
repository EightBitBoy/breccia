// When Breccia archives finished tasks by itself: the runs and the hour timer.
import { errorCode } from '../api'
import type { BlockId, Command, ConfigView } from './types'

export const HOUR_MS = 3_600_000

export interface AutoArchiveEnv {
  /** Queues a command (after typed text); its answer reaches App.apply. */
  run(cmd: Command): Promise<unknown>
  /** The block whose editor is open: the core leaves it for a later run. */
  editing(): BlockId | null
  /** A folder is open and `[board] auto_archive` is on. */
  enabled(): boolean
}

/** Sends `archive.auto`, one at a time; a run asked for while one is on its way follows it once. */
export class AutoArchive {
  #busy = false
  #again = false

  constructor(private env: AutoArchiveEnv) {}

  async run(): Promise<void> {
    if (!this.env.enabled()) return
    if (this.#busy) {
      this.#again = true
      return
    }
    this.#busy = true
    try {
      await this.env.run({ type: 'archive.auto', editing: this.env.editing() })
    } catch (e) {
      // A run queued before a folder switch is answered `stale`; nothing was written.
      const code = errorCode(e)
      if (code !== 'stale' && code !== 'noFolder') console.error('automatic archiving failed', e)
    } finally {
      this.#busy = false
    }
    if (this.#again) {
      this.#again = false
      await this.run()
    }
  }
}

/** A change of the settings that runs it at once: the switch turned on, or the days changed while it is on. */
export function archiveShift(before: ConfigView | null, after: ConfigView): boolean {
  if (before === null || !after.autoArchive) return false
  return !before.autoArchive || before.archiveAfterDays !== after.archiveAfterDays
}

/** Calls `f` once an hour (so a new day is noticed while the app runs); returns the stop. */
export function hourly(f: () => void): () => void {
  // Called as plain functions: WebView2 refuses `setInterval` called as a method of another object.
  const timer = setInterval(f, HOUR_MS)
  return () => clearInterval(timer)
}
