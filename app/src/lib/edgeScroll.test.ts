import { expect, test } from 'vitest'
import { edgeSpeed } from './edgeScroll'

// A view from x = 100 to x = 900, with a 60 px edge zone and a top speed of 20 px per frame.
const speed = (x: number) => edgeSpeed(x, 100, 900, 60, 20)

test('no scrolling away from the edges', () => {
  expect(speed(500)).toBe(0)
  expect(speed(160)).toBe(0)
  expect(speed(840)).toBe(0)
})

test('the speed grows towards the edge, left is negative and right is positive', () => {
  expect(speed(130)).toBe(-10)
  expect(speed(870)).toBe(10)
  expect(Math.abs(speed(110))).toBeGreaterThan(Math.abs(speed(130)))
})

test('at or beyond the edge it scrolls at the top speed', () => {
  expect(speed(100)).toBe(-20)
  expect(speed(40)).toBe(-20)
  expect(speed(900)).toBe(20)
  expect(speed(1200)).toBe(20)
})

test('a view too narrow for two zones does not scroll both ways', () => {
  // 100 px wide with 60 px zones: the middle belongs to the nearer edge only.
  expect(edgeSpeed(49, 0, 100, 60, 20)).toBeLessThan(0)
  expect(edgeSpeed(51, 0, 100, 60, 20)).toBeGreaterThan(0)
})
