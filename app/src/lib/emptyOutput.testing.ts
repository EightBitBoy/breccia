import type { Output } from './types'

/** An answer that changes nothing, with `over` set: for tests that fake the core. */
export function emptyOutput(over: Partial<Output> = {}): Output {
  return {
    page: null,
    focus: null,
    notices: [],
    folder: null,
    config: null,
    refs: null,
    names: null,
    tree: null,
    changed: [],
    removed: [],
    dirty: null,
    feed: null,
    pages: [],
    board: null,
    table: null,
    search: null,
    day: null,
    renamed: [],
    git: null,
    usage: null,
    usageSkipped: null,
    graph: null,
    saved: [],
    reach: null,
    gitLog: null,
    archive: null,
    dailies: null,
    ...over,
  }
}
