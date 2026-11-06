import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { canDrag, canDrop, dropCommand, dropFolder, hoverOpen, receiver, treeData, PAGES } from './treeDrop'
import type { Row } from './treeRows'
import type { TreeView } from './types'

// Projects/{Sub/{Deep}, A}, Other, B (top), Idea (linked-only, top).
const tree: TreeView = {
  pages: [
    {
      kind: 'folder',
      name: 'Projects',
      path: 'Projects',
      children: [
        {
          kind: 'folder',
          name: 'Sub',
          path: 'Projects/Sub',
          children: [{ kind: 'folder', name: 'Deep', path: 'Projects/Sub/Deep', children: [] }],
        },
        { kind: 'page', key: 'a', name: 'A' },
      ],
    },
    { kind: 'folder', name: 'Other', path: 'Other', children: [] },
    { kind: 'page', key: 'b', name: 'B' },
    { kind: 'page', key: 'idea', name: 'Idea', linkedOnly: true },
  ],
  journals: [],
  tags: [],
}

const page = (key: string, linkedOnly = false): Row => ({ id: `p:${key}`, depth: 0, kind: 'page', label: key, key, linkedOnly })
const folder = (path: string): Row => ({ id: `f:${path}`, depth: 0, kind: 'folder', label: path, path, open: false })
const day: Row = { id: 'd:2026-10-29', depth: 2, kind: 'day', label: '29', key: '2026-10-29' }
const tag: Row = { id: 't:x', depth: 0, kind: 'tag', label: 'x', key: 'x' }
const journals: Row = { id: 'j', depth: 0, kind: 'journals', label: 'Journals' }

test('pages and folders can be dragged; journals and tags cannot', () => {
  expect(canDrag(page('a'))).toBe(true)
  expect(canDrag(page('idea', true))).toBe(true)
  expect(canDrag(folder('Projects'))).toBe(true)
  expect(canDrag(journals)).toBe(false)
  expect(canDrag({ id: 'y:2026', depth: 1, kind: 'year', label: '2026' })).toBe(false)
  expect(canDrag({ id: 'm:2026-10', depth: 2, kind: 'month', label: 'October' })).toBe(false)
  expect(canDrag(day)).toBe(false)
  expect(canDrag(tag)).toBe(false)
})

test('a drop lands in the folder row, the folder of a page row, or the top level for the heading', () => {
  expect(dropFolder(tree, folder('Projects/Sub'))).toBe('Projects/Sub')
  expect(dropFolder(tree, page('a'))).toBe('Projects')
  expect(dropFolder(tree, page('b'))).toBe('')
  expect(dropFolder(tree, PAGES)).toBe('')
  expect(dropFolder(tree, day)).toBeNull()
  expect(dropFolder(tree, tag)).toBeNull()
  expect(dropFolder(tree, journals)).toBeNull()
})

test('the row that shows the highlight: the folder, or the heading for the top level', () => {
  expect(receiver(tree, folder('Other'))).toBe('f:Other')
  expect(receiver(tree, page('a'))).toBe('f:Projects')
  expect(receiver(tree, page('b'))).toBe(PAGES)
  expect(receiver(tree, PAGES)).toBe(PAGES)
  expect(receiver(tree, tag)).toBeNull()
})

test('a page moves, unless it is already there', () => {
  expect(dropCommand(tree, page('a'), 'Other')).toEqual({ type: 'page.move', key: 'a', folder: 'Other' })
  expect(dropCommand(tree, page('a'), '')).toEqual({ type: 'page.move', key: 'a', folder: '' })
  expect(dropCommand(tree, page('a'), 'Projects')).toBeNull()
  expect(dropCommand(tree, page('b'), '')).toBeNull()
  // A page only linked to is listed at the top level already.
  expect(dropCommand(tree, page('idea', true), '')).toBeNull()
  expect(dropCommand(tree, page('idea', true), 'Other')).toEqual({ type: 'page.move', key: 'idea', folder: 'Other' })
})

test('a folder moves, but not onto its parent, itself or a folder inside it', () => {
  expect(dropCommand(tree, folder('Projects/Sub'), 'Other')).toEqual({ type: 'dir.rename', path: 'Projects/Sub', to: 'Other/Sub' })
  expect(dropCommand(tree, folder('Projects/Sub'), '')).toEqual({ type: 'dir.rename', path: 'Projects/Sub', to: 'Sub' })
  expect(dropCommand(tree, folder('Projects/Sub'), 'Projects')).toBeNull()
  expect(dropCommand(tree, folder('Other'), '')).toBeNull()
  expect(dropCommand(tree, folder('Projects'), 'Projects')).toBeNull()
  expect(dropCommand(tree, folder('Projects'), 'Projects/Sub/Deep')).toBeNull()
  // A folder whose name only starts the same is not inside it.
  const t2: TreeView = { ...tree, pages: [...tree.pages, { kind: 'folder', name: 'Projects2', path: 'Projects2', children: [] }] }
  expect(dropCommand(t2, folder('Projects'), 'Projects2')).toEqual({
    type: 'dir.rename',
    path: 'Projects',
    to: 'Projects2/Projects',
  })
})

test('rows that cannot be dragged give no command', () => {
  expect(dropCommand(tree, day, 'Other')).toBeNull()
  expect(dropCommand(tree, tag, 'Other')).toBeNull()
})

test('canDrop: a command exists, and never over the dragged row itself', () => {
  expect(canDrop(tree, page('a'), folder('Other'))).toBe(true)
  expect(canDrop(tree, page('a'), page('b'))).toBe(true)
  expect(canDrop(tree, page('a'), PAGES)).toBe(true)
  expect(canDrop(tree, page('a'), page('a'))).toBe(false)
  expect(canDrop(tree, page('b'), PAGES)).toBe(false)
  expect(canDrop(tree, folder('Projects'), folder('Projects'))).toBe(false)
  expect(canDrop(tree, folder('Projects'), folder('Projects/Sub'))).toBe(false)
  expect(canDrop(tree, folder('Projects/Sub'), page('a'))).toBe(false)
  expect(canDrop(tree, page('a'), tag)).toBe(false)
  expect(canDrop(tree, page('a'), day)).toBe(false)
})

test('the drag data of a tree row is told apart from a board card', () => {
  expect(treeData({ 'breccia-tree': true, id: 'p:a' })).toBe('p:a')
  expect(treeData({ 'breccia-card': true, id: 3, state: 'TODO' })).toBeNull()
  expect(treeData({ id: 'p:a' })).toBeNull()
})

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

test('a collapsed folder opens after the pointer stays on it for 0.7 s', () => {
  const opened: string[] = []
  const h = hoverOpen((id) => opened.push(id))
  h.enter('f:Other', true)
  vi.advanceTimersByTime(699)
  expect(opened).toEqual([])
  vi.advanceTimersByTime(1)
  expect(opened).toEqual(['f:Other'])
})

test('leaving earlier, an open folder, a page row, or an ended drag opens nothing', () => {
  const opened: string[] = []
  const h = hoverOpen((id) => opened.push(id))
  h.enter('f:Other', true)
  vi.advanceTimersByTime(500)
  h.leave()
  vi.advanceTimersByTime(1000)
  h.enter('f:Projects', false)
  vi.advanceTimersByTime(1000)
  h.enter('p:a', false)
  vi.advanceTimersByTime(1000)
  h.enter('f:Other', true)
  h.end()
  vi.advanceTimersByTime(1000)
  expect(opened).toEqual([])
  // A new row restarts the wait.
  h.enter('f:Other', true)
  vi.advanceTimersByTime(400)
  h.enter('f:Projects/Sub', true)
  vi.advanceTimersByTime(400)
  expect(opened).toEqual([])
  vi.advanceTimersByTime(300)
  expect(opened).toEqual(['f:Projects/Sub'])
})
