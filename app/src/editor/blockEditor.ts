// The one CodeMirror instance: it exists only for the block being edited.
// There is no CodeMirror history; undo is the core's.
import { Annotation, Compartment, EditorSelection, EditorState, Prec, type Extension } from '@codemirror/state'
import { EditorView, drawSelection, keymap } from '@codemirror/view'
import { defaultKeymap, deleteCharBackward, deleteCharForward, insertNewline } from '@codemirror/commands'
import { decide, type Action, type Ctx } from '../lib/keys'
import { isOutline } from '../lib/paste'
import { isMac as mac } from '../lib/platform'
import { highlighting } from './highlight'
import { lockedKeyText } from './lockedKeys'

export interface EditorHooks {
  onChange(text: string): void
  onAction(a: Action, ctx: { cursor16: number }): void
  /** Pasted text that holds bullet lines; the editor does not paste it itself. */
  onOutlinePaste?(text: string): void
  /**
   * A plain Backspace or Delete with no selection, before the editor deletes
   * anything; returning true takes the key away from the editor.
   */
  onDelete?(forward: boolean, ctx: { cursor16: number }): boolean
  /** A key that types text, pressed while the editor is locked; the host inserts it once the lock ends. */
  onLockedText?(text: string): void
  /** The lowest offset (UTF-16) the keyboard may move the caret to, or null for none. */
  caretFloor?(): number | null
}

export interface BlockEditor {
  destroy(): void
  text(): string
  setText(text: string, cursor16: number): void
  /** Replaces the selection with `text` as if typed (it reaches `onChange`). */
  insert(text: string): void
  /** The caret, as a UTF-16 offset. */
  cursor16(): number
  /** The main selection, as UTF-16 offsets. */
  selection(): { from: number; to: number }
  /** Deletes one character before (or after) the caret, as if typed (it reaches `onChange`). */
  deleteChar(forward: boolean): void
  /**
   * Whether the user can type; off while a command that changes the text runs. The editor keeps the focus: keys that
   * type text go to `onLockedText`, the rest do nothing.
   */
  setEditable(on: boolean): void
  focus(): void
  /** Runs `f` with the CodeMirror view (the caret menus read it). */
  run(f: (view: EditorView) => void): void
}

/** Marks changes made by `setText`, which are not the user's typing. */
const external = Annotation.define<boolean>()

/** Colours from the tokens; a theme beats CodeMirror's base theme, plain CSS does not. */
const theme = EditorView.theme({
  '&': { color: 'var(--text)', backgroundColor: 'var(--editor-bg, var(--edit))' },
  '.cm-content': { caretColor: 'var(--text)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--text)' },
  '.cm-selectionBackground': { backgroundColor: 'var(--hover)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
    backgroundColor: 'var(--select)',
  },
  '.cm-content ::selection': { backgroundColor: 'var(--select)' },
})

function clamp(n: number, max: number): number {
  return Math.max(0, Math.min(n, max))
}

/** Whether `pos` is on the first (`up`) or last visual line of the text. */
function atEdge(view: EditorView, pos: number, up: boolean): boolean {
  const doc = view.state.doc
  const line = doc.lineAt(pos)
  if (up ? line.number !== 1 : line.number !== doc.lines) return false
  // A wrapped line has several visual lines; only the outermost one counts.
  const here = view.coordsAtPos(pos)
  const edge = view.coordsAtPos(up ? 0 : doc.length)
  if (!here || !edge) return true
  const half = view.defaultLineHeight / 2
  return up ? here.top - edge.top < half : edge.bottom - here.bottom < half
}

/**
 * Keeps keyboard caret moves at or after `floor()`. While a split runs, the old
 * editor still shows the old block's text before the split caret; Home or an
 * arrow key must not walk into it, or the caret (and keys replayed at it) would
 * land at the start of the new block instead of where the user put it. Pointer
 * moves stay free: a click there edits the old block (the carry-over keeps it).
 */
export function caretFloor(floor: () => number | null): Extension {
  return EditorState.transactionFilter.of((tr) => {
    const n = floor()
    if (n === null || !tr.selection || !tr.isUserEvent('select') || tr.isUserEvent('select.pointer')) return tr
    const sel = tr.selection
    if (sel.ranges.every((r) => r.from >= n)) return tr
    const up = (p: number) => Math.min(Math.max(p, n), tr.newDoc.length)
    const ranges = sel.ranges.map((r) => EditorSelection.range(up(r.anchor), up(r.head)))
    return [tr, { selection: EditorSelection.create(ranges, sel.mainIndex), sequential: true }]
  })
}

function ctxOf(view: EditorView): Ctx {
  const sel = view.state.selection.main
  return {
    atStart: sel.from === 0,
    selectionEmpty: sel.empty,
    onFirstLine: atEdge(view, sel.head, true),
    onLastLine: atEdge(view, sel.head, false),
    mac,
  }
}

export function mountEditor(
  parent: HTMLElement,
  text: string,
  cursor16: number,
  hooks: EditorHooks,
  /** `extensions` see keys before the outline keys do (the caret menus). */
  opts: { keywords?: string[]; editable?: boolean; extensions?: Extension[] } = {},
): BlockEditor {
  const editable = new Compartment()
  const keys = Prec.highest(
    EditorView.domEventHandlers({
      keydown(e, view) {
        if (e.isComposing) return false
        if (view.state.readOnly) {
          // Locked: a typed character waits for the lock to end; every other key is ignored, as the editor is read-only.
          const text = lockedKeyText({
            key: e.key,
            shift: e.shiftKey,
            ctrl: e.ctrlKey,
            alt: e.altKey,
            meta: e.metaKey,
            altGraph: e.getModifierState('AltGraph'),
          })
          if (text === null) return false
          e.preventDefault()
          hooks.onLockedText?.(text)
          return true
        }
        const ctx = ctxOf(view)
        const action = decide({ key: e.key, shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey, meta: e.metaKey }, ctx)
        if (!action) {
          const plain = !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey
          if (!plain || !ctx.selectionEmpty || (e.key !== 'Backspace' && e.key !== 'Delete')) return false
          if (!hooks.onDelete?.(e.key === 'Delete', { cursor16: view.state.selection.main.head })) return false
          e.preventDefault()
          return true
        }
        e.preventDefault()
        hooks.onAction(action, { cursor16: view.state.selection.main.head })
        return true
      },
      paste(e) {
        const text = e.clipboardData?.getData('text/plain') ?? ''
        if (!hooks.onOutlinePaste || !isOutline(text)) return false
        e.preventDefault()
        hooks.onOutlinePaste(text)
        return true
      },
    }),
  )
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: text,
      selection: EditorSelection.cursor(clamp(cursor16, text.length)),
      extensions: [
        ...(opts.extensions ?? []),
        keys,
        caretFloor(() => hooks.caretFloor?.() ?? null),
        keymap.of([{ key: 'Shift-Enter', run: insertNewline }, ...defaultKeymap]),
        drawSelection(),
        EditorView.lineWrapping,
        theme,
        editable.of(EditorState.readOnly.of(!(opts.editable ?? true))),
        highlighting(opts.keywords ?? []),
        EditorView.updateListener.of((u) => {
          if (u.docChanged && !u.transactions.some((tr) => tr.annotation(external))) {
            hooks.onChange(u.state.doc.toString())
          }
        }),
      ],
    }),
  })

  return {
    destroy: () => view.destroy(),
    text: () => view.state.doc.toString(),
    setText(next, c16) {
      const cur = view.state.doc.toString()
      view.dispatch({
        changes: next === cur ? undefined : { from: 0, to: cur.length, insert: next },
        selection: EditorSelection.cursor(clamp(c16, next.length)),
        annotations: external.of(true),
        scrollIntoView: true,
      })
    },
    insert(t) {
      view.dispatch(view.state.replaceSelection(t), { scrollIntoView: true, userEvent: 'input.type' })
    },
    deleteChar(forward) {
      ;(forward ? deleteCharForward : deleteCharBackward)(view)
    },
    cursor16: () => view.state.selection.main.head,
    selection: () => ({ from: view.state.selection.main.from, to: view.state.selection.main.to }),
    setEditable(on) {
      view.dispatch({ effects: editable.reconfigure(EditorState.readOnly.of(!on)) })
    },
    focus: () => view.focus(),
    run: (f) => f(view),
  }
}
