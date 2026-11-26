import { describe, expect, it } from 'vitest'
import { SettingsScreen } from './settings.svelte'
import { MainArea } from './mainArea.svelte'

describe('SettingsScreen', () => {
  it('opens at a section and closes', () => {
    const s = new SettingsScreen({ area: new MainArea() })
    expect([s.shown, s.section]).toEqual([false, null])
    s.open('states')
    expect([s.shown, s.section]).toEqual([true, 'states'])
    s.open()
    expect([s.shown, s.section]).toEqual([true, null])
    s.close()
    expect(s.shown).toBe(false)
  })
  it('keeps usage', () => {
    const s = new SettingsScreen({ area: new MainArea() })
    s.applyUsage([{ keyword: 'A', blocks: 1, pages: 1 }])
    expect(s.usage).toHaveLength(1)
  })
})

describe('SettingsScreen usage', () => {
  it('keeps how many pages could not be counted', () => {
    const s = new SettingsScreen({ area: new MainArea() })
    expect(s.skipped).toBe(0)
    s.applyUsage([], 2)
    expect(s.skipped).toBe(2)
    s.applyUsage([])
    expect(s.skipped).toBe(0)
  })
})

describe('SettingsScreen changelog', () => {
  it('only shows while the screen is open', () => {
    const s = new SettingsScreen({ area: new MainArea() })
    s.showChangelog()
    expect(s.changelog).toBe(false)
    s.open()
    s.showChangelog()
    expect(s.changelog).toBe(true)
    s.hideChangelog()
    expect(s.changelog).toBe(false)
  })
  it('close hides it', () => {
    const s = new SettingsScreen({ area: new MainArea() })
    s.open()
    s.showChangelog()
    s.close()
    expect(s.changelog).toBe(false)
  })
})

describe('SettingsScreen in the main area', () => {
  it('is shown while the area shows it; another screen hides it and its changelog', () => {
    const area = new MainArea()
    const s = new SettingsScreen({ area })
    s.open('git')
    expect(area.is('settings')).toBe(true)
    s.showChangelog()
    area.show({ kind: 'archive' })
    expect([s.shown, s.changelog]).toEqual([false, false])
  })
})
