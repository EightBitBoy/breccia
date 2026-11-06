// Drag and drop in the sidebar's page tree: what may be dragged, where a drop lands, and the command it sends.
// Pure; the DOM glue is `treeDrag` and `treeDrop` in dnd.ts.
import { baseName, folderOf, joinPath, moveTargets, parentOf } from './pageOps'
import type { Row } from './treeRows'
import type { Command, TreeView } from './types'

/** The "Pages" heading: a drop there goes to the top level. */
export const PAGES = 'pages'

/** What the pointer is over: a tree row, or the "Pages" heading. */
export type Over = Row | typeof PAGES

/** The key of the drag data of a tree row; a board card's data has its own key, so neither accepts the other. */
export const TREE = 'breccia-tree'

/** The row id in a drag's data, or null when the drag is not a tree row's. */
export function treeData(data: Record<string | symbol, unknown>): string | null {
  return data[TREE] === true && typeof data.id === 'string' ? data.id : null
}

/** Pages (with a file or only linked to) and folders can be dragged; journals and tags cannot. */
export function canDrag(row: Row): boolean {
  return (row.kind === 'page' && row.key !== undefined) || (row.kind === 'folder' && row.path !== undefined)
}

/** The folder a drop on `over` lands in ('' is the top level), or null where nothing can be dropped. */
export function dropFolder(tree: TreeView, over: Over): string | null {
  if (over === PAGES) return ''
  if (over.kind === 'folder') return over.path ?? null
  if (over.kind === 'page' && over.key !== undefined) return folderOf(tree, over.key)
  return null
}

/** The id of the row that shows the highlight for a drop on `over`: its folder's row, or the heading. */
export function receiver(tree: TreeView, over: Over): string | null {
  const folder = dropFolder(tree, over)
  if (folder === null) return null
  return folder === '' ? PAGES : `f:${folder}`
}

/** The command that moves `dragged` into `folder`, or null when it is already there or cannot go there. */
export function dropCommand(tree: TreeView, dragged: Row, folder: string): Command | null {
  if (dragged.kind === 'page' && dragged.key !== undefined) {
    // A page only linked to is listed at the top level, so a drop there does nothing either.
    if (folderOf(tree, dragged.key) === folder) return null
    return { type: 'page.move', key: dragged.key, folder }
  }
  if (dragged.kind === 'folder' && dragged.path !== undefined) {
    const path = dragged.path
    if (parentOf(path) === folder) return null
    // The Move dialog's rule: not into itself or one of its own folders.
    if (!moveTargets(tree, { kind: 'folder', path }).some((t) => t.path === folder)) return null
    return { type: 'dir.rename', path, to: joinPath(folder, baseName(path)) }
  }
  return null
}

/** Whether `dragged` can be dropped on `over`: the highlight shows only then. */
export function canDrop(tree: TreeView, dragged: Row, over: Over): boolean {
  if (over !== PAGES && over.id === dragged.id) return false
  const folder = dropFolder(tree, over)
  return folder !== null && dropCommand(tree, dragged, folder) !== null
}

/** Opens a collapsed folder once the pointer has stayed on it for `delay` ms during a drag. */
export function hoverOpen(open: (id: string) => void, delay = 700) {
  let timer: ReturnType<typeof setTimeout> | null = null
  const leave = () => {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }
  return {
    /** The pointer is over row `id` now. */
    enter(id: string, collapsedFolder: boolean) {
      leave()
      if (collapsedFolder) {
        timer = setTimeout(() => {
          timer = null
          open(id)
        }, delay)
      }
    },
    leave,
    /** The drag ended (a drop, or Esc). */
    end: leave,
  }
}
