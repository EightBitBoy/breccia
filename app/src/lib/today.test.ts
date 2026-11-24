import { afterEach, expect, test, vi } from 'vitest'
import { Today, type TodayEnv } from './today.svelte'

afterEach(() => vi.useRealTimers())

function env(now: () => Date) {
  let fire: (() => void) | null = null
  const stop = vi.fn()
  const e: TodayEnv = {
    now,
    timers: { set: setTimeout, clear: clearTimeout },
    listen(f) {
      fire = f
      return stop
    },
  }
  return { e, focus: () => fire?.(), stop }
}

test('check moves key when the day changes', () => {
  const t = new Today(env(() => new Date(2026, 10, 23, 12)).e)
  expect(t.key).toBe('2026-11-23')
  t.check(new Date(2026, 10, 23, 23, 59))
  expect(t.key).toBe('2026-11-23')
  t.check(new Date(2026, 10, 24, 0, 0, 1))
  expect(t.key).toBe('2026-11-24')
})

test('start re-checks just after midnight and stop ends it', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 10, 23, 23, 59, 0))
  const t = new Today(env(() => new Date()).e)
  const stop = t.start()
  vi.advanceTimersByTime(60_000)
  expect(t.key).toBe('2026-11-23')
  vi.advanceTimersByTime(1_000)
  expect(t.key).toBe('2026-11-24')
  stop()
  vi.advanceTimersByTime(48 * 3600_000)
  expect(t.key).toBe('2026-11-24')
})

test('a focus or visibility event after a clock jump updates key; stop unlistens', () => {
  let clock = new Date(2026, 10, 23, 10)
  const { e, focus, stop: unlisten } = env(() => clock)
  const t = new Today(e)
  const stop = t.start()
  clock = new Date(2026, 10, 26, 8)
  expect(t.key).toBe('2026-11-23')
  focus()
  expect(t.key).toBe('2026-11-26')
  stop()
  expect(unlisten).toHaveBeenCalledTimes(1)
})

function countingEnv() {
  const e = env(() => new Date(2026, 10, 23, 10))
  const listen = vi.fn(e.e.listen)
  const set = vi.fn(e.e.timers.set)
  const env2: TodayEnv = { ...e.e, listen, timers: { set, clear: e.e.timers.clear } }
  return { env2, listen, set, unlisten: e.stop }
}

test('start twice runs once; the second stop function stops that run; start works again after stop', () => {
  vi.useFakeTimers()
  const { env2, listen, set, unlisten } = countingEnv()
  const t = new Today(env2)
  const stop1 = t.start()
  const timers1 = set.mock.calls.length
  const stop2 = t.start()
  expect(listen).toHaveBeenCalledTimes(1)
  expect(set).toHaveBeenCalledTimes(timers1)
  expect(timers1).toBe(1)
  stop2()
  expect(unlisten).toHaveBeenCalledTimes(1)
  stop1()
  expect(unlisten).toHaveBeenCalledTimes(1)
  t.start()
  expect(listen).toHaveBeenCalledTimes(2)
})
