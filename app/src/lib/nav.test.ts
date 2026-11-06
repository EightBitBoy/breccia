import { expect, test } from 'vitest'
import { placeHere, samePlace, topDayOf } from './nav'

const none = {
  newPage: false,
  settings: false,
  graph: false,
  board: null,
  gitLog: false,
  archive: false,
  allPages: false,
  feed: false,
  feedDay: null,
  page: null,
}

test('placeHere follows the order the main area shows views in', () => {
  expect(placeHere({ ...none, newPage: true, settings: true, page: 'Anna' })).toBeNull()
  expect(placeHere({ ...none, settings: true, board: 'Tasks' })).toEqual({ kind: 'settings' })
  expect(placeHere({ ...none, graph: true, board: 'Tasks' })).toEqual({ kind: 'graph' })
  expect(placeHere({ ...none, board: 'Tasks', gitLog: true })).toEqual({ kind: 'board', name: 'Tasks' })
  expect(placeHere({ ...none, gitLog: true, archive: true })).toEqual({ kind: 'gitLog' })
  expect(placeHere({ ...none, archive: true, allPages: true })).toEqual({ kind: 'archive' })
  expect(placeHere({ ...none, allPages: true, feed: true })).toEqual({ kind: 'allPages' })
  expect(placeHere({ ...none, feed: true, feedDay: '2026-03-12', page: 'Anna' })).toEqual({
    kind: 'feed',
    day: '2026-03-12',
  })
  expect(placeHere({ ...none, feed: true })).toEqual({ kind: 'feed', day: null })
  expect(placeHere({ ...none, page: 'Anna' })).toEqual({ kind: 'page', key: 'Anna' })
  expect(placeHere(none)).toBeNull()
})

test('samePlace compares kind and what the place names', () => {
  expect(samePlace({ kind: 'page', key: 'A' }, { kind: 'page', key: 'A' })).toBe(true)
  expect(samePlace({ kind: 'page', key: 'A' }, { kind: 'page', key: 'B' })).toBe(false)
  expect(samePlace({ kind: 'feed', day: null }, { kind: 'feed', day: '2026-03-12' })).toBe(false)
  expect(samePlace({ kind: 'feed', day: '2026-03-12' }, { kind: 'feed', day: '2026-03-12' })).toBe(true)
  expect(samePlace({ kind: 'board', name: 'A' }, { kind: 'board', name: 'B' })).toBe(false)
  expect(samePlace({ kind: 'allPages' }, { kind: 'archive' })).toBe(false)
  expect(samePlace({ kind: 'settings' }, { kind: 'settings' })).toBe(true)
  expect(samePlace(null, null)).toBe(true)
  expect(samePlace(null, { kind: 'graph' })).toBe(false)
  expect(samePlace({ kind: 'graph' }, null)).toBe(false)
})

test('topDayOf is the first day whose bottom is below the top edge', () => {
  const days = [
    { key: 'a', top: -300, bottom: -10 },
    { key: 'b', top: -10, bottom: 400 },
    { key: 'c', top: 400, bottom: 900 },
  ]
  expect(topDayOf(days, 0)).toBe('b')
  expect(topDayOf(days, 500)).toBe('c')
  expect(topDayOf([], 0)).toBeNull()
})
