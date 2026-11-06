import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { HoverGate, QUIET_MS } from './hoverGate'

describe('HoverGate', () => {
  let applied: (string | null)[]
  let gate: HoverGate

  beforeEach(() => {
    vi.useFakeTimers()
    applied = []
    gate = new HoverGate((k) => applied.push(k))
  })
  afterEach(() => {
    gate.dispose()
    vi.useRealTimers()
  })

  test('with no gesture a hover applies at once', () => {
    gate.hover('a')
    gate.hover(null)
    expect(applied).toEqual(['a', null])
  })

  test('while a mouse button is down hovers wait; the last one applies once on release', () => {
    gate.press()
    gate.hover('a')
    gate.hover(null)
    gate.hover('b')
    expect(applied).toEqual([])
    gate.release()
    expect(applied).toEqual(['b'])
  })

  test('a release with no hover during the press applies nothing', () => {
    gate.press()
    gate.release()
    expect(applied).toEqual([])
  })

  test('a wheel burst holds hovers until it has been quiet for QUIET_MS', () => {
    gate.moved()
    gate.hover('a')
    gate.hover(null)
    vi.advanceTimersByTime(QUIET_MS - 10)
    gate.moved()
    gate.hover('c')
    vi.advanceTimersByTime(QUIET_MS - 10)
    expect(applied).toEqual([])
    vi.advanceTimersByTime(10)
    expect(applied).toEqual(['c'])
    gate.hover('d')
    expect(applied).toEqual(['c', 'd'])
  })

  test('the quiet time ending while the button is still down waits for the release', () => {
    gate.moved()
    gate.press()
    gate.hover('a')
    vi.advanceTimersByTime(QUIET_MS * 2)
    expect(applied).toEqual([])
    gate.release()
    expect(applied).toEqual(['a'])
  })

  test('a release inside the quiet time waits for it to end', () => {
    gate.press()
    gate.hover('a')
    gate.moved()
    gate.release()
    expect(applied).toEqual([])
    vi.advanceTimersByTime(QUIET_MS)
    expect(applied).toEqual(['a'])
  })

  test('reset drops a waiting hover', () => {
    gate.press()
    gate.hover('a')
    gate.reset()
    gate.release()
    expect(applied).toEqual([])
  })
})
