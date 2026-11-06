// The state of the All pages table: its rows, sort, journal switch and filter, and the
// command that keeps the rows up to date.
import { errorMessage } from '../api'
import { DEFAULT_SORT, nextSort, shownRows, type ColumnKey, type Sort } from './allPages'
import { RefsRefresh } from './refs'
import type { Command, Notice, Output, PageRowView } from './types'

export interface AllPagesEnv {
  /** Queues a command; its output reaches App.apply, which hands `out.table` back. */
  run(cmd: Command): Promise<Output>
  notify(n: Notice): void
}

export class AllPages {
  shown = $state(false)
  /** The last `pages.table` answer; null until it arrives and after `close`. */
  rows = $state.raw<PageRowView[] | null>(null)
  sort = $state<Sort>(DEFAULT_SORT)
  showJournals = $state(false)
  filter = $state('')
  private reloads: RefsRefresh

  constructor(private env: AllPagesEnv) {
    this.reloads = new RefsRefresh({
      key: () => (this.shown ? 'all' : null),
      busy: () => false,
      // RefsRefresh swallows a rejection; a failed reload is a notice, as in `open`.
      run: () => this.env.run({ type: 'pages.table' }).then(
        () => undefined,
        (e) => this.env.notify({ kind: 'refused', message: errorMessage(e) }),
      ),
    })
  }

  /** Shows the table (the filter empties; sort and switch stay) and runs `pages.table`; a failure is a notice. */
  async open(): Promise<void> {
    this.shown = true
    this.filter = ''
    try {
      await this.env.run({ type: 'pages.table' })
    } catch (e) {
      this.env.notify({ kind: 'refused', message: errorMessage(e) })
    }
  }

  /** Hides the table and forgets its rows. */
  close(): void {
    this.shown = false
    this.rows = null
  }

  /** A `pages.table` answer: applied only while shown. */
  applyTable(rows: PageRowView[]): void {
    if (this.shown) this.rows = rows
  }

  /** Loads the table again while shown: one run in flight, one pending (RefsRefresh). */
  refresh(): void {
    if (this.shown) this.reloads.request()
  }

  /**
   * A `page:changed` event. While shown, the table takes it (no other view does): another
   * program's change reloads it (§6); our own echo does not, the table has it already.
   * Returns whether the table took the event.
   */
  changed(own: boolean): boolean {
    if (!this.shown) return false
    if (!own) this.refresh()
    return true
  }

  /** Sorts by `key` (a new key or a reversal); returns whether the order changed, so the view scrolls to the top. */
  sortBy(key: ColumnKey): boolean {
    this.sort = nextSort(this.sort, key)
    return true
  }

  /** `shownRows` of the rows with the current filter, switch and sort; [] while rows is null. */
  visible(): PageRowView[] {
    return this.rows === null ? [] : shownRows(this.rows, { filter: this.filter, journals: this.showJournals, sort: this.sort })
  }

  /** The count behind `countLabel`: rows under the journal switch, before the filter. */
  total(): number {
    return this.rows === null ? 0 : shownRows(this.rows, { filter: '', journals: this.showJournals, sort: this.sort }).length
  }
}
