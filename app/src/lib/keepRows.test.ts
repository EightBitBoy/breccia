import { describe, expect, it } from 'vitest'
import { firstShown, rowsMoved } from './keepRows'

describe('firstShown', () => {
  it('is -1 while the rows have not been scrolled into', () => {
    expect(firstShown(0, 120, 33)).toBe(-1)
    expect(firstShown(120, 120, 33)).toBe(-1)
  })
  it('is the index of the row at the top edge', () => {
    expect(firstShown(121, 120, 33)).toBe(0)
    expect(firstShown(120 + 33 * 5 + 2, 120, 33)).toBe(5)
  })
})

describe('rowsMoved', () => {
  it('counts the rows added above the first shown one', () => {
    expect(rowsMoved(['a', 'b', 'c', 'd'], ['n', 'a', 'b', 'c'], 2)).toBe(1)
    expect(rowsMoved(['a', 'b', 'c'], ['x', 'y', 'z', 'a', 'b', 'c'], 1)).toBe(3)
  })
  it('is negative when rows above it went', () => {
    expect(rowsMoved(['a', 'b', 'c', 'd'], ['c', 'd'], 2)).toBe(-2)
  })
  it('is 0 at the top, for a row that is gone, and for an index past the end', () => {
    expect(rowsMoved(['a', 'b'], ['n', 'a', 'b'], -1)).toBe(0)
    expect(rowsMoved(['a', 'b'], ['x', 'y'], 1)).toBe(0)
    expect(rowsMoved(['a', 'b'], ['n', 'a', 'b'], 5)).toBe(0)
  })
})
