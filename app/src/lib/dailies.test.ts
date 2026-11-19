import { describe, expect, it } from 'vitest'
import {
  DEFAULT_RESET,
  addShown,
  dailiesItem,
  dailyEntries,
  deleteQuestion,
  doneLabel,
  dropPlace,
  editOutcome,
  groups,
  isChecked,
  lastReset,
  moveTarget,
  nextReset,
  parseReset,
  resetCommit,
  resetProblem,
  stampOf,
  stepTarget,
  tickedTip,
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

describe('dailyEntries', () => {
  const g = { open: [daily(2), daily(4)], checked: [daily(1), daily(3)] }
  const keys = (doneOpen: boolean, allDone = false, gr = g) => dailyEntries(gr, allDone, doneOpen).map((e) => e.key)
  it('collapsed: the open dailies, then the Done header; the ticked ones are hidden', () => {
    expect(keys(false)).toEqual([2, 4, 'fold'])
  })
  it('expanded: the ticked ones follow the header', () => {
    expect(keys(true)).toEqual([2, 4, 'fold', 1, 3])
  })
  it('the header counts the ticked ones and says whether it is open', () => {
    const fold = dailyEntries(g, false, true).find((e) => e.key === 'fold')
    expect(fold).toMatchObject({ count: 2, open: true })
  })
  it('no header without ticked dailies', () => {
    expect(keys(true, false, { open: g.open, checked: [] })).toEqual([2, 4])
  })
  it('all done: the note comes before the header', () => {
    expect(keys(false, true, { open: [], checked: g.checked })).toEqual(['done', 'fold'])
  })
  it('the label', () => {
    expect(doneLabel(1)).toBe('Done (1)')
    expect(doneLabel(3)).toBe('Done (3)')
  })
})

describe('addShown', () => {
  it('hidden until the + opens it', () => {
    expect(addShown([daily(1)], false)).toBe(false)
    expect(addShown([daily(1)], true)).toBe(true)
  })
  it('shown at once with no dailies, but not before the list has loaded', () => {
    expect(addShown([], false)).toBe(true)
    expect(addShown(null, false)).toBe(false)
  })
})

describe('editOutcome', () => {
  const row = { ...daily(1), text: 'Water the plants' }
  it('a changed text is saved, trimmed', () => {
    expect(editOutcome(row, '  Water the roses ')).toEqual({ kind: 'edit', text: 'Water the roses' })
  })
  it('an unchanged text changes nothing', () => {
    expect(editOutcome(row, 'Water the plants ')).toEqual({ kind: 'none' })
  })
  it('an emptied text asks to delete the daily', () => {
    expect(editOutcome(row, '')).toEqual({ kind: 'delete' })
    expect(editOutcome(row, '   ')).toEqual({ kind: 'delete' })
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
  it('a place past the end of the group is the end', () => {
    expect(moveTarget(list, group, 5, 9)).toBeUndefined()
    expect(moveTarget(list, group, 1, 9)).toBe(null)
    expect(moveTarget(list, [1, 3], 1, 9)).toBe(4)
  })
  it('a negative place is the start', () => {
    expect(moveTarget(list, group, 5, -3)).toBe(1)
  })
  it('an id outside the group is not guarded (the view only moves a daily within its own group)', () => {
    expect(moveTarget(list, group, 2, 0)).toBe(1)
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

describe('resetCommit', () => {
  it('sends a new time, tidies the same one, and ignores what is no time', () => {
    expect(resetCommit('4:30', '04:00', false)).toEqual({ send: '04:30' })
    expect(resetCommit('4:00', '04:00', false)).toBe('tidy')
    expect(resetCommit('24:00', '04:00', false)).toBeNull()
  })
  it('writes the shown time when the file holds a reset that is no time', () => {
    // The file says "24:00": Breccia reads 00:00 and says so on every load until the file is written.
    expect(resetCommit('00:00', '00:00', true)).toEqual({ send: '00:00' })
    expect(resetCommit('0:00', '00:00', true)).toEqual({ send: '00:00' })
    expect(resetCommit('5:00', '00:00', true)).toEqual({ send: '05:00' })
    expect(resetCommit('nope', '00:00', true)).toBeNull()
  })
})

describe('tickedTip', () => {
  it('names the time for a tick made today, the date too for another day', () => {
    expect(tickedTip('2026-11-18 07:42', d(18, 9, 0))).toBe('Ticked at 07:42')
    expect(tickedTip('2026-11-17 23:05', d(18, 9, 0))).toBe('Ticked on 17 Nov 2026 at 23:05')
    expect(tickedTip('2026-11-19 06:00', d(18, 9, 0))).toBe('Ticked on 19 Nov 2026 at 06:00')
  })
  it('is empty for a daily never ticked', () => {
    expect(tickedTip(null, d(18, 9, 0))).toBe('')
  })
})

describe('deleteQuestion', () => {
  it('names the daily, and the lines under it when there are some', () => {
    expect(deleteQuestion({ id: 1, text: 'Check emails', checked: null, nested: false })).toBe(
      "Delete the daily 'Check emails'?",
    )
    expect(deleteQuestion({ id: 1, text: 'Check emails', checked: null, nested: true })).toBe(
      "Delete the daily 'Check emails' and the lines written under it?",
    )
  })
})

describe('dropPlace', () => {
  it('is the place among the other dailies of the group', () => {
    expect(dropPlace([1, 2, 3], 3, 1, false)).toBe(0)
    expect(dropPlace([1, 2, 3], 1, 3, true)).toBe(2)
    expect(dropPlace([1, 2, 3], 1, 3, false)).toBe(1)
    expect(dropPlace([1, 2, 3], 2, 1, true)).toBe(1)
  })
  it('is null over the dragged daily itself or outside the group', () => {
    expect(dropPlace([1, 2, 3], 2, 2, true)).toBeNull()
    expect(dropPlace([1, 2, 3], 2, 9, true)).toBeNull()
  })
})

describe('stepTarget', () => {
  const list = [daily(1), daily(2), daily(3, '2026-11-18 07:00'), daily(4)]
  const now = d(18, 9, 0)
  const open = groups(list, now, DEFAULT_RESET).open.map((x) => x.id)
  it('moves one place up or down within the group', () => {
    expect(open).toEqual([1, 2, 4])
    expect(stepTarget(list, open, 2, -1)).toBe(1)
    expect(stepTarget(list, open, 1, 1)).toBe(4)
    expect(stepTarget(list, open, 2, 1)).toBeNull()
  })
  it("is undefined at the group's edge", () => {
    expect(stepTarget(list, open, 1, -1)).toBeUndefined()
    expect(stepTarget(list, open, 4, 1)).toBeUndefined()
  })
})
