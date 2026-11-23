// The due date calendar's state: one calendar for every way in (the card menu, the task menu, the key). `show`
// opens it at an anchor with the task's due date (or none) and what a pick does; a pick or "Remove due date" runs
// that once and closes it, and closing it any other way (Esc, a click outside) runs nothing.
import type { Box } from './linkColor'

export class DuePick {
  open = $state(false)
  /** Where the calendar stands, in viewport pixels. */
  anchor = $state<Box | null>(null)
  /** The task's due date as a day key, or null when it has none. */
  due = $state<string | null>(null)
  private run: ((due: string | null) => void) | null = null

  /** Opens the calendar; an open one is taken over, and its earlier `run` is dropped. */
  show(due: string | null, anchor: Box, run: (due: string | null) => void): void {
    this.due = due
    this.anchor = anchor
    this.run = run
    this.open = true
  }

  /** The day `key` was picked. */
  pick(key: string): void {
    this.finish(key)
  }

  /** "Remove due date". */
  remove(): void {
    this.finish(null)
  }

  /** Closes without writing anything. */
  close(): void {
    this.run = null
    this.open = false
  }

  private finish(due: string | null) {
    const run = this.run
    this.close()
    run?.(due)
  }
}

export const duePick = new DuePick()
