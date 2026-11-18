import { describe, expect, it } from 'vitest'
import {
  DEFAULT_RESET,
  dailiesItem,
  groups,
  isChecked,
  lastReset,
  moveTarget,
  nextReset,
  parseReset,
  resetProblem,
  stampOf,
} from './dailies'
import type { DailyView } from './types'

const d = (day: number, h: number, m: number, month = 10) => new Date(2026, month, day, h, m)
const daily = (id: number, checked: string | null = null): DailyView => ({ id, text: `d${id}`, checked, nested: false })

describe('lastReset', () => {
  it('midnight', () => {
    expect(DEFAULT_RESET).toBe('00:00')
    expect(lastReset(d(18, 7, 42), '00:00')).toBe('2026-11-18 00:00')
    expect(lastReset(d(18, 0, 0), '00:00')).toBe('2026-11-18 00:00')
    expect(lastReset(d(18, 23, 59), '00:00')).toBe('2026-11-18 00:00')
  })
  it('04:00 before and after the reset', () => {
    expect(lastReset(d(18, 3, 59), '04:00')).toBe('2026-11-17 04:00')
    expect(lastReset(d(18, 4, 0), '04:00')).toBe('2026-11-18 04:00')
  })
  it('crosses a month start', () => {
    expect(lastReset(new Date(2026, 11, 1, 1, 0), '04:00')).toBe('2026-11-30 04:00')
  })
  it('stampOf pads', () => {
    expect(stampOf(new Date(2026, 0, 5, 7, 3))).toBe('2026-01-05 07:03')
  })
})

describe('isChecked', () => {
  it('owner example at 04:00', () => {
    expect(isChecked('2026-11-18 01:30', d(18, 3, 59), '04:00')).toBe(true)
    expect(isChecked('2026-11-18 01:30', d(18, 4, 0), '04:00')).toBe(false)
    expect(isChecked('2026-11-17 23:00', d(18, 2, 0), '04:00')).toBe(true)
  })
  it('null is never checked', () => {
    expect(isChecked(null, d(18, 9, 0), '00:00')).toBe(false)
  })
  it('a sleeping PC', () => {
    expect(isChecked('2026-11-17 22:00', d(18, 9, 0), '00:00')).toBe(false)
  })
  it('clock set back or forward', () => {
    expect(isChecked('2026-11-18 08:00', d(17, 23, 0), '00:00')).toBe(true)
    expect(isChecked('2026-11-18 08:00', d(19, 9, 0), '00:00')).toBe(false)
  })
})

describe('nextReset', () => {
  it('is later today or tomorrow', () => {
    expect(nextReset(d(18, 7, 42), '04:00').getTime()).toBe(d(19, 4, 0).getTime())
    expect(nextReset(d(18, 3, 0), '04:00').getTime()).toBe(d(18, 4, 0).getTime())
    expect(nextReset(d(18, 4, 0), '04:00').getTime()).toBe(d(19, 4, 0).getTime())
  })
  it('crosses a month end', () => {
    expect(nextReset(d(30, 12, 0), '00:00').getTime()).toBe(new Date(2026, 11, 1, 0, 0).getTime())
  })
})

describe('groups', () => {
  it('keeps file order in each group', () => {
    const list = [daily(1, '2026-11-18 01:00'), daily(2), daily(3, '2026-11-18 02:00'), daily(4)]
    const g = groups(list, d(18, 9, 0), '00:00')
    expect(g.open.map((x) => x.id)).toEqual([2, 4])
    expect(g.checked.map((x) => x.id)).toEqual([1, 3])
  })
})

describe('moveTarget', () => {
  // file order 1..5; open group is 1, 3, 5
  const list = [1, 2, 3, 4, 5].map((i) => daily(i))
  const group = [1, 3, 5]
  it('to the first place', () => {
    expect(moveTarget(list, group, 5, 0)).toBe(1)
  })
  it('to a middle place', () => {
    expect(moveTarget(list, group, 5, 1)).toBe(3)
  })
  it('to the last place goes before the next daily after the group, or null', () => {
    expect(moveTarget(list, [1, 3], 1, 1)).toBe(4)
    expect(moveTarget(list, group, 1, 2)).toBe(null)
  })
  it('nothing changes', () => {
    expect(moveTarget(list, group, 3, 1)).toBeUndefined()
    expect(moveTarget(list, group, 5, 2)).toBeUndefined()
    expect(moveTarget(list, group, 1, 0)).toBeUndefined()
    expect(moveTarget(list, [1], 1, 0)).toBeUndefined()
  })
})

describe('dailiesItem', () => {
  const now = d(18, 9, 0)
  it('null for null and empty', () => {
    expect(dailiesItem(null, now, '00:00', false)).toBeNull()
    expect(dailiesItem([], now, '00:00', false)).toBeNull()
  })
  it('counts the open ones', () => {
    const list = [daily(1, '2026-11-18 01:00'), daily(2), daily(3)]
    expect(dailiesItem(list, now, '00:00', true)).toEqual({
      id: 'dailies',
      side: 'left',
      order: 20,
      text: 'Dailies 2 open',
      action: true,
      pressed: true,
      tip: 'Open Dailies',
      progress: null,
      tone: 'normal',
    })
  })
  it('all done', () => {
    const list = [daily(1, '2026-11-18 01:00')]
    expect(dailiesItem(list, now, '00:00', false)).toEqual({
      id: 'dailies',
      side: 'left',
      order: 20,
      text: 'Dailies ✓',
      action: true,
      pressed: false,
      tip: 'Open Dailies',
      label: 'Dailies: all done',
      progress: null,
      tone: 'normal',
    })
  })
})

describe('parseReset', () => {
  it('accepts H:MM and HH:MM', () => {
    expect(parseReset('4:00')).toBe('04:00')
    expect(parseReset(' 23:59 ')).toBe('23:59')
    expect(parseReset('0:00')).toBe('00:00')
    expect(resetProblem('4:00')).toBeNull()
  })
  it('refuses the rest', () => {
    for (const t of ['24:00', '7:60', '0400', '']) {
      expect(parseReset(t)).toBeNull()
      expect(resetProblem(t)).toBe('Enter a time from 00:00 to 23:59, such as 04:00.')
    }
  })
})
