// The date picker's calendar: day keys `YYYY-MM-DD`, the month grid (weeks start on Monday), the marks
// and the keys inside the picker. Dates are computed in UTC, so a change of daylight saving time never
// shifts a day.
import type { KeyInput } from './keys'
import type { TreeView } from './types'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** The weekday headings, Monday first. */
export const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

export type Cell = {
  key: string
  day: number
  /** False for the days of the months before and after, shown dimmed. */
  inMonth: boolean
  /** A journal file exists for the day. */
  marked: boolean
  today: boolean
}

const pad = (n: number) => String(n).padStart(2, '0')

/** The local date of `d` as a day key. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function utc(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function keyOfUtc(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/** Whether `s` is a real day written `YYYY-MM-DD` (a journal name). */
export function isDayKey(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && keyOfUtc(utc(s)) === s
}

export function addDays(key: string, n: number): string {
  const d = utc(key)
  d.setUTCDate(d.getUTCDate() + n)
  return keyOfUtc(d)
}

/** The same day `n` months on, clamped to the length of that month (31 Jan + 1 is 28 or 29 Feb). */
export function addMonths(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number)
  const first = new Date(Date.UTC(y, m - 1 + n, 1))
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  first.setUTCDate(Math.min(d, last))
  return keyOfUtc(first)
}

/** 0 for Monday … 6 for Sunday. */
function weekday(key: string): number {
  return (utc(key).getUTCDay() + 6) % 7
}

/** The month of `key` as whole weeks, Monday to Sunday, with the marks. */
export function monthGrid(key: string, marked: ReadonlySet<string>, today: string): Cell[][] {
  const month = key.slice(0, 7)
  const first = `${month}-01`
  let day = addDays(first, -weekday(first))
  const weeks: Cell[][] = []
  do {
    const week: Cell[] = []
    for (let i = 0; i < 7; i++) {
      week.push({ key: day, day: Number(day.slice(8)), inMonth: day.startsWith(month), marked: marked.has(day), today: day === today })
      day = addDays(day, 1)
    }
    weeks.push(week)
  } while (day.startsWith(month))
  return weeks
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/** `Thursday, 12 March 2026, today, has a note`: a day button's name for a screen reader. */
export function dayLabel(c: Cell): string {
  const name = `${DAYS[weekday(c.key)]}, ${c.day} ${MONTHS[Number(c.key.slice(5, 7)) - 1]} ${c.key.slice(0, 4)}`
  return name + (c.today ? ', today' : '') + (c.marked ? ', has a note' : '')
}

/** `March 2026`. */
export function monthTitle(key: string): string {
  return `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`
}

/** Every journal day that has a file (the sidebar tree lists them). */
export function journalKeys(tree: TreeView | null): Set<string> {
  const out = new Set<string>()
  for (const y of tree?.journals ?? []) for (const m of y.months) for (const d of m.days) out.add(d.key)
  return out
}

/** The picker starts at the journal shown (`shown` is the key of the page shown), else at today. */
export function startDay(shown: string | null, today: string): string {
  return shown !== null && isDayKey(shown) ? shown : today
}

/** What a key press on the focused day `key` does; Esc is left to the popover. */
export function pickerKey(e: KeyInput, key: string): { move: string } | 'pick' | null {
  if (e.ctrl || e.meta || e.alt || e.shift) return null
  switch (e.key) {
    case 'ArrowLeft':
      return { move: addDays(key, -1) }
    case 'ArrowRight':
      return { move: addDays(key, 1) }
    case 'ArrowUp':
      return { move: addDays(key, -7) }
    case 'ArrowDown':
      return { move: addDays(key, 7) }
    case 'PageUp':
      return { move: addMonths(key, -1) }
    case 'PageDown':
      return { move: addMonths(key, 1) }
    case 'Home':
      return { move: addDays(key, -weekday(key)) }
    case 'End':
      return { move: addDays(key, 6 - weekday(key)) }
    case 'Enter':
    case ' ':
      return 'pick'
    default:
      return null
  }
}
