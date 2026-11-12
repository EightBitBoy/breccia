import type { TreeView } from './types'

/** Whether `next` may replace the shown tree: an update and an answer can arrive out of order. */
export function isNewer(shown: TreeView | null, next: TreeView): boolean {
  return shown === null || next.version >= shown.version
}
