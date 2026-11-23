import { expect, test, vi } from 'vitest'
import { DuePick } from './duePick.svelte'

const box = { left: 10, top: 20, right: 30, bottom: 40 }

test('show opens at the due date and the anchor', () => {
  const p = new DuePick()
  expect(p.open).toBe(false)
  p.show('2026-12-01', box, () => {})
  expect(p.open).toBe(true)
  expect(p.due).toBe('2026-12-01')
  expect(p.anchor).toEqual(box)
})

test('pick calls run once with the day and closes', () => {
  const p = new DuePick()
  const run = vi.fn()
  p.show(null, box, run)
  p.pick('2026-12-01')
  expect(run).toHaveBeenCalledTimes(1)
  expect(run).toHaveBeenCalledWith('2026-12-01')
  expect(p.open).toBe(false)
})

test('remove calls run with null and closes', () => {
  const p = new DuePick()
  const run = vi.fn()
  p.show('2026-12-01', box, run)
  p.remove()
  expect(run).toHaveBeenCalledTimes(1)
  expect(run).toHaveBeenCalledWith(null)
  expect(p.open).toBe(false)
})

test('close calls nothing', () => {
  const p = new DuePick()
  const run = vi.fn()
  p.show('2026-12-01', box, run)
  p.close()
  expect(run).not.toHaveBeenCalled()
  expect(p.open).toBe(false)
})

test('a pick or removal after closing calls nothing', () => {
  const p = new DuePick()
  const run = vi.fn()
  p.show(null, box, run)
  p.pick('2026-12-01')
  p.pick('2026-12-02')
  p.remove()
  expect(run).toHaveBeenCalledTimes(1)
  p.show(null, box, run)
  p.close()
  p.pick('2026-12-03')
  expect(run).toHaveBeenCalledTimes(1)
})

test('show while open replaces the earlier run', () => {
  const p = new DuePick()
  const first = vi.fn()
  const second = vi.fn()
  p.show(null, box, first)
  p.show('2026-12-05', box, second)
  expect(p.due).toBe('2026-12-05')
  p.pick('2026-12-07')
  expect(first).not.toHaveBeenCalled()
  expect(second).toHaveBeenCalledWith('2026-12-07')
})
