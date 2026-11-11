// Multi-select of blocks: which blocks are selected, and what keys do while
// they are. Commands go through the host's `run` (App's `exec`), so their
// outputs are applied in the one place every Output is.
import { NO_CYCLE, extend, neighbour, nextState, selectionAction } from '../lib/selection'
import { blockCommand } from '../lib/sync'
import type { BlockId, BlockView, Command, StateView } from '../lib/types'

export interface SelectionHost {
  /** The visible block ids, in order. */
  order(): BlockId[]
  /** The open page, or null. */
  page(): { key: string; blocks: BlockView[] } | null
  states(): StateView[]
  /** Whether a block is being edited: then keys belong to the editor. */
  editing(): boolean
  /** Ends editing; a selection replaces it. */
  leave(): void
  run(cmd: Command): void
  /** Shows a short note (a notice). */
  notify(message: string): void
}

export class MultiSelect {
  /** The selected ids; they stay selected across commands. Empty when not selecting. */
  ids = $state<BlockId[]>([])
  /** The selection runs from `anchor` to `head` in the visible order. */
  anchor: BlockId | null = null
  private head: BlockId | null = null

  constructor(
    private host: SelectionHost,
    private mac: boolean,
  ) {}

  /** Selects the visible blocks from `from` to `to`; editing ends. A `from` that is gone starts afresh at `to`. */
  select(from: BlockId, to: BlockId) {
    const order = this.host.order()
    if (!order.includes(from)) from = to
    const ids = extend(order, from, to)
    if (!ids.length) return
    if (this.host.editing()) this.host.leave()
    this.anchor = from
    this.head = to
    this.ids = ids
  }

  /** Selects `id` and its visible neighbour above (-1) or below (1). */
  selectWithNeighbour(id: BlockId, dir: -1 | 1) {
    this.select(id, neighbour(this.host.order(), id, dir))
  }

  clear() {
    this.ids = []
    this.anchor = this.head = null
  }

  /**
   * Keys while blocks are selected. Commands go to the selected blocks that still
   * exist, in document order. When none exists (after a delete), only undo and
   * redo act; any other key clears the selection and goes on as usual.
   */
  onKey(e: KeyboardEvent) {
    const page = this.host.page()
    if (!this.ids.length || this.host.editing() || !page || e.defaultPrevented || e.isComposing) return
    const a = selectionAction({ key: e.key, shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey, meta: e.metaKey }, this.mac)
    if (!a) return
    const run = (cmd: Command) => {
      e.preventDefault()
      this.host.run(cmd)
    }
    if (a === 'undo' || a === 'redo') {
      run({ type: a === 'undo' ? 'history.undo' : 'history.redo', page: page.key })
      return
    }
    const live = page.blocks.filter((b) => this.ids.includes(b.id))
    if (!live.length || a === 'clear') {
      this.clear()
      return
    }
    if (a === 'extendUp' || a === 'extendDown') {
      if (this.anchor === null || this.head === null) return
      // The selection, not the page or a DOM selection, moves.
      e.preventDefault()
      this.select(this.anchor, neighbour(this.host.order(), this.head, a === 'extendUp' ? -1 : 1))
      return
    }
    const ids = live.map((b) => b.id)
    switch (a) {
      case 'delete':
        run({ type: 'blocks.delete', ids, keepOne: true })
        return
      case 'removeState':
        run({ type: 'blocks.setState', ids, keyword: null })
        return
      case 'cycleState': {
        // The first block decides, and every selected block gets that state.
        const keyword = nextState(this.host.states(), live[0].state)
        if (keyword === null) {
          e.preventDefault()
          this.host.notify(NO_CYCLE)
        } else run({ type: 'blocks.setState', ids, keyword })
        return
      }
      default:
        run({ type: blockCommand[a], ids })
    }
  }
}
