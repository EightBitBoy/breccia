import { describe, expect, it } from 'vitest'
import { StatusItems } from './status.svelte'
import type { StatusItem } from './status'

const item = (id: string, side: 'left' | 'right', order: number, text = id): StatusItem => ({
  id, side, order, text, progress: null, tone: 'normal',
})

describe('StatusItems', () => {
  it('set adds an item and replaces one with the same id', () => {
    const s = new StatusItems()
    s.set(item('index', 'left', 10, 'one'))
    s.set(item('git', 'right', 1))
    s.set(item('index', 'left', 10, 'two'))
    expect(s.left.map((i) => i.text)).toEqual(['two'])
    expect(s.right.map((i) => i.id)).toEqual(['git'])
  })

  it('clear removes it and leaves others', () => {
    const s = new StatusItems()
    s.set(item('index', 'left', 10))
    s.set(item('git', 'right', 1))
    s.clear('index')
    s.clear('nothing')
    expect(s.left).toEqual([])
    expect(s.right.map((i) => i.id)).toEqual(['git'])
    expect(s.empty).toBe(false)
  })

  it('empty is true with no items', () => {
    const s = new StatusItems()
    expect(s.empty).toBe(true)
    s.set(item('index', 'left', 10))
    expect(s.empty).toBe(false)
    s.clear('index')
    expect(s.empty).toBe(true)
  })

  it('left and right follow placeItems', () => {
    const s = new StatusItems()
    for (const i of [item('b', 'left', 5), item('git', 'right', 1), item('a', 'left', 5), item('x', 'left', 1), item('z', 'right', 0)]) s.set(i)
    expect(s.left.map((i) => i.id)).toEqual(['x', 'a', 'b'])
    expect(s.right.map((i) => i.id)).toEqual(['z', 'git'])
  })
})
