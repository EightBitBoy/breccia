import { expect, test } from 'vitest'
import { placeOfView, samePlace, topDayOf } from './nav'

test('placeOfView gives the same places as placeHere did', () => {
  const ctx = { board: 'Tasks', feedDay: '2026-03-12', page: 'Anna' }
  expect(placeOfView({ kind: 'newPage', folder: '' }, ctx)).toBeNull()
  expect(placeOfView({ kind: 'none' }, ctx)).toBeNull()
  expect(placeOfView({ kind: 'board' }, ctx)).toEqual({ kind: 'board', name: 'Tasks' })
  expect(placeOfView({ kind: 'board' }, { ...ctx, board: null })).toBeNull()
  expect(placeOfView({ kind: 'feed' }, ctx)).toEqual({ kind: 'feed', day: '2026-03-12' })
  expect(placeOfView({ kind: 'feed' }, { ...ctx, feedDay: null })).toEqual({ kind: 'feed', day: null })
  expect(placeOfView({ kind: 'page' }, ctx)).toEqual({ kind: 'page', key: 'Anna' })
  expect(placeOfView({ kind: 'page' }, { ...ctx, page: null })).toBeNull()
  for (const kind of ['allPages', 'archive', 'dailies', 'gitLog', 'graph', 'settings'] as const) {
    expect(placeOfView({ kind }, ctx)).toEqual({ kind })
  }
})

test('samePlace compares kind and what the place names', () => {
  expect(samePlace({ kind: 'page', key: 'A' }, { kind: 'page', key: 'A' })).toBe(true)
  expect(samePlace({ kind: 'page', key: 'A' }, { kind: 'page', key: 'B' })).toBe(false)
  expect(samePlace({ kind: 'feed', day: null }, { kind: 'feed', day: '2026-03-12' })).toBe(false)
  expect(samePlace({ kind: 'feed', day: '2026-03-12' }, { kind: 'feed', day: '2026-03-12' })).toBe(true)
  expect(samePlace({ kind: 'board', name: 'A' }, { kind: 'board', name: 'B' })).toBe(false)
  expect(samePlace({ kind: 'allPages' }, { kind: 'archive' })).toBe(false)
  expect(samePlace({ kind: 'dailies' }, { kind: 'dailies' })).toBe(true)
  expect(samePlace({ kind: 'dailies' }, { kind: 'archive' })).toBe(false)
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
