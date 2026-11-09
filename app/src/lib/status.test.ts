import { describe, expect, it } from 'vitest'
import { helpItem, indexItem, placeItems, themeItem, type StatusItem } from './status'

const item = (id: string, side: 'left' | 'right', order: number): StatusItem => ({ id, side, order, text: id, progress: null, tone: 'normal' })

describe('placeItems', () => {
  it('splits by side and sorts by order, then id', () => {
    const r = placeItems([item('b', 'left', 5), item('git', 'right', 1), item('a', 'left', 5), item('x', 'left', 1)])
    expect(r.left.map((i) => i.id)).toEqual(['x', 'a', 'b'])
    expect(r.right.map((i) => i.id)).toEqual(['git'])
  })
})

describe('indexItem', () => {
  it('shows the progress of a running build', () => {
    expect(indexItem({ done: 1200, total: 5000, generation: 1 }, 1)).toEqual({
      id: 'index', side: 'left', order: 10, text: 'Indexing for search · 1,200 of 5,000 pages', progress: 0.24, tone: 'normal',
    })
  })
  it('is gone when the build is finished or empty', () => {
    expect(indexItem({ done: 70, total: 70, generation: 1 }, 1)).toBeNull()
    expect(indexItem({ done: 0, total: 0, generation: 1 }, 1)).toBeNull()
  })
})

describe('indexItem generation', () => {
  it('ignores an old loop event', () => {
    expect(indexItem({ done: 1, total: 5, generation: 1 }, 2)).toBe('ignore')
  })
  it('shows the current generation, or any while none is known', () => {
    expect(indexItem({ done: 1, total: 5, generation: 2 }, 2)).not.toBe('ignore')
    expect(indexItem({ done: 1, total: 5, generation: 2 }, null)).not.toBe('ignore')
  })
})

describe('helpItem', () => {
  it('is a button at the right end, pressed while the list is open', () => {
    const a = helpItem(false)
    expect(a).toMatchObject({ id: 'help', side: 'right', text: '?', action: true, pressed: false })
    expect(a.tip).toContain('F1')
    expect(helpItem(true).pressed).toBe(true)
  })
  it('comes after the zoom (30) and the history button (11) on the right', () => {
    const placed = placeItems([helpItem(false), { ...item('zoom', 'right', 30) }, { ...item('gitLog', 'right', 11) }])
    expect(placed.right.map((i) => i.id)).toEqual(['gitLog', 'zoom', 'help'])
  })
})

describe('themeItem', () => {
  it('is a button named Theme with a symbol for its text', () => {
    const t = themeItem()
    expect(t).toMatchObject({ id: 'theme', side: 'right', action: true, tip: 'Theme', label: 'Theme', progress: null, tone: 'normal' })
    expect(t.text).toBe('◐')
    expect(t.icon).toBeUndefined()
  })
  it('sits just before the ? button, after the zoom and the history button', () => {
    const placed = placeItems([helpItem(false), themeItem(), item('zoom', 'right', 30), item('gitLog', 'right', 11)])
    expect(placed.right.map((i) => i.id)).toEqual(['gitLog', 'zoom', 'theme', 'help'])
  })
})
