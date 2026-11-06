// The state of the Archive view: its rows, the filter, and the command that keeps them up to date.
import { errorMessage } from '../api'
import { shownRows } from './archive'
import { RefsRefresh } from './refs'
import type { ArchivedView, Command, Notice, Output } from './types'

export interface ArchiveEnv {
  /** Queues a command; its output reaches App.apply, which hands `out.archive` back. */
  run(cmd: Command): Promise<Output>
  notify(n: Notice): void
}

export class Archive {
  shown = $state(false)
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
  }

  /** Shows the view with an empty filter and runs `archive.list`; a failure is a notice. */
  async open(): Promise<void> {
    this.shown = true
    this.filter = ''
    try {
      await this.env.run({ type: 'archive.list' })
    } catch (e) {
      this.env.notify({ kind: 'refused', message: errorMessage(e) })
    }
  }

  /** Hides the view and forgets its rows. */
  close(): void {
    this.shown = false
    this.rows = null
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
   * A `page:changed` event. While shown, the view takes it: a change made elsewhere (another program, an automatic
   * archive) reloads it; our own echo does not. Returns whether the view took the event.
   */
  changed(own: boolean): boolean {
    if (!this.shown) return false
    if (!own) this.refresh()
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
