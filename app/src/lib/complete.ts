// `[[` and `#` autocomplete: finds the link or tag being typed before the caret,
// ranks page names against it, and writes the chosen name as link syntax.
import type { NameView } from './types'

export interface LinkQuery {
  kind: 'page' | 'tag'
  /** The `[[` (or the `#` of a tag), in UTF-16 units of the whole text. */
  from: number
  /** The caret, or past a `]]` right after it when the query is bracketed. */
  to: number
  query: string
}

export type CompletionItem = { kind: 'page'; name: string; label: string } | { kind: 'create'; name: string; label: string }

const BRACKETED = /\[\[([^[\]\n]*)$/
const PLAIN_TAG = /(^|\s)#([^\s#,;!?()[\]{}"'`]*)$/

/** The link or tag being typed at the caret, between `before` and `after`; null if none. */
export function linkQuery(before: string, after: string): LinkQuery | null {
  const caret = before.length
  const b = BRACKETED.exec(before)
  if (b) {
    const tag = b.index > 0 && before[b.index - 1] === '#'
    return {
      kind: tag ? 'tag' : 'page',
      from: tag ? b.index - 1 : b.index,
      to: caret + (after.startsWith(']]') ? 2 : 0),
      query: b[1],
    }
  }
  const t = PLAIN_TAG.exec(before)
  if (t) return { kind: 'tag', from: t.index + t[1].length, to: caret, query: t[2] }
  return null
}

/** Whether the code points of `q` appear in `s` in order. */
function isSubsequence(q: string, s: string): boolean {
  const want = [...q]
  let i = 0
  for (const ch of s) if (i < want.length && ch === want[i]) i++
  return i === want.length
}

/** How well `name` matches `query`, best first: prefix, word prefix, substring, subsequence; null for none. */
export function fuzzyTier(query: string, name: string): 0 | 1 | 2 | 3 | null {
  const q = query.toLowerCase()
  const n = name.toLowerCase()
  if (n.startsWith(q)) return 0
  if (n.split(/[\s\-_/.]+/).some((w) => w.startsWith(q))) return 1
  if (n.includes(q)) return 2
  if (isSubsequence(q, n)) return 3
  return null
}

/** Whether `[[name]]` parses as one link: the core's bracket link stops at any `[` or `]`, and `|` starts the shown text. */
function linkable(name: string): boolean {
  return !/[[\]|]/.test(name)
}

/**
 * The menu for `query`: the best `limit` names, then "Create page" unless a name
 * is exactly the query. Names the link syntax cannot hold are never offered.
 */
export function completions(names: NameView[], query: string, limit = 8): CompletionItem[] {
  const q = query.trim()
  const byKey = (a: NameView, b: NameView) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
  const offered = names.filter((n) => linkable(n.name))
  if (!q) return offered.sort(byKey).slice(0, limit).map(pageItem)
  const ranked = offered
    .map((n) => ({ n, tier: fuzzyTier(q, n.name) }))
    .filter((r): r is { n: NameView; tier: 0 | 1 | 2 | 3 } => r.tier !== null)
    .sort((a, b) => a.tier - b.tier || a.n.name.length - b.n.name.length || a.n.name.localeCompare(b.n.name))
    .slice(0, limit)
    .map((r) => pageItem(r.n))
  const lower = q.toLowerCase()
  if (!linkable(q) || names.some((n) => n.key === lower)) return ranked
  return [...ranked, { kind: 'create', name: q, label: `Create page “${q}”` }]
}

function pageItem(n: NameView): CompletionItem {
  return { kind: 'page', name: n.name, label: n.name }
}

/** The link syntax for `name`; a tag is bracketed unless the name is plainly one word. */
export function linkText(kind: 'page' | 'tag', name: string): string {
  if (kind === 'page') return `[[${name}]]`
  return /^[\p{L}\p{N}_\-/]+$/u.test(name) ? `#${name}` : `#[[${name}]]`
}
