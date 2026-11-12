import { describe, expect, it } from 'vitest'
import { THEME_CHOICES, stepTheme } from './theme'
import { wheelTheme } from './themeWheel'
import { WheelSteps } from './zoom'

describe('stepTheme', () => {
  it('moves one entry down or up the menu, wrapping at both ends', () => {
    expect(stepTheme('system', 1)).toBe('light')
    expect(stepTheme('light', 1)).toBe('taupe')
    expect(stepTheme('parchment', 1)).toBe('dark')
    expect(stepTheme('system', -1)).toBe('claret')
    expect(stepTheme('claret', 1)).toBe('system')
    expect(stepTheme('teal', 1)).toBe('vampire')
  })
  it('visits every choice in order and comes back; up undoes down', () => {
    let c = THEME_CHOICES[0]
    const seen = []
    for (let i = 0; i < THEME_CHOICES.length; i++) {
      c = stepTheme(c, 1)
      seen.push(c)
    }
    expect(seen).toEqual([...THEME_CHOICES.slice(1), 'system'])
    for (const x of THEME_CHOICES) expect(stepTheme(stepTheme(x, 1), -1)).toBe(x)
  })
})

describe('wheelTheme', () => {
  it('wheel down picks the next theme, wheel up the previous', () => {
    expect(wheelTheme('system', new WheelSteps(), 100, 100)).toBe('light')
    expect(wheelTheme('system', new WheelSteps(), -100, 100)).toBe('claret')
  })
  it('at zoom 125 a notch of 80 CSS px is one step', () => {
    expect(wheelTheme('dark', new WheelSteps(), 80, 125)).toBe('graphite')
  })
  it('a trackpad trickle collects into one step', () => {
    const s = new WheelSteps()
    expect([25, 25, 25].map((d) => wheelTheme('dark', s, d, 100))).toEqual([null, null, null])
    expect(wheelTheme('dark', s, 25, 100)).toBe('graphite')
  })
  it('turning back starts over', () => {
    const s = new WheelSteps()
    expect(wheelTheme('dark', s, 60, 100)).toBeNull()
    expect(wheelTheme('dark', s, -60, 100)).toBeNull()
  })
  it('a zero delta gives null and does not reset the count', () => {
    const s = new WheelSteps()
    expect(wheelTheme('dark', s, 60, 100)).toBeNull()
    expect(wheelTheme('dark', s, 0, 100)).toBeNull()
    expect(wheelTheme('dark', s, 40, 100)).toBe('graphite')
  })
})
