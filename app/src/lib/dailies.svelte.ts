// The window's Dailies: the list, the reset time, `now`, and the timers that redraw it.
import { errorMessage } from '../api'
import { DEFAULT_RESET, dailiesItem, groups, isChecked, nextReset } from './dailies'
import type { StatusItem } from './status'
import type { BlockId, Command, DailyView, Notice, Output } from './types'

export interface DailiesEnv {
  /** Queues a command; its output reaches App.apply, which hands `out.dailies` to `apply`. */
  run(cmd: Command): Promise<Output>
  notify(n: Notice): void
  now(): Date
  // The window's functions are passed bound, never called as methods of this object.
  setTimeout(f: () => void, ms: number): number
  clearTimeout(h: number): void
  setInterval(f: () => void, ms: number): number
  clearInterval(h: number): void
}

const TICK_MS = 60_000

export class Dailies {
  shown = $state(false)
  /** The dailies in file order; null until the first answer and after `forget`. */
  list = $state.raw<DailyView[] | null>(null)
  reset = $state(DEFAULT_RESET)
  now = $state(new Date())
  private resetTimer: number | null = null
  private tickTimer: number | null = null
  private started = false

  constructor(private env: DailiesEnv) {
    this.now = env.now()
  }

  get groups(): { open: DailyView[]; checked: DailyView[] } {
    return groups(this.list ?? [], this.now, this.reset)
  }

  get item(): StatusItem | null {
    return dailiesItem(this.list, this.now, this.reset, this.shown)
  }

  get allDone(): boolean {
    return this.list !== null && this.list.length > 0 && this.groups.open.length === 0
  }

  apply(list: DailyView[] | null): void {
    this.list = list
  }

  /** Runs `dailies.list`; a failure is a notice. */
  async load(): Promise<void> {
    try {
      await this.env.run({ type: 'dailies.list' })
    } catch (e) {
      this.env.notify({ kind: 'refused', message: errorMessage(e) })
    }
  }

  setReset(r: string): void {
    this.reset = r
    this.now = this.env.now()
    if (this.started) this.armReset()
  }

  async open(): Promise<void> {
    this.shown = true
    await this.load()
  }

  /** Hides the view; the list stays for the status bar. */
  close(): void {
    this.shown = false
  }

  /** Folder switch: the old folder's rows go; the timers serve the new folder too. */
  forget(): void {
    this.list = null
  }

  wake(): void {
    this.now = this.env.now()
  }

  // The commands about one daily take the row the window showed and send its text as `shown`: the core refuses the
  // command when the file now gives that daily another text (an outside change taken while a confirm or a field was
  // open).

  async check(d: DailyView): Promise<void> {
    const now = this.list?.find((x) => x.id === d.id)
    if (now && isChecked(now.checked, this.env.now(), this.reset)) return
    await this.send({ type: 'dailies.check', id: d.id, shown: d.text })
  }

  async uncheck(d: DailyView): Promise<void> {
    await this.send({ type: 'dailies.uncheck', id: d.id, shown: d.text })
  }

  /** Resolves false when the core refused it (the field then keeps the text). */
  add(text: string): Promise<boolean> {
    return this.send({ type: 'dailies.add', text })
  }

  async edit(d: DailyView, text: string): Promise<void> {
    await this.send({ type: 'dailies.edit', id: d.id, text, shown: d.text })
  }

  async remove(d: DailyView): Promise<void> {
    await this.send({ type: 'dailies.delete', id: d.id, shown: d.text })
  }

  async move(d: DailyView, before: BlockId | null): Promise<void> {
    await this.send({ type: 'dailies.move', id: d.id, before, shown: d.text })
  }

  /** Arms the reset timer and the 60 s tick; returns the stop. */
  start(): () => void {
    this.started = true
    this.wake()
    this.armReset()
    if (this.tickTimer === null) this.tickTimer = this.env.setInterval(() => this.wake(), TICK_MS)
    return () => {
      this.started = false
      this.clearReset()
      if (this.tickTimer !== null) this.env.clearInterval(this.tickTimer)
      this.tickTimer = null
    }
  }

  private clearReset(): void {
    if (this.resetTimer !== null) this.env.clearTimeout(this.resetTimer)
    this.resetTimer = null
  }

  private armReset(): void {
    this.clearReset()
    const now = this.env.now()
    const ms = Math.max(nextReset(now, this.reset).getTime() - now.getTime(), 1000)
    this.resetTimer = this.env.setTimeout(() => {
      this.resetTimer = null
      this.wake()
      if (this.started) this.armReset()
    }, ms)
  }

  /** A refused command is one notice; the list is then reloaded (the file may have changed). False when refused. */
  private async send(cmd: Command): Promise<boolean> {
    try {
      await this.env.run(cmd)
      return true
    } catch (e) {
      this.env.notify({ kind: 'refused', message: errorMessage(e) })
      await this.load()
      return false
    }
  }
}
