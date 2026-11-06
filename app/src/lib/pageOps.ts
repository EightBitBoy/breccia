// Page and folder operations of the sidebar: what the context menu offers, the
// confirmation copy, and the move targets. Pure; the flows live in pageFlows.svelte.ts.
import type { Row } from './treeRows'
import type { TreeNode, TreeView } from './types'

export type Op = 'newPage' | 'newFolder' | 'rename' | 'move' | 'delete'

/** The operations the context menu offers on a row; `null` is the empty tree area or the Pages group. */
export function menuFor(row: Row | null): Op[] {
  if (row === null) return ['newPage', 'newFolder']
  switch (row.kind) {
    case 'page':
      // A page only linked to has no file to delete; a move creates its file, a rename rewrites the links.
      if (row.linkedOnly) return ['newPage', 'newFolder', 'rename', 'move']
      return ['newPage', 'newFolder', 'rename', 'move', 'delete']
    case 'tag':
      return ['rename']
    case 'folder':
      return ['newPage', 'newFolder', 'rename', 'move', 'delete']
    case 'day':
      return ['delete']
    default:
      return []
  }
}

/** The question before a rename, or null when no page links change. */
export function renameConfirm(oldName: string, newName: string, pages: number): string | null {
  if (pages === 0) return null
  return `Rename “${oldName}” to “${newName}”? Links in ${pages} page${pages === 1 ? '' : 's'} will be updated.`
}

export function deleteConfirm(name: string, folder: boolean): string {
  return folder ? `Delete folder “${name}”?` : `Delete page “${name}”? Its file is removed; links to it stay.`
}

function folderPaths(nodes: TreeNode[], out: string[]): string[] {
  for (const n of nodes) {
    if (n.kind !== 'folder') continue
    out.push(n.path)
    folderPaths(n.children, out)
  }
  return out
}

export type Moving = { kind: 'page'; folder: string } | { kind: 'folder'; path: string }

/** Where a page or folder may go: the top level and every folder, except where it is now or inside itself. */
export function moveTargets(tree: TreeView, moving: Moving): { path: string; label: string }[] {
  const all = ['', ...folderPaths(tree.pages, [])]
  const keep = (p: string) =>
    moving.kind === 'page' ? p !== moving.folder : p !== moving.path && !p.startsWith(moving.path + '/')
  return all.filter(keep).map((path) => ({ path, label: path === '' ? '— top level' : path }))
}

function findFolder(nodes: TreeNode[], key: string, at: string): string | null {
  for (const n of nodes) {
    if (n.kind === 'page') {
      if (n.key === key) return at
    } else {
      const found = findFolder(n.children, key, n.path)
      if (found !== null) return found
    }
  }
  return null
}

/** The folder path of page `key` ('' at the top level or if it is not in the tree). */
export function folderOf(tree: TreeView, key: string): string {
  return findFolder(tree.pages, key, '') ?? ''
}

/** The last segment of a folder path. */
export function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

/** The folder part of a path ('' at the top level). */
export function parentOf(path: string): string {
  const i = path.lastIndexOf('/')
  return i < 0 ? '' : path.slice(0, i)
}

/** `folder/name`, or just `name` at the top level. */
export function joinPath(folder: string, name: string): string {
  return folder === '' ? name : `${folder}/${name}`
}
