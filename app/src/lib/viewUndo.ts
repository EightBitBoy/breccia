// `Ctrl Z` and `Ctrl Shift Z` while no block is edited (spec §7.2, §7.6). The core keeps an undo history per page; on
// the board and in the journal feed, where a view shows many pages, this remembers which pages the view's own changes
// went to, newest first, so a key steps the right page's history.
import type { BlockId, Command, Output } from './types'

export type HistoryAction = 'undo' | 'redo'

/** The commands that change pages with an undo step. */
const EDITS = new Set<Command['type']>([
  'block.cycleState',
  'block.delete',
  'block.insert',
  'block.merge',
  'block.paste',
  'block.setDue',
  'block.setText',
  'block.split',
  'block.stepState',
  'blocks.delete',
  'blocks.indent',
  'blocks.moveDown',
  'blocks.moveUp',
  'blocks.outdent',
  'blocks.setArchived',
  'blocks.setState',
  'board.archive',
  'board.place',
  'journal.append',
  'page.setColor',
])

/**
 * The pages whose undo history `cmd` (answered with `out`) added a step to, as the pages to undo it on. A change of
 * several pages that the core keeps as one step (a drop that raised cards on other pages) is undone from its own page
 * alone, which takes the others with it; `board.archive` makes one step on each page it changed.
 */
export function stepPages(cmd: Command, out: Output): string[] {
  if (!EDITS.has(cmd.type)) return []
  if (cmd.type === 'board.archive') return out.changed.map((p) => p.key)
  return out.page ? [out.page.key] : []
}

interface Change {
  pages: string[]
  /** The block typed into: more typing there is the same change, as the core keeps it one step. */
  typing: BlockId | null
}

/** How many changes a view remembers. */
const LIMIT = 200

/**
 * The changes made in one view (`board:<index>`, `journal`, ...), to undo and redo them newest first. A change made
 * in another view starts the lists again: from then on that view's keys step its own changes, and the old view's
 * would no longer match the pages' histories.
 */
export class ViewUndo {
  private view: string | null = null
  private undos: Change[] = []
  private redos: Change[] = []
  /** The history commands `step` sent: their answers are already accounted for. */
  private sent = new WeakSet<Command>()

  /** A command answered while `view` was shown. */
  record(view: string | null, cmd: Command, out: Output): void {
    if (cmd.type === 'history.undo' || cmd.type === 'history.redo') {
      if (!this.sent.has(cmd) && view === this.view) this.follow(cmd.type === 'history.undo', cmd.page)
      return
    }
    const pages = stepPages(cmd, out)
    if (!pages.length) return
    if (view !== this.view) {
      this.view = view
      this.undos = []
    }
    this.redos = []
    const typing = cmd.type === 'block.setText' ? cmd.id : null
    const top = this.undos.at(-1)
    if (typing !== null && top?.typing === typing && top.pages.join('\n') === pages.join('\n')) return
    this.undos.push({ pages, typing })
    if (this.undos.length > LIMIT) this.undos.shift()
  }

  /** `Ctrl Z` (`undo`) or `Ctrl Shift Z` (`redo`) in `view`: the history commands to send, none if nothing is left. */
  step(view: string, a: HistoryAction): Command[] {
    if (view !== this.view) return []
    const from = a === 'undo' ? this.undos : this.redos
    const change = from.pop()
    if (!change) return []
    ;(a === 'undo' ? this.redos : this.undos).push({ pages: change.pages, typing: null })
    return change.pages.map((page) => {
      const cmd: Command = { type: a === 'undo' ? 'history.undo' : 'history.redo', page }
      this.sent.add(cmd)
      return cmd
    })
  }

  /** Another notes folder: its pages are not the ones remembered. */
  clear(): void {
    this.view = null
    this.undos = []
    this.redos = []
  }

  /** An undo or redo of `page` sent from elsewhere in the view (a block editor, a selection): its change moves along. */
  private follow(undo: boolean, page: string) {
    const from = undo ? this.undos : this.redos
    const top = from.at(-1)
    if (!top?.pages.includes(page)) return
    from.pop()
    ;(undo ? this.redos : this.undos).push({ pages: top.pages, typing: null })
  }
}
