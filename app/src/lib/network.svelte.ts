// The state of the network view: whether it is shown, the last `graph.get` answer and the
// filters, which outlast closing the view and reset with a new folder.
import { errorMessage } from '../api'
import { DEFAULT_FILTERS, limitValid, type GraphFilters } from './graph'
import { RefsRefresh } from './refs'
import type { Command, GraphView, NodePosition, Notice, Output } from './types'

export interface NetworkEnv {
  /** Queues a command; its output reaches App.apply, which hands `out.graph` back. */
  run(cmd: Command): Promise<Output>
  notify(n: Notice): void
}

export class Network {
  shown = $state(false)
  /** The last `graph.get` answer; null until it arrives and after `close`. */
  view = $state.raw<GraphView | null>(null)
  /** A copy, never the shared constant. */
  filters = $state<GraphFilters>({ ...DEFAULT_FILTERS })
  private reloads: RefsRefresh

  constructor(private env: NetworkEnv) {
    this.reloads = new RefsRefresh({
      key: () => (this.shown ? 'graph' : null),
      busy: () => false,
      // RefsRefresh swallows a rejection; a failed reload is a notice, as in `open`.
      run: () => this.env.run({ type: 'graph.get' }).then(
        () => undefined,
        (e) => this.env.notify({ kind: 'refused', message: errorMessage(e) }),
      ),
    })
  }

  /** Shows the view and runs `graph.get`; a failure is a notice. */
  async open(): Promise<void> {
    this.shown = true
    try {
      await this.env.run({ type: 'graph.get' })
    } catch (e) {
      this.env.notify({ kind: 'refused', message: errorMessage(e) })
    }
  }

  /** Hides the view and forgets its data; the filters stay. */
  close(): void {
    this.shown = false
    this.view = null
  }

  /** A `graph.get` answer: applied only while shown; a limit that no longer exists resets to everything. */
  applyGraph(v: GraphView): void {
    if (!this.shown) return
    this.view = v
    if (!limitValid(v, this.filters.limit)) this.setFilters({ limit: null })
  }

  /** Loads the graph again while shown: one run in flight, one pending. */
  refresh(): void {
    if (this.shown) this.reloads.request()
  }

  /** A `page:changed` event: while shown the view takes it, and reloads unless it is our own echo. */
  changed(own: boolean): boolean {
    if (!this.shown) return false
    if (!own) this.refresh()
    return true
  }

  /** A new notes folder: close and forget the filters. */
  newFolder(): void {
    this.close()
    this.filters = { ...DEFAULT_FILTERS }
  }

  setFilters(patch: Partial<GraphFilters>): void {
    this.filters = { ...this.filters, ...patch }
  }

  /** Saves the settled layout; a failure is only logged (the layout is a cache). */
  saveLayout(positions: NodePosition[]): void {
    this.env.run({ type: 'graph.saveLayout', positions }).catch((e) => console.error('graph.saveLayout', e))
  }
}
