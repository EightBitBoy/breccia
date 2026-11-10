// A split (Enter inside a block) in flight: the typed text follows the caret.
// While the core splits the block, the old editor keeps taking keys; when the
// answer arrives, what was typed at the split caret moves to the new block and
// the keys pressed meanwhile are replayed there.
import type { Action } from '../lib/keys'
import { carryOver, type Held } from '../lib/sync'
import type { BlockId, BlockView, Output } from '../lib/types'
import type { BlockEditor } from './blockEditor'

export interface Splitting {
  id: BlockId
  /** The text and caret at the split. */
  t0: string
  c: number
  /** The old editor's text, if it was destroyed before the output arrived. */
  t1?: string
  /** Actions pressed meanwhile, with the caret in the old editor. */
  queued: Queued[]
  /** For a replayed split: where the user's caret was, instead of the live one. */
  resume?: number
}

/** An outline key, or a delete held for the new block, pressed during a split. */
export type Queued = { a: Action | Held; at: number }

/** What the split code needs from the editor host (`EditorHost` passes an adapter over its state). */
export interface SplitHost {
  /** The split in flight; set by the host when it sends `block.split`. */
  splitting: Splitting | null
  /** The block being edited, or null. */
  readonly editingId: BlockId | null
  /** The mounted editor and its block, or null. */
  readonly editor: { id: BlockId; ed: BlockEditor } | null
  blockOf(id: BlockId): BlockView | undefined
  setTextDebounced(id: BlockId, text: string): void
  edit(id: BlockId, cursor16: number, text?: string): Promise<void>
  act(id: BlockId, a: Action): void
  /** Lets the caret menus look for a query in the editor's text now. */
  refreshMenus(): void
}

/** The old block's text now: the live editor, or what it held when it went. */
function textAfter(h: SplitHost, s: Splitting): { t1: string; here: boolean } {
  const here = h.editor?.id === s.id && h.editingId === s.id
  return { t1: s.t1 ?? (here ? h.editor!.ed.text() : s.t0), here }
}

/** The split's output arrived: carry the typed text over and replay the queued keys. */
export async function finishSplit(h: SplitHost, s: Splitting, out: Output) {
  h.splitting = null
  const { t1, here } = textAfter(h, s)
  const r = carryOver(s.t0, s.c, t1)
  const nb = out.focus ? h.blockOf(out.focus.id) : undefined
  if (r.kind === 'keep' || !nb) {
    // The user edited before the caret: the old block keeps their text.
    const kept = r.kind === 'keep' ? r.text : t1.slice(0, s.c)
    if (kept !== s.t0.slice(0, s.c)) h.setTextDebounced(s.id, kept)
    if (nb) {
      if (here) await h.edit(nb.id, 0)
      return
    }
    // The new block is not shown (a reference's root split off a sibling outside
    // it): what was typed at the split caret still goes there, and the old
    // editor stops showing the part that moved.
    const fresh = out.focus && out.page?.blocks.find((b) => b.id === out.focus!.id)
    if (fresh && r.kind === 'carry' && r.d) h.setTextDebounced(fresh.id, r.d + fresh.text)
    if (here) h.editor!.ed.setText(kept, Math.min(h.editor!.ed.cursor16(), kept.length))
    return
  }
  const text = r.d + nb.text
  if (r.d) h.setTextDebounced(nb.id, text)
  if (!here) return
  // The new block starts where the split was: old-editor carets shift by `c`.
  const live = h.editor!.ed.cursor16()
  const caret = (s.resume !== undefined && t1 === s.t0 ? s.resume : live) - s.c
  await h.edit(nb.id, Math.max(0, Math.min(caret, text.length)), text)
  // The carried text may end in a query (`[[Pro`): a fresh editor would wait for the next key.
  // Outline keys pressed during the split close the menus anyway.
  if (r.d && !s.queued.length) h.refreshMenus()
  replay(h, s.queued.map((q) => ({ a: q.a, at: q.at - s.c })))
}

/** The split was refused; returns whether the refusal is handled (inside a fence). */
export function splitFailed(h: SplitHost, s: Splitting, code: string | null): boolean {
  if (h.splitting === s) h.splitting = null
  const { t1, here } = textAfter(h, s)
  const ed = here ? h.editor!.ed : null
  if (code !== 'insideFence') {
    if (t1 !== s.t0) h.setTextDebounced(s.id, t1)
    return false
  }
  // Inside a fence, Enter is a newline at the split caret.
  const at = t1.startsWith(s.t0.slice(0, s.c)) ? s.c : (ed?.cursor16() ?? t1.length)
  const text = t1.slice(0, at) + '\n' + t1.slice(at)
  h.setTextDebounced(s.id, text)
  if (ed) {
    const caret = ed.cursor16()
    ed.setText(text, caret >= at ? caret + 1 : caret)
    replay(h, s.queued.map((q) => ({ a: q.a, at: q.at >= at ? q.at + 1 : q.at })))
  }
  return true
}

/** Runs actions pressed during a split, in order, at their carets in the current editor. */
export function replay(h: SplitHost, queue: Queued[]) {
  if (!h.editor || !queue.length) return
  let resume = h.editor.ed.cursor16()
  while (queue.length && h.editor && !h.splitting) {
    const { a, at } = queue.shift()!
    const ed = h.editor.ed
    ed.setText(ed.text(), Math.max(0, at))
    if (a === 'deleteBack' || a === 'deleteForward') {
      // Backspace at the start of the new block merges it, as it would have. The
      // merge locks the editor; keys after it are dropped, as during any lock.
      if (a === 'deleteBack' && at <= 0) {
        h.act(h.editor.id, 'merge')
        return
      }
      const before = ed.text().length
      ed.deleteChar(a === 'deleteForward')
      // A delete before the user's caret moves it left.
      if (at < resume || (a === 'deleteBack' && at === resume)) resume += ed.text().length - before
      continue
    }
    h.act(h.editor.id, a)
    // The block is being deleted: keys after it are dropped, as after a merge.
    if (a === 'deleteBlock') return
    const s = h.splitting as Splitting | null
    if (s) {
      // A replayed split queues the rest; its carets are already in this editor.
      s.queued.push(...queue)
      s.resume = resume
      return
    }
  }
  h.editor?.ed.setText(h.editor.ed.text(), resume)
}
