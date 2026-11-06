import { expect, test } from 'vitest'
import { ancestorsOf, visible } from './tree'
import type { BlockView } from './types'

function blocks(depths: number[]): BlockView[] {
  return depths.map((depth, i) => ({
    id: i,
    depth,
    text: '',
    html: '',
    state: null,
    finished: false,
    hasChildren: depths[i + 1] !== undefined && depths[i + 1] > depth,
  }))
}

test('folding hides descendants only', () => {
  const b = blocks([0, 1, 2, 1, 0])
  expect(visible(b, new Set()).map((x) => x.id)).toEqual([0, 1, 2, 3, 4])
  expect(visible(b, new Set([0])).map((x) => x.id)).toEqual([0, 4])
  expect(visible(b, new Set([1])).map((x) => x.id)).toEqual([0, 1, 3, 4])
})

test('nested folded blocks and a folded leaf', () => {
  const b = blocks([0, 1, 2, 1, 0, 0])
  expect(visible(b, new Set([0, 1])).map((x) => x.id)).toEqual([0, 4, 5])
  expect(visible(b, new Set([2, 5])).map((x) => x.id)).toEqual([0, 1, 2, 3, 4, 5])
})

test('ancestorsOf lists the parents outermost first', () => {
  const bs = blocks([0, 1, 2, 1])
  expect(ancestorsOf(bs, 2)).toEqual([0, 1])
  expect(ancestorsOf(bs, 3)).toEqual([0])
  expect(ancestorsOf(bs, 9)).toEqual([])
})
