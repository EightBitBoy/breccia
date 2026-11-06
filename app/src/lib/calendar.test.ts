import { describe, expect, test } from 'vitest'
import { addDays, addMonths, dayKey, dayLabel, journalKeys, monthGrid, monthTitle, pickerKey, startDay } from './calendar'
import type { TreeView } from './types'

const k = (key: string, over: Partial<{ shift: boolean; alt: boolean; ctrl: boolean; meta: boolean }> = {}) => ({
  key,
  shift: false,
  alt: false,
  ctrl: false,
  meta: false,
  ...over,
})

describe('day keys', () => {
  test('dayKey is the local date as YYYY-MM-DD', () => {
    expect(dayKey(new Date(2026, 2, 5, 23, 59))).toBe('2026-03-05')
    expect(dayKey(new Date(2026, 11, 31, 0, 0))).toBe('2026-12-31')
  })
  test('addDays crosses months and years', () => {
    expect(addDays('2026-03-31', 1)).toBe('2026-04-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2027-01-03', -7)).toBe('2026-12-27')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  })
  test('addMonths keeps the day, clamped to the month, across years', () => {
    expect(addMonths('2026-03-12', 1)).toBe('2026-04-12')
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29')
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15')
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15')
    expect(addMonths('2026-03-31', -13)).toBe('2025-02-28')
  })
})

describe('monthGrid (weeks start on Monday)', () => {
  test('whole weeks from Monday to Sunday, the other months dimmed', () => {
    // 1 March 2026 is a Sunday: the grid starts on Monday 23 February.
    const weeks = monthGrid('2026-03-12', new Set(), '2026-03-04')
    expect(weeks).toHaveLength(6)
    expect(weeks.every((w) => w.length === 7)).toBe(true)
    expect(weeks[0][0]).toMatchObject({ key: '2026-02-23', day: 23, inMonth: false })
    expect(weeks[0][6]).toMatchObject({ key: '2026-03-01', day: 1, inMonth: true })
    expect(weeks[5][1]).toMatchObject({ key: '2026-03-31', inMonth: true })
    expect(weeks[5][6]).toMatchObject({ key: '2026-04-05', inMonth: false })
  })
  test('a month starting on Monday has no days of the month before', () => {
    // 1 June 2026 is a Monday; June ends on Tuesday the 30th.
    const weeks = monthGrid('2026-06-10', new Set(), '2026-01-01')
    expect(weeks[0][0].key).toBe('2026-06-01')
    expect(weeks).toHaveLength(5)
    expect(weeks[4].map((c) => c.key)).toEqual([
      '2026-06-29',
      '2026-06-30',
      '2026-07-01',
      '2026-07-02',
      '2026-07-03',
      '2026-07-04',
      '2026-07-05',
    ])
  })
  test('marks: days with a journal file and today', () => {
    const cells = monthGrid('2026-03-12', new Set(['2026-03-12', '2026-02-24']), '2026-03-04').flat()
    const at = (key: string) => cells.find((c) => c.key === key)!
    expect(at('2026-03-12')).toMatchObject({ marked: true, today: false })
    expect(at('2026-02-24')).toMatchObject({ marked: true, inMonth: false })
    expect(at('2026-03-04')).toMatchObject({ marked: false, today: true })
    expect(cells.filter((c) => c.marked)).toHaveLength(2)
    expect(cells.filter((c) => c.today)).toHaveLength(1)
  })
})

test('monthTitle', () => {
  expect(monthTitle('2026-03-12')).toBe('March 2026')
  expect(monthTitle('2027-12-01')).toBe('December 2027')
})

test('journalKeys lists every journal day of the tree', () => {
  const tree: TreeView = {
    pages: [],
    tags: [],
    journals: [
      { year: 2026, months: [{ month: 3, days: [{ key: '2026-03-12', title: 'x' }, { key: '2026-03-01', title: 'y' }] }] },
      { year: 2025, months: [{ month: 12, days: [{ key: '2025-12-31', title: 'z' }] }] },
    ],
  } as unknown as TreeView
  expect([...journalKeys(tree)].sort()).toEqual(['2025-12-31', '2026-03-01', '2026-03-12'])
  expect(journalKeys(null).size).toBe(0)
})

test('startDay: the journal shown, else today', () => {
  expect(startDay('2026-03-12', '2026-11-04')).toBe('2026-03-12')
  expect(startDay('Project X', '2026-11-04')).toBe('2026-11-04')
  expect(startDay('2026-02-30', '2026-11-04')).toBe('2026-11-04')
  expect(startDay(null, '2026-11-04')).toBe('2026-11-04')
})

describe('pickerKey', () => {
  test('arrows move by day and week', () => {
    expect(pickerKey(k('ArrowLeft'), '2026-03-01')).toEqual({ move: '2026-02-28' })
    expect(pickerKey(k('ArrowRight'), '2026-12-31')).toEqual({ move: '2027-01-01' })
    expect(pickerKey(k('ArrowUp'), '2026-03-05')).toEqual({ move: '2026-02-26' })
    expect(pickerKey(k('ArrowDown'), '2026-03-26')).toEqual({ move: '2026-04-02' })
  })
  test('Page Up / Page Down move by month', () => {
    expect(pickerKey(k('PageUp'), '2026-03-31')).toEqual({ move: '2026-02-28' })
    expect(pickerKey(k('PageDown'), '2026-12-10')).toEqual({ move: '2027-01-10' })
  })
  test('Home / End go to the start and end of the week (Monday, Sunday)', () => {
    // 12 March 2026 is a Thursday.
    expect(pickerKey(k('Home'), '2026-03-12')).toEqual({ move: '2026-03-09' })
    expect(pickerKey(k('End'), '2026-03-12')).toEqual({ move: '2026-03-15' })
    expect(pickerKey(k('Home'), '2026-03-09')).toEqual({ move: '2026-03-09' })
    expect(pickerKey(k('End'), '2026-03-15')).toEqual({ move: '2026-03-15' })
  })
  test('Enter and Space pick', () => {
    expect(pickerKey(k('Enter'), '2026-03-12')).toBe('pick')
    expect(pickerKey(k(' '), '2026-03-12')).toBe('pick')
  })
  test('other keys and modified keys are left alone', () => {
    expect(pickerKey(k('a'), '2026-03-12')).toBeNull()
    expect(pickerKey(k('Escape'), '2026-03-12')).toBeNull()
    expect(pickerKey(k('Tab'), '2026-03-12')).toBeNull()
    expect(pickerKey(k('ArrowLeft', { ctrl: true }), '2026-03-12')).toBeNull()
    expect(pickerKey(k('ArrowLeft', { alt: true }), '2026-03-12')).toBeNull()
    expect(pickerKey(k('Enter', { shift: true }), '2026-03-12')).toBeNull()
  })
})

test('dayLabel names the day for a screen reader, with its marks', () => {
  expect(dayLabel({ key: '2026-03-12', day: 12, inMonth: true, marked: false, today: false })).toBe('Thursday, 12 March 2026')
  expect(dayLabel({ key: '2026-11-04', day: 4, inMonth: true, marked: true, today: true })).toBe('Wednesday, 4 November 2026, today, has a note')
})
