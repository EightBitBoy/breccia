// Light live formatting for the block editor. Highlighting only: what the
// text means (links, tags, task states) is decided by the core.
import { markdown } from '@codemirror/lang-markdown'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import type { Extension } from '@codemirror/state'
import { Decoration, EditorView, MatchDecorator, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'
import { dimPattern, dimRange } from '../lib/dim'

const style = HighlightStyle.define([
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.heading, fontWeight: '700' },
  { tag: t.link, color: 'var(--link)' },
  { tag: t.url, color: 'var(--link)' },
  { tag: t.monospace, color: 'var(--tag)' },
  { tag: t.processingInstruction, color: 'var(--muted)' },
  { tag: t.quote, color: 'var(--muted)' },
])

const dim = Decoration.mark({ class: 'cm-dim' })

/** Gives `[[`, `]]`, a tag's `#` and a leading task keyword the class `cm-dim`. */
function dimmer(keywords: string[]): Extension {
  const matcher = new MatchDecorator({
    regexp: dimPattern(keywords),
    decorate(add, from, _to, match, view) {
      const r = dimRange(match)
      // `from` is where the match starts in the document; a keyword only counts on the first line.
      const start = from - match.index!
      if (r.keyword && view.state.doc.lineAt(from).number !== 1) return
      if (r.to > r.from) add(start + r.from, start + r.to, dim)
    },
  })
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      constructor(view: EditorView) {
        this.decorations = matcher.createDeco(view)
      }
      update(u: ViewUpdate) {
        this.decorations = matcher.updateDeco(u, this.decorations)
      }
    },
    { decorations: (v) => v.decorations },
  )
}

export function highlighting(keywords: string[]): Extension {
  return [markdown({ addKeymap: false }), syntaxHighlighting(style), dimmer(keywords)]
}
