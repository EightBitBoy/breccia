import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { SCROLL_FADE_MS, ScrollFade } from './scrollFade'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

function make() {
  const seen: boolean[] = []
  const f = new ScrollFade((on) => seen.push(on))
  return { f, seen }
}

test('a poke shows the scrollbar and it hides once the pointer rests', () => {
  const { f, seen } = make()
  expect(f.on).toBe(false)
  f.poke()
  expect(f.on).toBe(true)
  vi.advanceTimersByTime(SCROLL_FADE_MS - 1)
  expect(f.on).toBe(true)
  vi.advanceTimersByTime(1)
  expect(f.on).toBe(false)
  expect(seen).toEqual([true, false])
})

test('every poke starts the wait again, without telling twice', () => {
  const { f, seen } = make()
  f.poke()
  vi.advanceTimersByTime(SCROLL_FADE_MS - 100)
  f.poke()
  vi.advanceTimersByTime(SCROLL_FADE_MS - 100)
  expect(f.on).toBe(true)
  vi.advanceTimersByTime(100)
  expect(f.on).toBe(false)
  expect(seen).toEqual([true, false])
})

test('leaving hides it after the same wait; a leave while hidden does nothing', () => {
  const { f, seen } = make()
  f.leave()
  vi.advanceTimersByTime(SCROLL_FADE_MS)
  expect(seen).toEqual([])
  f.poke()
  vi.advanceTimersByTime(200)
  f.leave()
  vi.advanceTimersByTime(SCROLL_FADE_MS - 1)
  expect(f.on).toBe(true)
  vi.advanceTimersByTime(1)
  expect(seen).toEqual([true, false])
})

test('stop clears the timer', () => {
  const { f, seen } = make()
  f.poke()
  f.stop()
  vi.advanceTimersByTime(SCROLL_FADE_MS * 2)
  expect(seen).toEqual([true])
})
