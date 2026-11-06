import { expect, test, vi } from 'vitest'
import { AutoArchive, HOUR_MS, archiveShift, hourly } from './autoArchive'
import type { BlockId, Command, ConfigView } from './types'

function setup(o: { enabled?: boolean; editing?: BlockId | null } = {}) {
  const sent: Command[] = []
  let answer: (() => void) | null = null
  const state = { enabled: o.enabled ?? true, editing: o.editing ?? null, fail: null as unknown }
  const a = new AutoArchive({
    run: (cmd) => {
      sent.push(cmd)
      return new Promise((resolve, reject) => {
        answer = () => (state.fail ? reject(state.fail) : resolve(undefined))
      })
    },
    editing: () => state.editing,
    enabled: () => state.enabled,
  })
  return { a, sent, state, answer: () => answer?.() }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

test('a run sends archive.auto with the block being edited', async () => {
  const { a, sent, answer } = setup({ editing: 7 })
  const done = a.run()
  answer()
  await done
  expect(sent).toEqual([{ type: 'archive.auto', editing: 7 }])
})

test('nothing is sent while switched off or without a folder', async () => {
  const { a, sent } = setup({ enabled: false })
  await a.run()
  expect(sent).toEqual([])
})

test('one run at a time; a run asked for meanwhile follows once, with the block edited then', async () => {
  const { a, sent, state, answer } = setup({ editing: 1 })
  const first = a.run()
  void a.run()
  void a.run()
  expect(sent.length).toBe(1)
  state.editing = 2
  answer()
  await flush()
  expect(sent).toEqual([
    { type: 'archive.auto', editing: 1 },
    { type: 'archive.auto', editing: 2 },
  ])
  answer()
  await first
  expect(sent.length).toBe(2)
})

test('a failed run is no notice and does not stop later runs', async () => {
  const { a, sent, state, answer } = setup()
  state.fail = { code: 'stale', message: 'stale' }
  const err = vi.spyOn(console, 'error').mockImplementation(() => {})
  const one = a.run()
  answer()
  await one
  state.fail = null
  const two = a.run()
  answer()
  await two
  expect(sent.length).toBe(2)
  expect(err).not.toHaveBeenCalled() // a stale run after a folder switch is expected
  err.mockRestore()
})

const cfg = (archiveAfterDays: number, autoArchive: boolean): ConfigView => ({
  states: [],
  boards: [],
  archiveAfterDays,
  autoArchive,
  git: { enabled: true, commitDelayMinutes: 5, pullIntervalMinutes: 5 },
  version: 1,
})

test('archiveShift: the switch turned on or the days changed while on', () => {
  expect(archiveShift(cfg(14, false), cfg(14, true))).toBe(true)
  expect(archiveShift(cfg(14, true), cfg(7, true))).toBe(true)
  expect(archiveShift(cfg(14, true), cfg(14, true))).toBe(false)
  expect(archiveShift(cfg(14, true), cfg(14, false))).toBe(false)
  expect(archiveShift(cfg(14, false), cfg(7, false))).toBe(false)
  // A folder's first settings: the folder load runs it (`openFolder`).
  expect(archiveShift(null, cfg(14, true))).toBe(false)
})

test('hourly runs once an hour until stopped', () => {
  vi.useFakeTimers()
  try {
    const f = vi.fn()
    const stop = hourly(f)
    vi.advanceTimersByTime(HOUR_MS - 1)
    expect(f).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(f).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(HOUR_MS)
    expect(f).toHaveBeenCalledTimes(2)
    stop()
    vi.advanceTimersByTime(3 * HOUR_MS)
    expect(f).toHaveBeenCalledTimes(2)
  } finally {
    vi.useRealTimers()
  }
})
