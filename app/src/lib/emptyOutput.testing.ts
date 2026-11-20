import type { Output } from './types'

/** An answer that changes nothing, with `over` set: for tests that fake the core. */
export function emptyOutput(over: Partial<Output> = {}): Output {
  return {
    page: null,
    focus: null,
    notices: [],
    config: null,
    refs: null,
    tree: null,
    changed: [],
    removed: [],
    feed: null,
    pages: [],
    board: null,
    table: null,
    search: null,
    renamed: [],
    graph: null,
    saved: [],
    archive: null,
    dailies: null,
    answer: null,
    ...over,
  }
}
