// An in-memory block editor for tests that build an `EditorHost` without a DOM (the host's `mount` seam).
import { EditorSelection, EditorState } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import type { BlockEditor, EditorHooks, mountEditor } from './blockEditor'

export interface FakeMountOptions {
  /** Called with every editor mounted and its hooks. */
  mounted?(ed: BlockEditor, hooks: EditorHooks): void
  /** True: the fake view cannot place the caret (`coordsAtPos` answers null), as CodeMirror does off-screen. */
  noCaretBox?(): boolean
}

/** A mount whose editor holds the text and a caret, no selection. */
export function fakeMount(o: FakeMountOptions = {}): typeof mountEditor {
  return (_parent, text, cursor16, h, opts = {}) => {
    let t = text
    let c = Math.min(cursor16, text.length)
    const ed: BlockEditor = {
      destroy() {},
      text: () => t,
      setText(next, at) {
        t = next
        c = Math.max(0, Math.min(at, next.length))
      },
      insert(s) {
        t = t.slice(0, c) + s + t.slice(c)
        c += s.length
        h.onChange(t)
      },
      cursor16: () => c,
      selection: () => ({ from: c, to: c }),
      deleteChar() {},
      setEditable() {},
      focus() {},
      // A view holding the text now, with the editor's extensions (the caret menus).
      run(f) {
        const state = EditorState.create({ doc: t, selection: EditorSelection.cursor(c), extensions: opts.extensions ?? [] })
        // The caret's box: the caret offset as its left edge, one line high.
        const coordsAtPos = (pos: number) => (o.noCaretBox?.() ? null : { left: pos, right: pos, top: 10, bottom: 20 })
        const contentDOM = { getBoundingClientRect: () => ({ left: 1, top: 2, right: 3, bottom: 4 }) }
        f({ state, requestMeasure() {}, coordsAtPos, contentDOM } as unknown as EditorView)
      },
    }
    o.mounted?.(ed, h)
    return ed
  }
}
