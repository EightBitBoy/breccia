// Another program renamed a page: the shown page follows it to its new key.
import type { RenameView } from './types'

/**
 * The key to show after `rename`, or null when the shown page is another one. A shown
 * page still on its way to an earlier rename's key (showing that key failed, because it
 * was renamed again meanwhile: A→B→C) follows the chain to the newest key.
 */
export function followRename(shown: string | null, rename: RenameView, renamed?: JustRenamed): string | null {
  if (shown === null) return null
  const on = renamed ? renamed.newest(shown) : shown
  return shown === rename.from || on === rename.from ? rename.to : null
}

/**
 * What a removal of `key` means for the shown page: `other` (not the shown page),
 * `renamed` (its old key: the page is on its way to the new one), or `removed`
 * (the shown page, or the key it was on its way to, is gone).
 */
export function removalFor(shown: string | null, key: string, renamed: JustRenamed): 'other' | 'renamed' | 'removed' {
  if (shown === null) return 'other'
  if (key === shown) return renamed.swallow(key) ? 'renamed' : 'removed'
  return key === renamed.newest(shown) ? 'removed' : 'other'
}

/**
 * Keys renamed a moment ago, with where they went. A rename also reports the old key
 * as removed; while the shown page is on its way to the new key, that removal is not
 * news.
 */
export class JustRenamed {
  private next = new Map<string, { to: string; until: number }>()
  private removals = new Map<string, number>()

  constructor(
    private now: () => number,
    private ttlMs = 5000,
  ) {}

  add(from: string, to: string): void {
    const now = this.now()
    for (const [k, n] of this.next) if (now >= n.until) this.next.delete(k)
    for (const [k, u] of this.removals) if (now >= u) this.removals.delete(k)
    const until = now + this.ttlMs
    this.next.set(from, { to, until })
    this.removals.set(from, until)
  }

  /** A new notes folder: the old folder's renames are forgotten. */
  clear(): void {
    this.next.clear()
    this.removals.clear()
  }

  /** Where `key` went through the renames of a moment ago (`key` itself if none). */
  newest(key: string): string {
    const seen = new Set([key])
    let at = key
    for (;;) {
      const n = this.next.get(at)
      if (!n || this.now() >= n.until || seen.has(n.to)) return at
      seen.add(n.to)
      at = n.to
    }
  }

  /** Whether the removal of `key` belongs to a rename just followed; each rename swallows one removal. */
  swallow(key: string): boolean {
    const until = this.removals.get(key)
    this.removals.delete(key)
    return until !== undefined && this.now() < until
  }
}
