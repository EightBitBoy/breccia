// What our own commands returned, so the shell's echoes of it are not taken for news.
import type { PageView } from './types'

const KEPT = 8

/** The last pages and removals our own commands produced. */
export class Echoes {
  private pages: { key: string; json: string }[] = []
  private removed: string[] = []

  /** Records a page an own command returned; the last 8 are kept. */
  ownPage(p: PageView): void {
    this.pages = [{ key: p.key, json: JSON.stringify(p) }, ...this.pages].slice(0, KEPT)
  }

  /** Whether `p` equals a recorded page of its key. Stringifies `p` only if its key was recorded. */
  isOwnPage(p: PageView): boolean {
    if (!this.pages.some((e) => e.key === p.key)) return false
    const json = JSON.stringify(p)
    return this.pages.some((e) => e.key === p.key && e.json === json)
  }

  /** Records an output's removals; `back` (the output's page key) is news again when it is next removed. Last 8 kept. */
  ownRemovals(removed: string[], back: string | null): void {
    this.removed = [...removed, ...this.removed.filter((k) => k !== back)].slice(0, KEPT)
  }

  isOwnRemoval(key: string): boolean {
    return this.removed.includes(key)
  }
}
