import { describe, expect, it } from 'vitest'
import { SettingsScreen } from './settings.svelte'
import { MainArea } from './mainArea.svelte'
import { Overlays } from './overlay.svelte'

describe('SettingsScreen', () => {
  it('opens at a section and closes', () => {
    const s = new SettingsScreen({ area: new MainArea(), overlays: new Overlays(() => false) })
    expect([s.shown, s.section]).toEqual([false, null])
    s.open('states')
    expect([s.shown, s.section]).toEqual([true, 'states'])
    s.open()
    expect([s.shown, s.section]).toEqual([true, null])
    s.close()
    expect(s.shown).toBe(false)
  })
  it('keeps usage', () => {
    const s = new SettingsScreen({ area: new MainArea(), overlays: new Overlays(() => false) })
    s.applyUsage([{ keyword: 'A', blocks: 1, pages: 1 }])
    expect(s.usage).toHaveLength(1)
  })
})

describe('SettingsScreen usage', () => {
  it('keeps how many pages could not be counted', () => {
    const s = new SettingsScreen({ area: new MainArea(), overlays: new Overlays(() => false) })
    expect(s.skipped).toBe(0)
    s.applyUsage([], 2)
    expect(s.skipped).toBe(2)
    s.applyUsage([])
    expect(s.skipped).toBe(0)
  })
})

describe('SettingsScreen changelog', () => {
  it('only shows while the screen is open, as the changelog overlay', () => {
    const overlays = new Overlays(() => false)
    const s = new SettingsScreen({ area: new MainArea(), overlays })
    s.showChangelog()
    expect(overlays.current).toBeNull()
    s.open()
    s.showChangelog()
    expect(overlays.current).toEqual({ kind: 'changelog' })
    overlays.close('changelog')
    expect(overlays.current).toBeNull()
  })
  it('close hides it', () => {
    const overlays = new Overlays(() => false)
    const s = new SettingsScreen({ area: new MainArea(), overlays })
    s.open()
    s.showChangelog()
    s.close()
    expect(overlays.current).toBeNull()
  })
  it('leaving Settings closes the changelog, and only the changelog', () => {
    const area = new MainArea()
    const overlays = new Overlays(() => false)
    const s = new SettingsScreen({ area, overlays })
    s.open('git')
    s.showChangelog()
    area.show({ kind: 'archive' })
    expect([s.shown, overlays.current]).toEqual([false, null])
    s.open()
    overlays.open({ kind: 'help' })
    s.close()
    expect(overlays.current).toEqual({ kind: 'help' })
  })
})

describe('SettingsScreen in the main area', () => {
  it('is shown while the area shows it', () => {
    const area = new MainArea()
    const s = new SettingsScreen({ area, overlays: new Overlays(() => false) })
    s.open('git')
    expect(area.is('settings')).toBe(true)
    area.show({ kind: 'archive' })
    expect(s.shown).toBe(false)
  })
})
