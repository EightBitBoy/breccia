// Pure logic of the network view (spec §7.11): lines, filters, sizes, search. No DOM, no sigma.
import type { GraphNode, GraphView } from './types'

export type Limit = { kind: 'folder'; folder: string } | { kind: 'tag'; key: string }

export interface GraphFilters {
  hideJournals: boolean
  hideTagOnly: boolean
  limit: Limit | null
}

export const DEFAULT_FILTERS: GraphFilters = { hideJournals: true, hideTagOnly: false, limit: null }

export type DotClass = 'page' | 'journal' | 'tag' | 'missing'

export function dotClass(n: GraphNode): DotClass {
  if (n.kind === 'journal') return 'journal'
  if (n.tagOnly) return 'tag'
  if (!n.exists) return 'missing'
  return 'page'
}

/** One unordered pair `[a, b]` with `a < b` per linked pair, sorted. */
export function lines(view: GraphView): [number, number][] {
  const n = view.nodes.length
  // One number `a * n + b` per pair: a numeric sort of a typed array is far cheaper than sorting tuples.
  const keys = new Float64Array(view.edges.length)
  let count = 0
  for (const [from, to] of view.edges) {
    if (from === to) continue
    keys[count++] = Math.min(from, to) * n + Math.max(from, to)
  }
  const sorted = keys.subarray(0, count).sort()
  const out: [number, number][] = []
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] === sorted[i - 1]) continue
    const a = Math.floor(sorted[i] / n)
    out.push([a, sorted[i] - a * n])
  }
  return out
}

export function neighbours(count: number, ls: [number, number][]): number[][] {
  const out: number[][] = Array.from({ length: count }, () => [])
  for (const [a, b] of ls) {
    out[a].push(b)
    out[b].push(a)
  }
  return out
}

export function shownNodes(view: GraphView, f: GraphFilters): boolean[] {
  const shown = view.nodes.map((n) => !((f.hideJournals && n.kind === 'journal') || (f.hideTagOnly && n.tagOnly)))
  const limit = f.limit
  if (!limit) return shown
  if (limit.kind === 'folder') {
    const prefix = limit.folder + '/'
    return shown.map(
      (s, i) => s && view.nodes[i].kind === 'page' && (view.nodes[i].folder === limit.folder || view.nodes[i].folder.startsWith(prefix)),
    )
  }
  const tag = view.nodes.findIndex((n) => n.key === limit.key)
  if (tag < 0) return shown.map(() => false)
  const keep = new Set<number>([tag])
  for (const [from, to] of view.edges) if (to === tag) keep.add(from)
  return shown.map((s, i) => s && keep.has(i))
}

export function shownLines(ls: [number, number][], shown: boolean[]): [number, number][] {
  return ls.filter(([a, b]) => shown[a] && shown[b])
}

const byText = (a: string, b: string) => {
  const x = a.toLowerCase()
  const y = b.toLowerCase()
  return x < y ? -1 : x > y ? 1 : 0
}

export function limitOptions(view: GraphView): { folders: string[]; tags: { key: string; title: string }[] } {
  const folders = new Set<string>()
  for (const n of view.nodes) {
    if (n.kind !== 'page' || !n.exists || n.folder === '') continue
    const parts = n.folder.split('/')
    for (let i = 1; i <= parts.length; i++) folders.add(parts.slice(0, i).join('/'))
  }
  const tags = view.nodes.filter((n) => n.tag).map((n) => ({ key: n.key, title: n.title }))
  return { folders: [...folders].sort(byText), tags: tags.sort((a, b) => byText(a.title, b.title)) }
}

export function limitValid(view: GraphView, limit: Limit | null): boolean {
  if (!limit) return true
  const o = limitOptions(view)
  return limit.kind === 'folder' ? o.folders.includes(limit.folder) : o.tags.some((t) => t.key === limit.key)
}

export function limitValue(l: Limit | null): string {
  if (!l) return 'all'
  return l.kind === 'folder' ? `folder:${l.folder}` : `tag:${l.key}`
}

export function parseLimit(v: string): Limit | null {
  if (v.startsWith('folder:')) return { kind: 'folder', folder: v.slice(7) }
  if (v.startsWith('tag:')) return { kind: 'tag', key: v.slice(4) }
  return null
}

/** Re-arrange is offered once the picture is loaded and still, and only while a dot is shown: with every dot hidden it
 *  would arrange nothing the user can see. */
export function canRearrange(loaded: boolean, layout: string, shownCount: number): boolean {
  return loaded && layout !== 'none' && layout !== 'running' && shownCount > 0
}

export function dotSize(linkedFrom: number): number {
  return Math.min(18, 3 + 1.5 * Math.sqrt(linkedFrom))
}

export function countText(pages: number, links: number): string {
  const n = (x: number) => x.toLocaleString('en-GB')
  return `${n(pages)} ${pages === 1 ? 'page' : 'pages'} · ${n(links)} ${links === 1 ? 'link' : 'links'}`
}

/** Shown nodes whose title or name contains `text`: prefix matches first, then most linked, then title. */
export function findMatches(view: GraphView, shown: boolean[], text: string, max = 8): number[] {
  const t = text.toLowerCase()
  if (t === '') return []
  const hits: { i: number; prefix: boolean }[] = []
  view.nodes.forEach((n, i) => {
    if (!shown[i]) return
    const title = n.title.toLowerCase()
    const name = n.name.toLowerCase()
    if (title.includes(t) || name.includes(t)) hits.push({ i, prefix: title.startsWith(t) || name.startsWith(t) })
  })
  hits.sort(
    (a, b) =>
      Number(b.prefix) - Number(a.prefix) ||
      view.nodes[b.i].linkedFrom - view.nodes[a.i].linkedFrom ||
      byText(view.nodes[a.i].title, view.nodes[b.i].title),
  )
  return hits.slice(0, max).map((h) => h.i)
}

/** What Enter in the Find box does: the first Enter on a choice focuses it; Enter again, with the same text and the
 *  same choice, opens it. */
export function findStep(
  prev: { text: string; chosen: string | null } | null,
  text: string,
  chosen: string | null,
): 'focus' | 'open' {
  return chosen !== null && prev !== null && prev.text === text && prev.chosen === chosen ? 'open' : 'focus'
}

/** The Find list's choice moved by ↑ (-1) or ↓ (+1), kept within `count` rows; -1 when there are none. */
export function moveChoice(index: number, count: number, delta: number): number {
  if (count === 0) return -1
  return Math.max(0, Math.min(count - 1, index + delta))
}

export type GraphKeyAction = { kind: 'pan'; dx: number; dy: number } | { kind: 'zoom'; factor: number } | { kind: 'fit' }

const ZOOM_STEP = 1.5

/** A key pressed on the focused picture: arrows pan, `+` / `=` zoom in, `-` zooms out, `0` fits. A key with Ctrl,
 *  Alt or Cmd is not the graph's. */
export function graphKey(e: { key: string; ctrlKey: boolean; altKey: boolean; metaKey: boolean }): GraphKeyAction | null {
  if (e.ctrlKey || e.altKey || e.metaKey) return null
  switch (e.key) {
    case 'ArrowLeft':
      return { kind: 'pan', dx: -1, dy: 0 }
    case 'ArrowRight':
      return { kind: 'pan', dx: 1, dy: 0 }
    case 'ArrowUp':
      return { kind: 'pan', dx: 0, dy: -1 }
    case 'ArrowDown':
      return { kind: 'pan', dx: 0, dy: 1 }
    case '+':
    case '=':
      return { kind: 'zoom', factor: ZOOM_STEP }
    case '-':
      return { kind: 'zoom', factor: 1 / ZOOM_STEP }
    case '0':
      return { kind: 'fit' }
    default:
      return null
  }
}
