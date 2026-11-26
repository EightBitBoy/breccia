import { expect, test } from 'vitest'
import { MainArea } from './mainArea.svelte'

function setup() {
  const area = new MainArea()
  const left: string[] = []
  area.register('archive', { left: () => left.push('archive') })
  area.register('allPages', { left: () => left.push('allPages') })
  return { area, left }
}

test('show replaces the view and runs the old part\'s left', () => {
  const { area, left } = setup()
  area.show({ kind: 'archive' })
  expect(area.view).toEqual({ kind: 'archive' })
  area.show({ kind: 'allPages' })
  expect(area.view).toEqual({ kind: 'allPages' })
  expect(left).toEqual(['archive'])
})

test('showing the same kind again runs no left', () => {
  const { area, left } = setup()
  area.show({ kind: 'archive' })
  area.show({ kind: 'archive' })
  expect(left).toEqual([])
  expect(area.is('archive')).toBe(true)
})

test('a view without a part is replaced without a left', () => {
  const { area, left } = setup()
  area.show({ kind: 'newPage', folder: 'a' })
  area.show({ kind: 'archive' })
  expect(left).toEqual([])
  expect(area.view).toEqual({ kind: 'archive' })
})

test('leave of a kind not shown does nothing', () => {
  const { area, left } = setup()
  area.show({ kind: 'archive' })
  area.leave('allPages')
  expect(area.view).toEqual({ kind: 'archive' })
  expect(left).toEqual([])
})

test('leave of the shown kind goes to none and runs its left', () => {
  const { area, left } = setup()
  area.show({ kind: 'archive' })
  area.leave('archive')
  expect(area.view).toEqual({ kind: 'none' })
  expect(left).toEqual(['archive'])
})

test('leaveFor keeps the given kind and leaves any other', () => {
  const { area, left } = setup()
  area.show({ kind: 'archive' })
  area.leaveFor('archive')
  expect(area.view).toEqual({ kind: 'archive' })
  expect(left).toEqual([])
  area.leaveFor('feed')
  expect(area.view).toEqual({ kind: 'none' })
  expect(left).toEqual(['archive'])
})
