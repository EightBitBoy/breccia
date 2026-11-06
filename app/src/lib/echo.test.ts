import { expect, test } from 'vitest'
import { Echoes } from './echo'
import type { PageView } from './types'

function page(key: string): PageView {
  return { key, name: key, title: key, blocks: [] } as unknown as PageView
}

test('an own page is an echo until it changes', () => {
  const e = new Echoes()
  const p = page('a')
  e.ownPage(p)
  expect(e.isOwnPage(structuredClone(p))).toBe(true)
  expect(e.isOwnPage({ ...p, title: 'x' })).toBe(false)
})

test('a page of a key never recorded is not stringified', () => {
  const p = {
    ...page('q'),
    toJSON() {
      throw new Error('stringified')
    },
  }
  expect(new Echoes().isOwnPage(p as unknown as PageView)).toBe(false)
})

test('only the last 8 own pages count', () => {
  const e = new Echoes()
  const keys = 'abcdefghi'.split('')
  keys.forEach((k) => e.ownPage(page(k)))
  expect(e.isOwnPage(page('a'))).toBe(false)
  expect(e.isOwnPage(page('b'))).toBe(true)
  expect(e.isOwnPage(page('i'))).toBe(true)
})

test('a removal is own until its page comes back', () => {
  const e = new Echoes()
  e.ownRemovals(['a'], null)
  expect(e.isOwnRemoval('a')).toBe(true)
  e.ownRemovals([], 'a')
  expect(e.isOwnRemoval('a')).toBe(false)
})
