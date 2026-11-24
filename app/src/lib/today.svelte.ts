// The window's "today": the local date as a day key, kept current at midnight and when the window wakes.
import { dayKey } from './calendar'
import { everyMidnight, type Timers } from './feed'

export interface TodayEnv {
  now(): Date
  /** Plain functions, never methods of this object (a browser's setTimeout throws as a method). */
  timers: Timers
  /** Calls `f` on window focus and visibility change; returns the stop function. */
  listen(f: () => void): () => void
}

const realEnv: TodayEnv = {
  now: () => new Date(),
  timers: { set: (f, ms) => setTimeout(f, ms), clear: (t) => clearTimeout(t) },
  listen(f) {
    window.addEventListener('focus', f)
    document.addEventListener('visibilitychange', f)
    return () => {
      window.removeEventListener('focus', f)
      document.removeEventListener('visibilitychange', f)
    }
  },
}

export class Today {
  key = $state('')

  constructor(private env: TodayEnv = realEnv) {
    this.key = dayKey(env.now())
  }

  check(now: Date = this.env.now()): void {
    const k = dayKey(now)
    if (k !== this.key) this.key = k
  }

  private running: (() => void) | null = null

  /**
   * Re-checks after each local midnight and on focus and visibility change; returns the stop function. Called while
   * already started, it returns the running stop function and starts nothing.
   */
  start(): () => void {
    if (this.running) return this.running
    this.check()
    const stopMidnight = everyMidnight(() => this.check(), () => this.env.now(), this.env.timers)
    const stopListen = this.env.listen(() => this.check())
    const stop = () => {
      if (this.running !== stop) return
      stopMidnight()
      stopListen()
      this.running = null
    }
    this.running = stop
    return stop
  }
}

export const today = new Today()
