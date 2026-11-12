import { expect, test } from 'vitest'
import { isNewer } from './treeVersion'
import type { TreeView } from './types'

const tree = (version: number): TreeView => ({ pages: [], journals: [], tags: [], version })

test('the first tree is always taken', () => {
  expect(isNewer(null, tree(5))).toBe(true)
})

test('a newer or the same tree replaces the shown one', () => {
  expect(isNewer(tree(5), tree(6))).toBe(true)
  expect(isNewer(tree(5), tree(5))).toBe(true)
})

test('an older tree that arrives late is ignored', () => {
  expect(isNewer(tree(6), tree(5))).toBe(false)
})
