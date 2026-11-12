import { expect, test } from 'vitest'
import { deleteConfirm, folderOf, menuFor, moveTargets, renameConfirm } from './pageOps'
import type { TreeView } from './types'

const tree: TreeView = {
  pages: [
    {
      kind: 'folder',
      name: 'Projects',
      path: 'Projects',
      children: [
        { kind: 'folder', name: '2027', path: 'Projects/2027', children: [{ kind: 'page', key: 'plan', name: 'Plan' }] },
        { kind: 'page', key: 'x', name: 'X' },
      ],
    },
    { kind: 'folder', name: 'People', path: 'People', children: [] },
    { kind: 'page', key: 'ideas', name: 'Ideas' },
  ],
  journals: [],
  tags: [],
  version: 0,
}

test('menus per row kind', () => {
  expect(menuFor({ id: 'd:2026-10-29', depth: 2, kind: 'day', label: '' })).toEqual(['delete'])
  expect(menuFor(null)).toEqual(['newPage', 'newFolder'])
  expect(menuFor({ id: 'j', depth: 0, kind: 'journals', label: 'Journals' })).toEqual([])
  expect(menuFor({ id: 'y:2026', depth: 1, kind: 'year', label: '2026' })).toEqual([])
  expect(menuFor({ id: 'm:2026-10', depth: 2, kind: 'month', label: 'October' })).toEqual([])
  const all = ['newPage', 'newFolder', 'rename', 'move', 'delete']
  expect(menuFor({ id: 'f:People', depth: 0, kind: 'folder', label: 'People' })).toEqual(all)
  expect(menuFor({ id: 'p:ideas', depth: 0, kind: 'page', label: 'Ideas' })).toEqual(all)
  // A page that is only linked to has no file to delete; a move creates its file, a rename rewrites its links.
  expect(menuFor({ id: 'p:anna', depth: 0, kind: 'page', label: 'Anna', linkedOnly: true })).toEqual([
    'newPage',
    'newFolder',
    'rename',
    'move',
  ])
  // A tag can only be renamed, with or without a page.
  expect(menuFor({ id: 't:infra', depth: 0, kind: 'tag', label: 'infra', linkedOnly: true })).toEqual(['rename'])
  expect(menuFor({ id: 't:ops', depth: 0, kind: 'tag', label: 'Ops', linkedOnly: false })).toEqual(['rename'])
})

test('rename asks only when links change', () => {
  expect(renameConfirm('A', 'B', 0)).toBeNull()
  expect(renameConfirm('A', 'B', 1)).toBe('Rename “A” to “B”? Links in 1 page will be updated.')
  expect(renameConfirm('A', 'B', 3)).toBe('Rename “A” to “B”? Links in 3 pages will be updated.')
})

test('delete copy', () => {
  expect(deleteConfirm('A', false)).toBe('Delete page “A”? Its file is removed; links to it stay.')
  expect(deleteConfirm('Projects', true)).toBe('Delete folder “Projects”?')
})

test('move targets exclude the folder itself and below', () => {
  const targets = (m: Parameters<typeof moveTargets>[1]) => moveTargets(tree, m).map((t) => t.path)
  expect(targets({ kind: 'folder', path: 'Projects' })).toEqual(['', 'People'])
  expect(targets({ kind: 'folder', path: 'Projects/2027' })).toEqual(['', 'Projects', 'People'])
  expect(moveTargets(tree, { kind: 'folder', path: 'People' })[0]).toEqual({ path: '', label: '— top level' })
})

test('move targets for a page leave out its folder', () => {
  const targets = (folder: string) => moveTargets(tree, { kind: 'page', folder }).map((t) => t.path)
  expect(targets('')).toEqual(['Projects', 'Projects/2027', 'People'])
  expect(targets('Projects')).toEqual(['', 'Projects/2027', 'People'])
})

test('the folder of a page', () => {
  expect(folderOf(tree, 'plan')).toBe('Projects/2027')
  expect(folderOf(tree, 'ideas')).toBe('')
  expect(folderOf(tree, 'gone')).toBe('')
})
