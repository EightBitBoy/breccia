import { expect, test } from 'vitest'
import { MainArea, type MainKind, type MainView } from './mainArea.svelte'

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

test('after any sequence of shows and leaves, every part not shown has had its left since it was shown', () => {
  const kinds: MainView[] = [
    { kind: 'none' }, { kind: 'newPage', folder: '' }, { kind: 'page' }, { kind: 'feed' }, { kind: 'board' },
    { kind: 'allPages' }, { kind: 'archive' }, { kind: 'dailies' }, { kind: 'gitLog' }, { kind: 'graph' },
    { kind: 'settings' },
  ]
  let seed = 19
  const next = (n: number) => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed % n
  }
  const area = new MainArea()
  /** Kinds shown since their last `left()`. */
  const owing = new Set<MainKind>()
  for (const { kind } of kinds) {
    if (kind === 'none' || kind === 'newPage') continue
    area.register(kind, {
      left: () => {
        expect(area.view.kind).toBe(kind) // a part leaves only while it is the shown one
        owing.delete(kind)
      },
    })
  }
  for (let step = 0; step < 2000; step++) {
    const v = kinds[next(kinds.length)]
    const op = next(3)
    if (op === 0) area.show(v)
    else if (op === 1) area.leave(v.kind)
    else area.leaveFor(v.kind)
    if (area.view.kind !== 'none' && area.view.kind !== 'newPage') owing.add(area.view.kind)
    for (const k of owing) if (k !== area.view.kind) expect.fail(`${k} was left without its left() (step ${step})`)
  }
})
