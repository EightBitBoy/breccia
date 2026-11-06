// The linked references below a page: keeping them in step with edits made in
// them, and the order and pages of their blocks for the editor.
import { visible } from './tree'
import type { BlockId, BlockView, PageView, RefView, RefsView } from './types'

/**
 * `refs` with the group of `page` rebuilt from the page's fresh blocks: each ref
 * becomes its root's subtree, depths relative to the root, followed by the
 * siblings right after it that are in `kept` (blocks made while editing there,
 * such as by Enter at the root's end) with their subtrees. A ref whose root is
 * gone, or now lies inside another ref's subtree (as the core would list it), is
 * dropped, and so is a group left empty. Other groups are kept as they are.
 */
export function patchRefs(refs: RefsView, page: PageView, kept: ReadonlySet<BlockId> = new Set()): RefsView {
  if (!refs.groups.some((g) => g.page === page.key)) return refs
  const blocks = page.blocks
  const groups = refs.groups.flatMap((g) => {
    if (g.page !== page.key) return [g]
    const spans = g.refs.flatMap((r) => {
      const i = r.blocks.length ? blocks.findIndex((b) => b.id === r.blocks[0].id) : -1
      if (i < 0) return []
      const d = blocks[i].depth
      let end = i + 1
      while (end < blocks.length && (blocks[end].depth > d || (blocks[end].depth === d && kept.has(blocks[end].id)))) {
        end++
      }
      return [{ r, i, end }]
    })
    const outer = spans.filter((s) => !spans.some((o) => o !== s && o.i < s.i && s.i < o.end))
    const out: RefView[] = outer.map(({ r, i, end }) => ({
      crumbs: r.crumbs,
      blocks: blocks.slice(i, end).map((b) => ({ ...b, depth: b.depth - blocks[i].depth })),
    }))
    return out.length ? [{ ...g, refs: out }] : []
  })
  return { ...refs, groups, count: groups.reduce((n, g) => n + g.refs.length, 0) }
}

/** Every reference block that is shown, in display order. */
export function refBlocks(refs: RefsView, folded: ReadonlySet<number>): BlockView[] {
  return refs.groups.flatMap((g) => g.refs.flatMap((r) => visible(r.blocks, folded)))
}

/** The page block `id` is on: the outline's page or a reference's source; null if neither. */
export function pageOfBlock(page: PageView | null, refs: RefsView | null, id: BlockId): string | null {
  if (page?.blocks.some((b) => b.id === id)) return page.key
  return refs?.groups.find((g) => g.refs.some((r) => r.blocks.some((b) => b.id === id)))?.page ?? null
}

export interface RefsRefreshHost {
  /** The page whose references are shown, or null. */
  key(): string | null
  /** Whether the editor is inside the references: a refresh would move them under it. */
  busy(): boolean
  /** Runs `page.refs`; settles when its output is applied. */
  run(key: string): Promise<unknown>
}

/**
 * Re-runs `page.refs` when asked: at most one run in flight and one pending, and
 * none while the editor is inside the references (`pump` once it leaves).
 */
export class RefsRefresh {
  private stale = false
  private running = false

  constructor(private host: RefsRefreshHost) {}

  request() {
    this.stale = true
    this.pump()
  }

  /** Runs a requested refresh if nothing holds it back. */
  pump() {
    if (!this.stale || this.running || this.host.busy()) return
    this.stale = false
    const key = this.host.key()
    if (key === null) return
    this.running = true
    const done = () => {
      this.running = false
      this.pump()
    }
    this.host.run(key).then(done, done)
  }
}

export interface PageChangedHost {
  /** Whether `key` is the shown page or a loaded day of the shown feed. */
  shows(key: string): boolean
  /** Whether a page or the feed is shown. */
  active(): boolean
  /** Whether `p` is an echo of our own command's output. */
  own(p: PageView): boolean
  isGroup(key: string): boolean
  /** Queues `page.get` for the shown page: it runs after the commands queued before it. */
  reload(key: string): void
  /** Applies `p` to its references group. */
  patch(p: PageView): void
  /** Re-runs `page.refs` (held while the editor is inside the references). */
  refresh(): void
  /** Re-mounts the editor after the view changed. */
  reconcile(): void
}

/**
 * Another view changed page `p` (§9): the shown page is loaded again through
 * the command queue, a references group is patched with it, and since a link
 * may have come or gone, a page that is not shown makes the references load again.
 */
export function pageChanged(h: PageChangedHost, p: PageView) {
  if (!h.active() || h.own(p)) return
  if (h.shows(p.key)) return h.reload(p.key)
  if (h.isGroup(p.key)) {
    h.patch(p)
    h.reconcile()
  }
  h.refresh()
}
