// The state of the Archive view: its rows, the filter, and the command that keeps them up to date.
import { errorMessage } from '../api'
import { shownRows } from './archive'
import type { MainArea } from './mainArea.svelte'
import { RefsRefresh } from './refs'
import type { ArchivedView, Command, Notice, Output } from './types'

export interface ArchiveEnv {
  area: MainArea
  /** Queues a command; its output reaches App.apply, which hands the `archive` answer back. */
  run(cmd: Command): Promise<Output>
  notify(n: Notice): void
}

export class Archive {
  get shown(): boolean {
    return this.env.area.is('archive')
  }
  /** The last `archive.list` answer; null until it arrives and after `close`. */
  rows = $state.raw<ArchivedView[] | null>(null)
  filter = $state('')
  private reloads: RefsRefresh

  constructor(private env: ArchiveEnv) {
    this.reloads = new RefsRefresh({
      key: () => (this.shown ? 'archive' : null),
      busy: () => false,
      // RefsRefresh swallows a rejection; a failed reload is a notice, as in `open`.
      run: () => this.env.run({ type: 'archive.list' }).then(
        () => undefined,
        (e) => this.env.notify({ kind: 'refused', message: errorMessage(e) }),
      ),
    })
    env.area.register('archive', { left: () => (this.rows = null) })
  }

  /** Shows the view with an empty filter and runs `archive.list`; a failure is a notice. */
  async open(): Promise<void> {
    this.env.area.show({ kind: 'archive' })
    this.filter = ''
    try {
      await this.env.run({ type: 'archive.list' })
    } catch (e) {
      this.env.notify({ kind: 'refused', message: errorMessage(e) })
    }
  }

  /** Hides the view and forgets its rows. */
  close(): void {
    this.env.area.leave('archive')
  }

  /** An `archive.list` answer: applied only while shown. */
  applyArchive(rows: ArchivedView[]): void {
    if (this.shown) this.rows = rows
  }

  /** Loads the rows again while shown: one run in flight, one pending (RefsRefresh). */
  refresh(): void {
    if (this.shown) this.reloads.request()
  }

  /**
   * A page changed elsewhere (another program, an automatic archive). While shown, the view takes it and reloads.
   * Returns whether the view took it.
   */
  changed(): boolean {
    if (!this.shown) return false
    this.refresh()
    return true
  }

  /** The rows with the current filter; [] while rows is null. */
  visible(): ArchivedView[] {
    return this.rows === null ? [] : shownRows(this.rows, this.filter)
  }

  total(): number {
    return this.rows?.length ?? 0
  }
}
