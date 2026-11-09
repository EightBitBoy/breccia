import { expect, test } from 'vitest'
import { ancestors, locate, reveal, rows, tagRows } from './treeRows'
import type { TreeNode, TreeView } from './types'

const tree: TreeView = {
  pages: [
    { kind: 'folder', name: 'people', path: 'people', children: [{ kind: 'page', key: 'anna', name: 'Anna' }] },
    {
      kind: 'folder',
      name: 'Projects',
      path: 'Projects',
      children: [{ kind: 'page', key: 'project x', name: 'Project X' }],
    },
    { kind: 'page', key: 'ideas', name: 'Page Ideas' },
  ],
  journals: [
    {
      year: 2026,
      months: [
        {
          month: 10,
          label: 'October',
          days: [
            { key: '2026-10-29', title: 'Thursday, 29 October 2026' },
            { key: '2026-10-27', title: 'Tuesday, 27 October 2026' },
          ],
        },
      ],
    },
  ],
  tags: [],
}

test('closed folders hide their children; journals come last', () => {
  expect(rows(tree, new Set()).map((r) => r.id)).toEqual(['f:people', 'f:Projects', 'p:ideas', 'j'])
})

test('Journals can sit at the top, or among the folders by name', () => {
  const open = new Set<string>()
  expect(rows(tree, open, 'top').map((r) => r.id)).toEqual(['j', 'f:people', 'f:Projects', 'p:ideas'])
  // Ignoring case, "journals" sorts before "people" and "Projects".
  expect(rows(tree, open, 'inline').map((r) => r.id)).toEqual(['j', 'f:people', 'f:Projects', 'p:ideas'])
  const t2: TreeView = { ...tree, pages: [{ kind: 'folder', name: 'Archive', path: 'Archive', children: [] }, ...tree.pages] }
  expect(rows(t2, open, 'inline').map((r) => r.id)).toEqual(['f:Archive', 'j', 'f:people', 'f:Projects', 'p:ideas'])
  // With no folder after it, it follows the last folder and stays before the pages.
  const t3: TreeView = { ...tree, pages: [{ kind: 'folder', name: 'Zed', path: 'Zed', children: [] }, tree.pages[2]] }
  expect(rows(t3, open, 'inline').map((r) => r.id)).toEqual(['j', 'f:Zed', 'p:ideas'])
  const t4: TreeView = { ...tree, pages: [{ kind: 'folder', name: 'A', path: 'A', children: [] }, tree.pages[2]] }
  expect(rows(t4, open, 'inline').map((r) => r.id)).toEqual(['f:A', 'j', 'p:ideas'])
})

test('an open Journals keeps its days under it wherever it sits', () => {
  const ids = rows(tree, new Set(['j', 'y:2026']), 'top').map((r) => [r.id, r.depth])
  expect(ids.slice(0, 3)).toEqual([['j', 0], ['y:2026', 1], ['m:2026-10', 2]])
  expect(ids[3]).toEqual(['f:people', 0])
})

test('open rows show their children one level deeper', () => {
  expect(rows(tree, new Set(['f:Projects', 'j', 'y:2026'])).map((r) => [r.id, r.depth])).toEqual([
    ['f:people', 0],
    ['f:Projects', 0],
    ['p:project x', 1],
    ['p:ideas', 0],
    ['j', 0],
    ['y:2026', 1],
    ['m:2026-10', 2],
  ])
})

test('days show under an open month', () => {
  const ids = rows(tree, new Set(['j', 'y:2026', 'm:2026-10'])).map((r) => r.id)
  expect(ids.slice(-2)).toEqual(['d:2026-10-29', 'd:2026-10-27'])
})

test('ancestors open the way to a page or a day', () => {
  expect(ancestors(tree, 'project x')).toEqual(['f:Projects'])
  expect(ancestors(tree, '2026-10-27')).toEqual(['j', 'y:2026', 'm:2026-10'])
  expect(ancestors(tree, 'nope')).toEqual([])
})

const folderNode = (path: string, children: TreeNode[]): TreeNode => ({ kind: 'folder', name: path.split('/').pop()!, path, children })
const pageNode = (key: string): TreeNode => ({ kind: 'page', key, name: key })
const t = (pages: TreeNode[]): TreeView => ({ pages, journals: [], tags: [] })

test('locate finds top-level pages too, and null when absent', () => {
  expect(locate(t([pageNode('a')]), 'a')).toEqual([])
  expect(locate(t([folderNode('P', [pageNode('x')])]), 'x')).toEqual(['f:P'])
  expect(locate(t([]), 'x')).toBeNull()
})

test('a page not in the tree yet is revealed once it arrives', () => {
  const first = reveal(t([]), 'x', null)
  expect(first).toEqual({ open: [], seen: null })
  const later = reveal(t([folderNode('P', [pageNode('x')])]), 'x', first.seen)
  expect(later.open).toEqual(['f:P'])
})

test('the same place opens nothing again; a move into a closed folder opens it', () => {
  const at = reveal(t([folderNode('P', [pageNode('x')])]), 'x', null)
  expect(reveal(t([folderNode('P', [pageNode('x')])]), 'x', at.seen).open).toEqual([])
  const moved = t([folderNode('P', []), folderNode('Q', [pageNode('x')])])
  expect(reveal(moved, 'x', at.seen).open).toEqual(['f:Q'])
})

test('a page that is only linked to is marked', () => {
  const t: TreeView = {
    pages: [
      { kind: 'page', key: 'anna', name: 'Anna', linkedOnly: true },
      { kind: 'page', key: 'ideas', name: 'Ideas', linkedOnly: false },
    ],
    journals: [],
    tags: [],
  }
  expect(rows(t, new Set()).map((r) => [r.id, r.linkedOnly])).toEqual([
    ['p:anna', true],
    ['p:ideas', false],
    ['j', undefined],
  ])
})

test('tag rows carry the name, the count and whether the tag has a page', () => {
  const t: TreeView = {
    pages: [],
    journals: [],
    tags: [
      { key: 'infra', name: 'infra', count: 2, linkedOnly: true },
      { key: 'ops', name: 'Ops', count: 1, linkedOnly: false },
    ],
  }
  expect(tagRows(t)).toEqual([
    { id: 't:infra', depth: 0, kind: 'tag', label: 'infra', key: 'infra', count: 2, linkedOnly: true },
    { id: 't:ops', depth: 0, kind: 'tag', label: 'Ops', key: 'ops', count: 1, linkedOnly: false },
  ])
  // Tags are not page-tree rows.
  expect(rows(t, new Set()).map((r) => r.id)).toEqual(['j'])
})
