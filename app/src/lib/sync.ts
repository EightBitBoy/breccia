// Keeping the one block editor in step with the core. Pure decisions only;
// App.svelte carries them out.
import type { BlockId, Command } from './types'

/** The commands of the outline keys that move blocks; editor and selection share them. */
export const blockCommand = {
  indent: 'blocks.indent',
  outdent: 'blocks.outdent',
  moveUp: 'blocks.moveUp',
  moveDown: 'blocks.moveDown',
} as const satisfies Record<string, Command['type']>

/** A Backspace or Delete held during a split, to be replayed in the new block. */
export type Held = 'deleteBack' | 'deleteForward'

/**
 * While block text is being split at caret `c`, the old editor still shows it all;
 * the part from `c` on is the new block. A plain Backspace at `c` (the new block's
 * start: a merge) or a Delete at or after `c` belongs to the new block and is held
 * for it. Others (inside the old block's part, or deleting typed text) stay with
 * the old editor; the carry-over sorts them out.
 */
export function heldDelete(key: string, at: number, c: number): Held | null {
  if (key === 'Backspace') return at === c ? 'deleteBack' : null
  if (key === 'Delete') return at >= c ? 'deleteForward' : null
  return null
}

/** How a command's output may touch the editor. */
export type Kind =
  /** `block.setText`: typing. The editor is ahead of the core, unless the core reshaped the text. */
  | 'typing'
  /** `block.split`: handled with `carryOver`. */
  | 'split'
  /** Moves blocks without changing their text: the editor keeps its text. */
  | 'structure'
  /** Changes text: the editor is locked while it runs and then shows the output. */
  | 'text'
  /** Not from the editor (open a page, insert a block, ...). */
  | 'other'
  /** `page.get`: the shown page again after another program changed it; see `afterRefresh`. */
  | 'refresh'

/**
 * Whether a running command holds back `page:changed` events (its own output
 * wins). Commands that never answer with a page do not: the queries `page.refs`, `page.renameReach`, `pages.list`, `board.get`,
 * `pages.table`, `archive.list`, `search.query`, `journal.day` and `graph.get`, and `graph.saveLayout`, which writes only to the cache folder.
 */
export function countsInFlight(type: Command['type']): boolean {
  return type !== 'page.refs' && type !== 'page.renameReach' && type !== 'pages.list' && type !== 'board.get' && type !== 'pages.table' && type !== 'archive.list' && type !== 'search.query' && type !== 'journal.day' && type !== 'graph.get' && type !== 'graph.saveLayout'
}

export function kindOf(type: Command['type']): Kind {
  switch (type) {
    case 'block.setText':
      return 'typing'
    case 'block.split':
      return 'split'
    case 'blocks.indent':
    case 'blocks.outdent':
    case 'blocks.moveUp':
    case 'blocks.moveDown':
      return 'structure'
    case 'block.merge':
    case 'block.cycleState':
    case 'block.stepState':
    case 'block.paste':
    case 'blocks.setState':
    case 'board.place':
    case 'blocks.setArchived':
    case 'blocks.delete':
    case 'block.delete':
    case 'history.undo':
    case 'history.redo':
    case 'page.reload':
    case 'page.overwrite':
      return 'text'
    case 'page.get':
      return 'refresh'
    default:
      return 'other'
  }
}

export interface OutputState {
  kind: Kind
  /** The block being edited now, or null. */
  editing: BlockId | null
  /** The block that was being edited when the command was issued, or null. */
  issuedFrom: BlockId | null
  /** The output's text of the block being edited; null if the block is gone. */
  editedText: string | null
  /** The output's focus, with its offset already in UTF-16. */
  focus: { id: BlockId; cursor16: number } | null
  /** For `typing`: the block and the text that were sent. */
  sent?: { id: BlockId; text: string }
  /** For `typing`: the editor's text now. */
  current?: string
}

export type Step =
  | { do: 'none' }
  /** The edited block is gone. */
  | { do: 'close' }
  /**
   * Edit `id` with this caret. Its text is the block's text in the output plus
   * `extra`, text typed after the send that must reach the core again.
   */
  | { do: 'edit'; id: BlockId; cursor16: number; extra?: string }
  /** Keep editing the same block, showing `text` (caret clamped by the caller); see `extra` above. */
  | { do: 'setText'; text: string; extra?: string }
  /** Keep editing the same block and its text; refocus after DOM moves. */
  | { do: 'keep' }

/** What the editor does after an output (all kinds but `split`, see `carryOver`). */
export function afterOutput(s: OutputState): Step {
  // The user left (or moved to another block) while the command ran: do not pull them back.
  // A text command issued while not editing (from a selection) must not override
  // a block the user started editing since.
  const left = s.issuedFrom !== null ? s.editing !== s.issuedFrom : s.editing !== null && s.kind === 'text'
  switch (s.kind) {
    case 'typing': {
      // An echo of another block's typing changes nothing here.
      if (s.editing === null || s.editing !== s.sent?.id) return { do: 'none' }
      if (s.editedText === null) return { do: 'close' }
      // The core kept the text as sent: the editor is right (and maybe ahead).
      if (!s.focus && s.editedText === s.sent.text) return { do: 'none' }
      // The core reshaped the text (new blocks, a closed fence). Text typed since
      // the send is kept if it was added at the end; else the user's text stays.
      const extra = typedAfter(s.sent.text, s.current ?? s.sent.text)
      if (extra === null) return { do: 'none' }
      if (s.focus) return { do: 'edit', id: s.focus.id, cursor16: s.focus.cursor16 + extra.length, extra }
      return { do: 'setText', text: s.editedText + extra, extra }
    }
    case 'split':
    case 'text':
      if (left) return { do: 'none' }
      if (s.focus) return { do: 'edit', ...s.focus }
      if (s.editing === null) return { do: 'none' }
      return s.editedText === null ? { do: 'close' } : { do: 'setText', text: s.editedText }
    case 'structure':
      if (s.editing === null) return { do: 'none' }
      return s.editedText === null ? { do: 'close' } : { do: 'keep' }
    case 'other':
    case 'refresh':
      if (s.focus) return { do: 'edit', ...s.focus }
      if (s.editing === null) return { do: 'none' }
      return s.editedText === null ? { do: 'close' } : { do: 'none' }
  }
}

export interface RefreshState {
  /** The block being edited, or null. */
  editing: BlockId | null
  /** The editor's text now; null if no editor is mounted. */
  editorText: string | null
  /** The edited block's text in the view being replaced. */
  before: string | null
  /** The edited block's text in the new view; null if the block is gone. */
  after: string | null
}

/**
 * What the editor does after a refresh (`page.get`) of the shown page. The edit
 * in progress is kept (§6); if another program changed the edited block, both
 * versions are shown. A block that is gone ends editing: the flush before
 * `page.get` already sent what was typed.
 */
export function afterRefresh(s: RefreshState): Step | { do: 'conflict'; mine: string; theirs: string } {
  if (s.editing === null) return { do: 'none' }
  if (s.after === null) return { do: 'close' }
  if (s.editorText === null || s.after === s.before || s.editorText === s.after) return { do: 'none' }
  return { do: 'conflict', mine: s.editorText, theirs: s.after }
}

/** What was appended to `sent` to give `current`, or null if it was edited otherwise. */
export function typedAfter(sent: string, current: string): string | null {
  return current.startsWith(sent) ? current.slice(sent.length) : null
}

export type Carry =
  /** Typed `d` went in at the split caret: it belongs at the start of the new block. */
  | { kind: 'carry'; d: string }
  /** The user changed text before the caret: the old block keeps `text`. */
  | { kind: 'keep'; text: string }

/**
 * After a split of text `t0` at caret `c` (UTF-16), the old editor holds `t1`.
 * If `t1` is `t0` with something inserted at `c`, that insert moves to the new
 * block. Otherwise nothing is lost: the old block keeps `t1`, without the moved
 * tail `t0[c..]` when `t1` still ends with it.
 */
export function carryOver(t0: string, c: number, t1: string): Carry {
  const head = t0.slice(0, c)
  const tail = t0.slice(c)
  if (t1.length >= t0.length && t1.startsWith(head) && t1.endsWith(tail)) {
    return { kind: 'carry', d: t1.slice(c, t1.length - tail.length) }
  }
  return { kind: 'keep', text: t1.endsWith(tail) ? t1.slice(0, t1.length - tail.length) : t1 }
}

/**
 * Where the end of `old` is in `next` when `next` keeps it whole after a keyword and adds lines after it (a state
 * brings its `created::` line), so a caret at the end of the text stays before those lines. An empty `old` ends its
 * first line. Null when `next` does not keep `old` that way.
 */
function endOfKept(old: string, next: string): number | null {
  if (old === '') return next.includes('\n') ? next.indexOf('\n') : null
  for (let i = next.indexOf(old); i >= 0; i = next.indexOf(old, i + 1)) {
    const end = i + old.length
    if ((i === 0 || next[i - 1] === ' ') && next[end] === '\n') return end
  }
  return null
}

/**
 * Where the caret goes when the text under it changes from `old` to `next`: it
 * keeps its distance from the end if the text after it is unchanged (a state
 * keyword added or removed in front), else it is clamped.
 */
export function mapCaret(old: string, caret: number, next: string): number {
  const after = old.slice(caret)
  if (after === '') {
    const end = endOfKept(old, next)
    if (end !== null) return end
  }
  if (next.endsWith(after)) return next.length - after.length
  return Math.max(0, Math.min(caret, next.length))
}
