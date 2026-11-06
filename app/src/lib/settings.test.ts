import { describe, expect, it } from 'vitest'
import { SettingsScreen } from './settings.svelte'

describe('SettingsScreen', () => {
  it('opens at a section and closes', () => {
    const s = new SettingsScreen()
    expect([s.shown, s.section]).toEqual([false, null])
    s.open('states')
    expect([s.shown, s.section]).toEqual([true, 'states'])
    s.open()
    expect([s.shown, s.section]).toEqual([true, null])
    s.close()
    expect(s.shown).toBe(false)
  })
  it('keeps usage', () => {
    const s = new SettingsScreen()
    s.applyUsage([{ keyword: 'A', blocks: 1, pages: 1 }])
    expect(s.usage).toHaveLength(1)
  })
})

describe('SettingsScreen usage', () => {
  it('keeps how many pages could not be counted', () => {
    const s = new SettingsScreen()
    expect(s.skipped).toBe(0)
    s.applyUsage([], 2)
    expect(s.skipped).toBe(2)
    s.applyUsage([])
    expect(s.skipped).toBe(0)
  })
})
