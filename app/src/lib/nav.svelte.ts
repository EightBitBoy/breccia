// The navigation history: the views the main area showed this session, with a cursor, as a browser keeps
// them. In memory only; App records arrivals and restores what `back` and `forward` return.
import { samePlace, type NavPlace } from './nav'

/** A step: the place, and where it was scrolled to when left (`top`: the feed's day at the top). */
export interface NavEntry {
  place: NavPlace
  scroll: number
  top: string | null
}

export class Nav {
  private entries = $state.raw<NavEntry[]>([])
  private cursor = $state(-1)
  private restoring = $state(false)
  /** The cursor before the last step, for `drop`. */
  private origin = -1

  constructor(private limit = 50) {}

  /** There is a step before the current one. */
  get canBack(): boolean {
    return this.cursor > 0
  }

  /** Back from `here` does something: a step before, or `here` is not the current entry. */
  canBackFrom(here: NavPlace | null): boolean {
    return this.canBack || (this.cursor >= 0 && !samePlace(here, this.entries[this.cursor].place))
  }

  get canForward(): boolean {
    return this.cursor >= 0 && this.cursor < this.entries.length - 1
  }

  /** A restore is under way (from `back` or `forward` until `settle`). */
  get busy(): boolean {
    return this.restoring
  }

  /** The main area shows `p`: a new place is a step (dropping the forward ones); null and the same are not. */
  arrive(p: NavPlace | null): void {
    if (p === null) return
    if (this.cursor >= 0 && samePlace(p, this.entries[this.cursor].place)) return
    const list = [...this.entries.slice(0, this.cursor + 1), { place: p, scroll: 0, top: null }]
    if (list.length > this.limit) list.splice(0, list.length - this.limit)
    this.entries = list
    this.cursor = list.length - 1
  }

  /** The current view is about to be left: keep its scroll position. Ignored while restoring. */
  remember(scroll: number, top: string | null): void {
    if (this.restoring || this.cursor < 0) return
    this.replace(this.cursor, { ...this.entries[this.cursor], scroll, top })
  }

  /** The step before the current one; the current entry itself when `here` is not it. */
  back(here: NavPlace | null): NavEntry | null {
    if (this.cursor < 0) return null
    if (!samePlace(here, this.entries[this.cursor].place)) return this.step(this.cursor)
    return this.cursor > 0 ? this.step(this.cursor - 1) : null
  }

  forward(_here: NavPlace | null): NavEntry | null {
    return this.canForward ? this.step(this.cursor + 1) : null
  }

  /** The entry just stepped to is gone: it leaves, and the cursor is back where the step started. */
  drop(): void {
    if (this.cursor < 0) return
    const at = this.cursor
    const list = this.entries.filter((_, i) => i !== at)
    const cursor = at > this.origin ? this.origin : this.origin - 1
    this.origin = cursor
    this.set(list, cursor)
  }

  /** The restore is done. */
  settle(): void {
    this.restoring = false
    this.origin = -1
  }

  /** Page `from` is now `to` (a rename or a move, in Breccia or elsewhere). */
  renamed(from: string, to: string): void {
    this.set(
      this.entries.map((e) => (e.place.kind === 'page' && e.place.key === from ? { ...e, place: { kind: 'page', key: to } } : e)),
      this.cursor,
    )
  }

  /** Board `from` was renamed to `to`. */
  boardRenamed(from: string, to: string): void {
    this.set(
      this.entries.map((e) =>
        e.place.kind === 'board' && e.place.name === from ? { ...e, place: { kind: 'board', name: to } } : e,
      ),
      this.cursor,
    )
  }

  /** Page `key` is gone: its steps go; when the current one goes, the one before it is current. */
  removed(key: string): void {
    const gone = (e: NavEntry) => e.place.kind === 'page' && e.place.key === key
    const kept = this.entries.filter((e, i) => i <= this.cursor && !gone(e)).length
    this.set(
      this.entries.filter((e) => !gone(e)),
      kept - 1,
    )
  }

  /** Another notes folder. */
  clear(): void {
    this.entries = []
    this.cursor = -1
    this.settle()
  }

  private step(to: number): NavEntry {
    this.origin = this.cursor
    this.cursor = to
    this.restoring = true
    return this.entries[to]
  }

  private replace(i: number, e: NavEntry): void {
    const list = [...this.entries]
    list[i] = e
    this.entries = list
  }

  /** Sets the list, merging equal neighbours and keeping the cursor on the same entry. */
  private set(list: NavEntry[], cursor: number): void {
    const out: NavEntry[] = []
    let c = cursor
    list.forEach((e, i) => {
      if (out.length && samePlace(out[out.length - 1].place, e.place)) {
        if (i <= cursor) c--
      } else out.push(e)
    })
    this.entries = out
    this.cursor = out.length === 0 ? -1 : Math.min(Math.max(c, 0), out.length - 1)
  }
}
