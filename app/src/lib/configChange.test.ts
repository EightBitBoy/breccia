import { expect, test } from 'vitest'
import { configShift, isNewerConfig } from './configChange'
import type { ConfigView } from './types'

const cfg = (over: Partial<ConfigView> = {}): ConfigView => ({
  states: [{ keyword: 'TODO', color: 'grey', finished: false, inCycle: true }],
  boards: [{ name: 'Tasks', columns: ['TODO'] }],
  archiveAfterDays: 14,
  autoArchive: true,
  git: { enabled: true, commitDelayMinutes: 5, pullIntervalMinutes: 10 },
  version: 1,
  ...over,
})

test('the first config of a folder refreshes nothing', () => {
  expect(configShift(null, cfg())).toEqual({ tasks: false, board: false })
})

test('the same settings refresh nothing, whatever the version', () => {
  expect(configShift(cfg(), cfg({ version: 2 }))).toEqual({ tasks: false, board: false })
})

test('changed states refresh every view that shows tasks, the board too', () => {
  const finished = cfg({ states: [{ keyword: 'TODO', color: 'grey', finished: true, inCycle: true }] })
  expect(configShift(cfg(), finished)).toEqual({ tasks: true, board: true })
  expect(configShift(cfg(), cfg({ states: [] }))).toEqual({ tasks: true, board: true })
})

test('changed boards or archive days refresh the board only', () => {
  expect(configShift(cfg(), cfg({ boards: [{ name: 'Tasks', columns: ['TODO', 'DONE'] }] }))).toEqual({ tasks: false, board: true })
  expect(configShift(cfg(), cfg({ archiveAfterDays: 3 }))).toEqual({ tasks: false, board: true })
  expect(configShift(cfg(), cfg({ git: { enabled: false, commitDelayMinutes: 5, pullIntervalMinutes: 10 } }))).toEqual({ tasks: false, board: false })
})

test('a config older than the one shown is not applied (a late config:changed)', () => {
  expect(isNewerConfig(5, 4)).toBe(false)
  expect(isNewerConfig(5, 5)).toBe(true)
  expect(isNewerConfig(5, 6)).toBe(true)
})
