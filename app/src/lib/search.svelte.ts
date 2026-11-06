// The state of the quick search box: its text, the last answer and the selected row.
import { errorMessage } from '../api'
import { firstSelectable, moveSelection, rowKey, searchRows, selectable, type SearchRow } from './search'
import type { BlockId, Command, NameView, Notice, Output, SearchView } from './types'

export interface SearchEnv {
  /** Queues a command; its output reaches App.apply, which hands `out.search` and `out.names` back. */
  run(cmd: Command): Promise<Output>
  notify(n: Notice): void
  /** A row was chosen with Enter; the box is still open. */
  choose(row: SearchRow): void
  /** The box was dismissed (Esc): edit block `id` again, the one edited when it opened, if it still exists. */
  back(id: BlockId): void
}

export class Search {
  shown = $state(false)
  text = $state('')
  view = $state.raw<SearchView | null>(null)
  names = $state.raw<NameView[]>([])
  selected = $state(-1)
  busy = $state(false)
  /** The newest text typed while a query was in flight. */
  private pending: string | null = null
  /** Enter was pressed before the answer for the current text arrived; choose when it does. */
  private waitingEnter = false
  /** The block edited when the box opened. */
  private from: BlockId | null = null
  /** The rows of the last answer and names, so an arrow key does not rank the names again. */
  private cache: { view: SearchView | null; names: NameView[]; rows: SearchRow[] } | null = null

  constructor(private env: SearchEnv) {}

  /** Opens the box empty and asks for the page names; showing again changes nothing. `from`: the block being edited. */
  show(from: BlockId | null = null): void {
    if (this.shown) return
    this.shown = true
    this.from = from
    this.text = ''
    this.view = null
    this.selected = -1
    this.waitingEnter = false
    this.env.run({ type: 'pages.list' }).catch((e) => this.fail(e))
  }

  close(): void {
    this.shown = false
    this.waitingEnter = false
    this.pending = null
    this.from = null
    this.view = null
    this.text = ''
  }

  /** Closes without a choice (Esc, a click outside): back to the block edited when the box opened. */
  dismiss(): void {
    const from = this.from
    this.close()
    if (from !== null) this.env.back(from)
  }

  type(text: string): void {
    this.text = text
    this.waitingEnter = false
    if (text === '') {
      this.view = null
      this.selected = -1
      this.pending = null
      return
    }
    this.query(text)
  }

  /** An answer: applied only while shown and still the text in the box. */
  applySearch(view: SearchView): void {
    if (!this.shown || view.query !== this.text) return
    // Only a refresh of the same query keeps the selected row; a new text selects the first.
    const keep = this.view?.query === view.query ? this.chosen() : null
    this.view = view
    const rows = this.rows()
    const key = keep === null ? null : rowKey(keep)
    const same = key === null ? -1 : rows.findIndex((r) => selectable(r) && rowKey(r) === key)
    this.selected = same >= 0 ? same : firstSelectable(rows)
    if (this.waitingEnter) {
      this.waitingEnter = false
      this.chooseSelected()
    }
  }

  applyNames(names: NameView[]): void {
    if (this.shown) this.names = names
  }

  /** The notes changed: ask for the page names again while shown. */
  refreshNames(): void {
    if (this.shown) this.env.run({ type: 'pages.list' }).catch((e) => this.fail(e))
  }

  /** The notes changed: ask again for the current text. */
  refresh(): void {
    if (this.shown && this.text !== '') this.query(this.text)
  }

  /** Computed once per answer or names; `view` and `names` are replaced, never changed in place. */
  rows(): SearchRow[] {
    const { view, names } = this
    if (this.cache?.view !== view || this.cache.names !== names)
      this.cache = { view, names, rows: view === null ? [] : searchRows(view, names) }
    return this.cache.rows
  }

  move(dir: 1 | -1): void {
    this.selected = moveSelection(this.rows(), this.selected, dir)
  }

  chosen(): SearchRow | null {
    return this.rows()[this.selected] ?? null
  }

  /** Enter: chooses from the answer for the text in the box, waiting for it if it has not arrived yet. */
  enter(): void {
    if (this.text === '') return
    if (this.view?.query === this.text) this.chooseSelected()
    else this.waitingEnter = true
  }

  private chooseSelected(): void {
    const row = this.chosen()
    if (row) this.env.choose(row)
  }

  /** At most one `search.query` in flight; a newer text waits and only the newest is sent. */
  private query(text: string): void {
    if (this.busy) {
      this.pending = text
      return
    }
    this.busy = true
    this.env
      .run({ type: 'search.query', text })
      .catch((e) => {
        if (text === this.text) this.waitingEnter = false // no answer is coming for this Enter
        this.fail(e)
      })
      .finally(() => {
        this.busy = false
        const next = this.pending
        this.pending = null
        if (next !== null && this.shown) this.query(next)
      })
  }

  private fail(e: unknown): void {
    this.env.notify({ kind: 'refused', message: errorMessage(e) })
  }
}
