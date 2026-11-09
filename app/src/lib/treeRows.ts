// The sidebar's rows: the page tree and the journals, flattened for the
// folds that are open. Pure; the components only draw the rows.
import type { TreeNode, TreeView } from './types'

export type RowKind = 'folder' | 'page' | 'journals' | 'year' | 'month' | 'day' | 'tag'

export interface Row {
  /** `f:{path}`, `p:{key}`, `j`, `y:{year}`, `m:{year}-{MM}`, `d:{key}`, `t:{key}`. */
  id: string
  depth: number
  kind: RowKind
  label: string
  /** The page key of a page or day. */
  key?: string
  /** The folder path of a folder. */
  path?: string
  /** Whether a row that can fold is open. */
  open?: boolean
  /** A page or tag row with no file and no text of its own: only links go to it. */
  linkedOnly?: boolean
  /** The blocks that have a tag. */
  count?: number
}

/** The Tags section's rows, in the tree's order. */
export function tagRows(tree: TreeView): Row[] {
  return tree.tags.map((t) => ({
    id: `t:${t.key}`,
    depth: 0,
    kind: 'tag',
    label: t.name,
    key: t.key,
    count: t.count,
    linkedOnly: t.linkedOnly,
  }))
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Whether a row folds open and closed. */
export function folds(r: Row): boolean {
  return r.open !== undefined
}

/** Where the Journals row sits: above the page tree, below it, or among its top-level folders by name. */
export type JournalsAt = 'top' | 'bottom' | 'inline'

export const JOURNALS_AT: JournalsAt[] = ['top', 'bottom', 'inline']

/** A known placement, else the default (bottom). */
export function parseJournalsAt(v: unknown): JournalsAt {
  return v === 'top' || v === 'inline' ? v : 'bottom'
}

/** The visible rows: page nodes in order, children of open rows only, and Journals where `at` puts it. */
export function rows(tree: TreeView, open: ReadonlySet<string>, at: JournalsAt = 'bottom'): Row[] {
  const out: Row[] = []
  const nodes = (list: TreeNode[], depth: number) => {
    for (const n of list) {
      if (n.kind === 'page') {
        out.push({ id: `p:${n.key}`, depth, kind: 'page', label: n.name, key: n.key, linkedOnly: n.linkedOnly ?? false })
        continue
      }
      const id = `f:${n.path}`
      const isOpen = open.has(id)
      out.push({ id, depth, kind: 'folder', label: n.name, path: n.path, open: isOpen })
      if (isOpen) nodes(n.children, depth + 1)
    }
  }
  const journal = journalRows(tree, open)
  if (at === 'top') out.push(...journal)
  if (at === 'inline') {
    // Journals is a folder: it goes among the top-level folders (which come before the pages), ignoring case.
    const folders = tree.pages.filter((n) => n.kind === 'folder')
    const after = folders.filter((n) => n.name.toLowerCase() < 'journals').length
    const before = after < folders.length ? folders[after] : tree.pages.find((n) => n.kind === 'page')
    const head = before ? tree.pages.indexOf(before) : tree.pages.length
    nodes(tree.pages.slice(0, head), 0)
    out.push(...journal)
    nodes(tree.pages.slice(head), 0)
  } else nodes(tree.pages, 0)
  if (at === 'bottom') out.push(...journal)
  return out
}

function journalRows(tree: TreeView, open: ReadonlySet<string>): Row[] {
  const out: Row[] = []
  const jOpen = open.has('j')
  out.push({ id: 'j', depth: 0, kind: 'journals', label: 'Journals', open: jOpen })
  if (!jOpen) return out
  for (const y of tree.journals) {
    const yid = `y:${y.year}`
    const yOpen = open.has(yid)
    out.push({ id: yid, depth: 1, kind: 'year', label: String(y.year), open: yOpen })
    if (!yOpen) continue
    for (const m of y.months) {
      const mid = `m:${y.year}-${pad(m.month)}`
      const mOpen = open.has(mid)
      out.push({ id: mid, depth: 2, kind: 'month', label: m.label, open: mOpen })
      if (!mOpen) continue
      for (const d of m.days) out.push({ id: `d:${d.key}`, depth: 3, kind: 'day', label: d.title, key: d.key })
    }
  }
  return out
}

function inNodes(list: TreeNode[], key: string, trail: string[]): string[] | null {
  for (const n of list) {
    if (n.kind === 'page') {
      if (n.key === key) return trail
    } else {
      const found = inNodes(n.children, key, [...trail, `f:${n.path}`])
      if (found) return found
    }
  }
  return null
}

/** The row ids to open so the row of page `key` is visible; empty if it is not in the tree. */
export function ancestors(tree: TreeView, key: string): string[] {
  return locate(tree, key) ?? []
}

function journalTrail(tree: TreeView, key: string): string[] | null {
  for (const y of tree.journals)
    for (const m of y.months)
      if (m.days.some((d) => d.key === key)) return ['j', `y:${y.year}`, `m:${y.year}-${pad(m.month)}`]
  return null
}

/** The fold rows above `key` (as `ancestors`), or null when `key` is not in the tree. */
export function locate(tree: TreeView, key: string): string[] | null {
  return journalTrail(tree, key) ?? inNodes(tree.pages, key, [])
}

/**
 * What to open so the shown page's row is visible. `seen` is the last place revealed (opaque; null at first).
 * Nothing opens, and `seen` stays, while the page is not in the tree yet. A page already revealed at the same
 * place opens nothing (the user may have folded it). A page that moved opens the way to its new place.
 */
export function reveal(
  tree: TreeView | null,
  shown: string | null,
  seen: string | null,
): { open: string[]; seen: string | null } {
  if (!tree || shown === null) return { open: [], seen }
  const trail = locate(tree, shown)
  if (!trail) return { open: [], seen }
  const place = JSON.stringify([shown, trail])
  if (place === seen) return { open: [], seen }
  return { open: trail, seen: place }
}
