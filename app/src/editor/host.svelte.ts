// The one block editor and everything that keeps it in step with the core:
// which block is edited, mounting the editor in its slot, running commands
// (and locking the editor while one changes the text), and what an output
// does to the editor. App.svelte owns the page; this owns the editor.
import { tick } from 'svelte'
import { errorCode, errorMessage } from '../api'
import type { Client } from '../lib/api'
import type { Action } from '../lib/keys'
import { UNSENT } from '../lib/notices'
import { restoreRemoved } from '../lib/paste'
import { settleCommand, typedState } from '../lib/settle'
import { utf16ToUtf8, utf8ToUtf16 } from '../lib/offsets'
import { afterOutput, afterRefresh, blockCommand, heldDelete, kindOf, mapCaret, type Step } from '../lib/sync'
import { visible } from '../lib/tree'
import type { BlockId, BlockView, Command, NameView, Notice, Output, StateView } from '../lib/types'
import { mountEditor, type BlockEditor, type EditorHooks } from './blockEditor'
import { linkSource } from './complete'
import { createCaretMenu, type MenuView, type Slash } from './menu'
import { createSlash } from './slash'
import { finishSplit, splitFailed, type SplitHost, type Splitting } from './split'

export interface EditorEnv {
  client: Client
  /** Every editable block now, in visible order (page outline; linked references are appended). */
  blocks(): BlockView[]
  /** The blocks up/down walk through from `id`; defaults to `blocks()` (the feed stops at an unloaded day). */
  order?(id: BlockId): BlockView[]
  /** The page key a block belongs to, for undo/redo; null if unknown. */
  pageOf(id: BlockId): string | null
  states(): StateView[]
  notify(n: Notice): void
  /** Draws a caret menu (the slash menu or the link completion), or hides it with null. */
  showMenu(which: CaretMenuKind, m: MenuView | null): void
  selectWithNeighbour(id: BlockId, dir: -1 | 1): void
  /** Test seams; default to mountEditor and the `[data-block-id="…"] .editor-slot` lookup. */
  mount?: typeof mountEditor
  slot?(id: BlockId): HTMLElement | null
}

export type CaretMenuKind = 'slash' | 'link'

const PASTE_SKIPPED = 'Paste skipped while a change is being saved; the text is still on the clipboard.'
/** The core's message for a block changed on disk while being edited. */
const CHANGED_ON_DISK = 'This block changed on disk while you were editing it.'

export class EditorHost {
  /** The block being edited; the editor itself lives outside Svelte's state. */
  editingId = $state<BlockId | null>(null)
  /** The mounted editor, or null. */
  private mounted: { id: BlockId; slot: HTMLElement; ed: BlockEditor; menus: Record<CaretMenuKind, Slash> } | null = null
  /** The split in flight, or null. */
  private splitting: Splitting | null = null
  /** Text-changing commands in flight that were issued while editing; the editor is locked meanwhile. */
  private locks = 0
  /** The block being edited when a command was issued. */
  private issuedFrom = new WeakMap<Command, BlockId | null>()
  /** The last text typed into each block and when (a running count): Keep mine sends it. */
  private typed = new Map<BlockId, { text: string; at: number }>()
  private typings = 0
  /** The configured state keywords, highlighted in the editor. */
  private keywords: string[] = []
  /** The block being edited and its state when its editor opened. */
  private opened: { id: BlockId; state: string | null } | null = null

  constructor(
    private env: EditorEnv,
    /** Session-only folding: the blocks under these are not shown. */
    private folded: Set<BlockId>,
  ) {}

  /** The mounted editor and its block, or null. */
  get editor(): { readonly id: BlockId; readonly ed: BlockEditor } | null {
    return this.mounted
  }

  /** What the split code may touch, over this host's private state. */
  private readonly splitHost: SplitHost = this.makeSplitHost()

  private makeSplitHost(): SplitHost {
    const read = () => this.splitting
    const write = (s: Splitting | null) => void (this.splitting = s)
    const editing = () => this.editingId
    const mounted = () => this.mounted
    return {
      get splitting() {
        return read()
      },
      set splitting(s) {
        write(s)
      },
      get editingId() {
        return editing()
      },
      get editor() {
        return mounted()
      },
      blockOf: (id) => this.blockOf(id),
      setTextDebounced: (id, text) => this.setTextDebounced(id, text),
      edit: (id, cursor16, text) => this.edit(id, cursor16, text),
      act: (id, a) => this.act(id, a),
      refreshMenus: () => this.refreshMenus(),
    }
  }

  // ---- commands ---------------------------------------------------------------

  /** Runs a command. Its output is applied by `apply`; `handled` may claim an error code. */
  exec(cmd: Command, handled?: (code: string | null) => boolean): Promise<void> {
    this.issuedFrom.set(cmd, this.editingId)
    const lock = kindOf(cmd.type) === 'text' && this.mounted !== null
    if (lock) this.setLocks(1)
    return this.env.client
      .run(cmd)
      .then(
        () => {},
        (e) => {
          if (!handled?.(errorCode(e))) this.refuseCommand(e, cmd)
        },
      )
      .finally(() => {
        if (lock) this.setLocks(-1)
      })
  }

  private setLocks(delta: number) {
    this.locks += delta
    if (!this.mounted) return
    this.mounted.ed.setEditable(this.locks === 0)
    if (this.locks === 0) this.mounted.ed.focus()
  }

  private refuse(e: unknown) {
    this.env.notify({ kind: 'refused', message: errorMessage(e) })
  }

  /** Shows why `cmd` failed; text sent to a block that is gone is shown to copy, never dropped. */
  private refuseCommand(e: unknown, cmd: Command) {
    if (cmd.type !== 'block.setText' || errorCode(e) !== 'unknownBlock') return this.refuse(e)
    this.env.notify({
      kind: 'conflict',
      page: this.env.pageOf(cmd.id) ?? '',
      block: cmd.id,
      mine: cmd.text,
      theirs: null,
      message: UNSENT,
    })
  }

  /**
   * Settles a conflict noticed at `since` (`typingMark`): block `id` gets `text`.
   * With `show` (Use theirs) pending typing is dropped and the editor of that
   * block shows `text` too. Else (Keep mine) text typed into the block after
   * the notice wins over the older `text`, whether or not the editor is still
   * open (a click on the notice leaves the block first).
   */
  async resolveConflict(id: BlockId, text: string, show: boolean, since: number) {
    const typed = this.typed.get(id)
    if (show) this.env.client.cancel(id)
    else if (typed && typed.at > since) text = typed.text
    let ok = true
    await this.exec({ type: 'block.setText', id, text }, () => ((ok = false), false))
    const editor = this.mounted
    if (!ok || editor?.id !== id || this.splitting) return
    const now = editor.ed.text()
    if (now === text) return
    if (show) editor.ed.setText(text, mapCaret(now, editor.ed.cursor16(), text))
    else this.setTextDebounced(id, now)
  }

  setTextDebounced(id: BlockId, text: string) {
    this.typed.set(id, { text, at: ++this.typings })
    this.env.client.setTextDebounced(id, text)
  }

  /** Marks now: text typed into a block after it is newer than a notice made now (`resolveConflict`). */
  typingMark(): number {
    return this.typings
  }

  setKeywords(k: string[]) {
    this.keywords = k
  }

  // ---- outputs ------------------------------------------------------------------

  /**
   * Applies an output's editor effects. `shown` says whether App replaced its view
   * with out.page; `before` is the edited block's text in the view it replaced.
   */
  apply(cmd: Command | undefined, out: Output, shown: boolean, before: string | null = null) {
    if (!cmd) return
    // A split ends with its answer, whichever page that shows.
    if (cmd.type === 'block.split' && this.splitting?.id === cmd.id) {
      background(finishSplit(this.splitHost, this.splitting, out))
      return
    }
    if (!shown) return
    // A state the core set (Ctrl Enter, the label, the slash menu) came with its lines: only a later change by hand
    // settles. Unless the block already had another state than when the editor opened (typed by hand before).
    const o = this.opened
    if (o && setsStateOf(cmd, o.id) && before !== null && this.editingId === o.id && typedState(before, this.keywords) === o.state) {
      const b = this.blockOf(o.id)
      if (b) o.state = b.state
    }
    // While a split runs, the old editor's text is the user's, not the core's.
    if (cmd.type === 'block.setText' && this.splitting) return
    if (cmd.type === 'page.get') return background(this.refreshed(cmd.key, before))
    const fb = out.focus ? this.blockOf(out.focus.id) : undefined
    const step = afterOutput({
      kind: kindOf(cmd.type),
      editing: this.editingId,
      issuedFrom: this.issuedFrom.get(cmd) ?? null,
      editedText: this.editingId === null ? null : (this.blockOf(this.editingId)?.text ?? null),
      focus: fb && out.focus ? { id: fb.id, cursor16: utf8ToUtf16(fb.text, out.focus.at) } : null,
      sent: cmd.type === 'block.setText' ? { id: cmd.id, text: cmd.text } : undefined,
      current: this.mounted?.ed.text(),
    })
    background(this.runStep(step, cmd.type === 'block.setText' ? cmd.id : null))
  }

  private async runStep(step: Step, typedIn: BlockId | null) {
    const editor = this.mounted
    switch (step.do) {
      case 'none':
        return this.reconcile(null)
      case 'close':
        return this.close()
      case 'keep':
        // Moving the row in the DOM loses the DOM selection: set it again.
        return this.reconcile(editor ? { text: editor.ed.text(), cursor16: editor.ed.cursor16() } : null, true)
      case 'setText': {
        if (step.extra && typedIn !== null) this.setTextDebounced(typedIn, step.text)
        const cursor16 = editor ? mapCaret(editor.ed.text(), editor.ed.cursor16(), step.text) : step.text.length
        return this.reconcile({ text: step.text, cursor16 }, true)
      }
      case 'edit': {
        const b = this.blockOf(step.id)
        if (!b) return
        const text = b.text + (step.extra ?? '')
        if (step.extra && typedIn !== null) {
          // The typed text moves to the block the caret moved to.
          this.env.client.cancel(typedIn)
          this.typed.delete(typedIn)
          this.setTextDebounced(step.id, text)
        }
        return this.edit(step.id, step.cursor16, text)
      }
    }
  }

  /** The shown page `key` was loaded again: the edit in progress stays (§6). */
  private refreshed(key: string, before: string | null) {
    const id = this.editingId
    const editor = this.mounted
    // While a split runs, the old editor's text is the user's; the split's answer settles it.
    if (this.splitting) return this.reconcile(null)
    const step = afterRefresh({
      editing: id,
      editorText: editor && editor.id === id ? editor.ed.text() : null,
      before,
      after: id === null ? null : (this.blockOf(id)?.text ?? null),
    })
    if (step.do !== 'conflict') return this.runStep(step, null)
    this.env.notify({
      kind: 'conflict',
      page: this.env.pageOf(id!) ?? key,
      block: id!,
      mine: step.mine,
      theirs: step.theirs,
      message: CHANGED_ON_DISK,
    })
    return this.reconcile(null)
  }

  /** A background `block.setText` (`cmd`) was refused: show the core's text again. */
  backgroundFailed(e: unknown, cmd: Command) {
    this.refuseCommand(e, cmd)
    const editor = this.mounted
    if (cmd.type !== 'block.setText' || editor?.id !== cmd.id || this.splitting) return
    const b = this.blockOf(cmd.id)
    if (b) editor.ed.setText(b.text, editor.ed.cursor16())
  }

  // ---- the editor -------------------------------------------------------------------

  blockOf(id: BlockId): BlockView | undefined {
    return this.env.blocks().find((b) => b.id === id)
  }

  /** Destroys the editor; a split in flight keeps what the user typed. */
  private dropEditor() {
    const s = this.splitting
    if (this.mounted && s?.id === this.mounted.id && s.t1 === undefined) s.t1 = this.mounted.ed.text()
    this.destroyEditor()
  }

  private destroyEditor() {
    this.closeMenu()
    this.mounted?.ed.destroy()
    this.mounted = null
  }

  /** Ends editing; sends nothing but the settle of a state typed or removed by hand. */
  close() {
    const text = this.editedText()
    this.dropEditor()
    this.editingId = null
    this.settle(text)
  }

  /** The text of the edited block now: the editor's, else the shown block's. */
  private editedText(): string | null {
    const o = this.opened
    if (!o) return null
    if (this.mounted?.id === o.id) return this.mounted.ed.text()
    return this.blockOf(o.id)?.text ?? null
  }

  /**
   * The editor of the block opened at `opened` closed with `text`: if its state changed since it opened,
   * `block.settle` asks the core for the lines that state brings (after the pending typing, as the queue keeps
   * order). A block gone by then is no error.
   */
  private settle(text: string | null) {
    const o = this.opened
    this.opened = null
    if (!o || text === null) return
    const cmd = settleCommand(o.id, o.state, text, this.keywords)
    if (cmd) void this.exec(cmd, (code) => code === 'unknownBlock')
  }

  /**
   * A new notes folder is open: block ids start again, so what was typed into the old folder's blocks is
   * forgotten (Keep mine on a block of the new folder must never send old text).
   */
  newFolder() {
    this.typed.clear()
    this.opened = null
  }

  /** Edits block `id` with the caret at `cursor16` (UTF-16); any other editor goes first. */
  async edit(id: BlockId, cursor16: number, text?: string) {
    const b = this.blockOf(id)
    if (!b) return
    if (this.editingId !== null && this.editingId !== id) {
      const left = this.editedText()
      this.dropEditor()
      void this.env.client.flush()
      this.settle(left)
    }
    if (this.opened?.id !== id) this.opened = { id, state: b.state }
    this.editingId = id
    await this.reconcile({ text: text ?? b.text, cursor16 }, true)
  }

  editAtEnd(id: BlockId) {
    const b = this.blockOf(id)
    if (b) void this.edit(id, b.text.length)
  }

  /** Leaves the block: flushes its text; the output renders it again. */
  leave() {
    if (this.editingId === null) return
    this.close()
    void this.env.client.flush()
  }

  /**
   * Makes the editor match `editingId` once the DOM has settled: mounts it in the
   * block's slot (again, if the slot was rebuilt), and applies `target` if given.
   */
  async reconcile(target: { text: string; cursor16: number } | null, focus = false) {
    await tick()
    const id = this.editingId
    if (id === null) return this.close()
    const slot = this.env.slot
      ? this.env.slot(id)
      : document.querySelector<HTMLElement>(`[data-block-id="${id}"] .editor-slot`)
    if (!slot) return this.close()
    const editor = this.mounted
    if (editor && editor.id === id && editor.slot === slot) {
      // Focus first: focusing takes the DOM selection, which a moved row has lost.
      if (focus) editor.ed.focus()
      if (target) editor.ed.setText(target.text, target.cursor16)
      return
    }
    // A new block, or Svelte rebuilt the slot: mount (again), keeping the text and caret.
    const keep = editor?.id === id ? editor.ed : null
    const text = target?.text ?? keep?.text() ?? this.blockOf(id)?.text ?? ''
    const cursor16 = target?.cursor16 ?? keep?.cursor16() ?? text.length
    this.destroyEditor()
    const canApply = () => this.locks === 0 && this.splitting === null
    // Link completion goes first: while it has the caret, the slash menu stays closed.
    const link = createCaretMenu(linkSource(() => this.pageNames()), {
      show: (m) => this.env.showMenu('link', m),
      canApply,
    })
    const slash = createSlash({
      states: () => this.env.states(),
      show: (m) => this.env.showMenu('slash', m),
      // `run` sends the pending text (without the `/query`) first.
      setState: (keyword) => void this.exec({ type: 'blocks.setState', ids: [id], keyword }),
      canApply,
      blocked: () => link.active(),
    })
    const ed = (this.env.mount ?? mountEditor)(slot, text, cursor16, this.hooksFor(id), {
      keywords: this.keywords,
      editable: this.locks === 0,
      extensions: [link.extension, slash.extension],
    })
    this.mounted = { id, slot, ed, menus: { link, slash } }
    ed.focus()
  }

  /** The page names for link completion; a failure is shown and offers none. */
  private pageNames(): Promise<NameView[]> {
    return this.env.client.run({ type: 'pages.list' }).then(
      (out) => out.names ?? [],
      (e) => {
        this.refuse(e)
        return []
      },
    )
  }

  /** Applies item `i` of the open caret menu `which`. */
  chooseMenu(which: CaretMenuKind, i: number) {
    this.mounted?.menus[which].choose(i)
  }

  refreshMenus() {
    const e = this.mounted
    // Link completion first: while it has the caret, the slash menu stays closed.
    e?.ed.run((v) => {
      e.menus.link.sync(v)
      e.menus.slash.sync(v)
    })
  }

  closeMenu() {
    this.mounted?.menus.link.close()
    this.mounted?.menus.slash.close()
  }

  private hooksFor(id: BlockId): EditorHooks {
    return {
      onChange: (text) => {
        // During a split the typed text is carried over when its output arrives.
        if (this.splitting?.id !== id) this.setTextDebounced(id, text)
      },
      onAction: (a, ctx) => {
        // Any outline key moves things: the menu would sit at stale coordinates.
        this.closeMenu()
        if (a === 'leave') return this.leave()
        if (this.locks > 0) return
        if (this.splitting?.id === id) this.splitting.queued.push({ a, at: ctx.cursor16 })
        else this.act(id, a)
      },
      onDelete: (forward, ctx) => {
        // During a split, a delete at the new block's part waits for the new block.
        const s = this.splitting
        if (s?.id !== id || this.locks > 0) return false
        const held = heldDelete(forward ? 'Delete' : 'Backspace', ctx.cursor16, s.c)
        if (!held) return false
        s.queued.push({ a: held, at: ctx.cursor16 })
        return true
      },
      // During a split, the text before the split caret is the old block's.
      caretFloor: () => (this.splitting?.id === id ? this.splitting.c : null),
      onOutlinePaste: (text) => {
        if (this.mounted?.id !== id) return
        // The editor is locked or a split runs: the text stays in the clipboard.
        if (this.locks > 0 || this.splitting) return this.env.notify({ kind: 'refused', message: PASTE_SKIPPED })
        const ed = this.mounted.ed
        // A selection goes first; it comes back if the core refuses the paste.
        const { from, to } = ed.selection()
        const removed = ed.text().slice(from, to)
        ed.insert('')
        void this.exec({ type: 'block.paste', id, at: utf16ToUtf8(ed.text(), ed.cursor16()), text }, () => {
          if (removed) this.putBack(id, from, removed)
          return false // The refusal is still shown.
        })
      },
    }
  }

  /** Puts `slice` back into block `id` at `at` (UTF-16): in the editor if it is still there, and to the core. */
  private putBack(id: BlockId, at: number, slice: string) {
    const ed = this.mounted?.id === id ? this.mounted.ed : null
    const base = ed ? ed.text() : this.blockOf(id)?.text
    if (base === undefined) return
    const r = restoreRemoved(base, at, slice)
    this.setTextDebounced(id, r.text)
    ed?.setText(r.text, r.cursor16)
  }

  // ---- actions ------------------------------------------------------------------

  /** Starts a split of block `id` at the caret; one split at a time. */
  private split(id: BlockId, ed: BlockEditor) {
    // A second one would orphan what was typed during the first.
    if (this.splitting) return
    ed.insert('') // A selection goes first.
    const s: Splitting = { id, t0: ed.text(), c: ed.cursor16(), queued: [] }
    void this.exec({ type: 'block.split', id, at: utf16ToUtf8(s.t0, s.c) }, (code) => splitFailed(this.splitHost, s, code))
    this.splitting = s
  }

  /** An outline key pressed in the editor of block `id`. */
  act(id: BlockId, a: Action) {
    const ed = this.mounted?.id === id ? this.mounted.ed : null
    if (!ed) return
    switch (a) {
      case 'split':
        this.split(id, ed)
        return
      case 'merge':
        void this.exec({ type: 'block.merge', id }, (code) => code === 'noPrevious')
        return
      case 'indent':
      case 'outdent':
      case 'moveUp':
      case 'moveDown':
        void this.exec({ type: blockCommand[a], ids: [id] })
        return
      case 'cycleState':
        void this.exec({ type: 'block.cycleState', id })
        return
      case 'removeState':
        // The slash menu's route: the core removes the keyword and the lines that come with it.
        void this.exec({ type: 'blocks.setState', ids: [id], keyword: null })
        return
      case 'undo':
      case 'redo': {
        const page = this.env.pageOf(id)
        if (page !== null) void this.exec({ type: a === 'undo' ? 'history.undo' : 'history.redo', page })
        return
      }
      case 'focusPrev':
      case 'focusNext': {
        const shown = visible(this.env.order?.(id) ?? this.env.blocks(), this.folded)
        const i = shown.findIndex((b) => b.id === id)
        const next = shown[a === 'focusPrev' ? i - 1 : i + 1]
        if (i >= 0 && next) void this.edit(next.id, a === 'focusPrev' ? next.text.length : 0)
        return
      }
      case 'leave':
        this.leave()
        return
      case 'extendUp':
      case 'extendDown':
        this.env.selectWithNeighbour(id, a === 'extendUp' ? -1 : 1)
        return
    }
  }
}

/** Whether `cmd` sets block `id`'s state through the core (which writes the lines that state brings). */
function setsStateOf(cmd: Command, id: BlockId): boolean {
  if (cmd.type === 'block.cycleState' || cmd.type === 'block.stepState') return cmd.id === id
  return cmd.type === 'blocks.setState' && cmd.ids.includes(id)
}

/** Editor updates run after `apply` returns; their failures are logged, never unhandled. */
function background(p: Promise<unknown>) {
  p.catch((e) => console.error('editor update failed', e))
}
