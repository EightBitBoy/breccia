import { expect, test } from 'vitest'
import { editableBlocks, editablePageOf, walkOrder, type EditableView } from './editable'
import type { Feed } from './feed'
import type { BlockView, PageView, RefsView } from './types'

const blk = (id: number, depth = 0): BlockView => ({
  id, depth, text: '', html: '', state: null, finished: false, hasChildren: false,
})
const pg = (key: string, blocks: BlockView[]): PageView => ({
  key, name: key, kind: 'page', title: key, preambleHtml: '', hasFile: true, blocks,
})
const refsOf = (key: string, blocks: BlockView[]): RefsView => ({
  key, count: 1, groups: [{ page: key, title: key, kind: 'page', refs: [{ crumbs: [], blocks }] }],
})

const none: EditableView = { board: false, card: null, feed: null, page: null, refs: null }
test('a board edits only its open card', () => {
  const card = refsOf('c', [blk(7)])
  expect(editableBlocks({ ...none, board: true, page: pg('p', [blk(1)]) }, new Set())).toEqual([])
  expect(editableBlocks({ ...none, board: true, card }, new Set()).map((b) => b.id)).toEqual([7])
  expect(editablePageOf({ ...none, board: true, card }, 7)).toBe('c')
  expect(editablePageOf({ ...none, board: true, card }, 1)).toBeNull()
})
test('the feed edits its loaded days; ↑/↓ walk one run of loaded days', () => {
  const feed: Feed = { today: 'd1', days: [{ key: 'd1', title: '' }, { key: 'd2', title: '' }, { key: 'd3', title: '' }], loaded: { d1: pg('d1', [blk(1)]), d3: pg('d3', [blk(3)]) } }
  const v = { ...none, feed }
  expect(editableBlocks(v, new Set()).map((b) => b.id)).toEqual([1, 3])
  expect(walkOrder(v, new Set(), 3).map((b) => b.id)).toEqual([3])
  expect(editablePageOf(v, 3)).toBe('d3')
})
test('a page edits its own blocks and its references', () => {
  const v = { ...none, page: pg('p', [blk(1)]), refs: refsOf('g', [blk(5)]) }
  expect(editableBlocks(v, new Set()).map((b) => b.id)).toEqual([1, 5])
  expect([editablePageOf(v, 1), editablePageOf(v, 5)]).toEqual(['p', 'g'])
  expect(walkOrder(v, new Set(), 1).map((b) => b.id)).toEqual([1, 5])
})
