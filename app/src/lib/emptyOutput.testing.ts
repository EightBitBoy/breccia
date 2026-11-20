import type { Output } from './types'

/** An answer that changes nothing, with `over` set: for tests that fake the core. */
export function emptyOutput(over: Partial<Output> = {}): Output {
  return {
    page: null,
    focus: null,
    notices: [],
    config: null,
    tree: null,
    changed: [],
    removed: [],
    renamed: [],
    saved: [],
    dailies: null,
    answer: null,
    ...over,
  }
}
