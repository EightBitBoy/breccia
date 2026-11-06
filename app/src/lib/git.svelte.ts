// The Git state the status bar shows. `tick` re-reads the clock so "2 min ago" moves on.
import { gitItem } from './git'
import type { StatusItem } from './status'
import type { GitView } from './types'

export class GitStatus {
  view = $state.raw<GitView | null>(null)
  #now = $state(0)
  readonly #env: { now(): number }

  constructor(env: { now(): number }) {
    this.#env = env
    this.#now = env.now()
  }

  set(v: GitView): void {
    this.view = v
    this.#now = this.#env.now()
  }

  tick(): void {
    this.#now = this.#env.now()
  }

  item: StatusItem | null = $derived(this.view ? gitItem(this.view, this.#now) : null)

  /** Whether `v.head` differs from the previous view's (the All pages table then refreshes). */
  headChanged(v: GitView): boolean {
    return v.head !== (this.view?.head ?? null)
  }
}
