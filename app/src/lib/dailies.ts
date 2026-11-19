// The period rules of the Dailies: when a daily counts as checked and when the next reset is.
// A "stamp" is local wall-clock time as `YYYY-MM-DD HH:MM`, which sorts as text. Everything
// compares wall-clock stamps, so summer time needs no special case: a reset inside the spring
// gap fires when the clock first shows a later time, and in the repeated autumn hour a reset
// happens twice by the wall clock (accepted).
import { formatDate } from './archive'
import type { StatusItem } from './status'
import type { BlockId, DailyView } from './types'

export const DEFAULT_RESET = '00:00'
/** The reset's name in `ConfigView.replaced`. */
export const RESET_KEY = '[dailies] reset'

const pad = (n: number) => String(n).padStart(2, '0')

/** The local wall-clock stamp of `d`. */
export function stampOf(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function resetParts(reset: string): [number, number] {
  const [h, m] = reset.split(':').map(Number)
  return [h, m]
}

/** The stamp of the latest reset at or before `now`. */
export function lastReset(now: Date, reset: string): string {
  const [h, m] = resetParts(reset)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m)
  const wall = now.getHours() * 60 + now.getMinutes()
  if (wall >= h * 60 + m) return `${stampOf(today).slice(0, 10)} ${pad(h)}:${pad(m)}`
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  return `${stampOf(yesterday).slice(0, 10)} ${pad(h)}:${pad(m)}`
}

/** A check from the future counts (the clock may have been set back). */
export function isChecked(checked: string | null, now: Date, reset: string): boolean {
  return checked !== null && checked >= lastReset(now, reset)
}

/** The first instant after `now` whose wall time is `reset`. */
export function nextReset(now: Date, reset: string): Date {
  const [h, m] = resetParts(reset)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m)
  if (today.getTime() > now.getTime()) return today
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, h, m)
}

export function groups(
  list: DailyView[],
  now: Date,
  reset: string,
): { open: DailyView[]; checked: DailyView[] } {
  const open: DailyView[] = []
  const checked: DailyView[] = []
  for (const x of list) (isChecked(x.checked, now, reset) ? checked : open).push(x)
  return { open, checked }
}

/** One row of the Dailies list: a daily, the "All done for today" note, or the header of the ticked ones. */
export type DailyEntry =
  | { key: BlockId; d: DailyView; group: 'open' | 'checked' }
  | { key: 'done' }
  | { key: 'fold'; count: number; open: boolean }

/**
 * The rows in order: the open dailies, the note when all are ticked, then the "Done" header and, only when it is
 * open, the ticked dailies. With nothing ticked there is no header.
 */
export function dailyEntries(
  g: { open: DailyView[]; checked: DailyView[] },
  allDone: boolean,
  doneOpen: boolean,
): DailyEntry[] {
  const e: DailyEntry[] = g.open.map((d) => ({ key: d.id, d, group: 'open' as const }))
  if (allDone) e.push({ key: 'done' })
  if (g.checked.length === 0) return e
  e.push({ key: 'fold', count: g.checked.length, open: doneOpen })
  if (doneOpen) e.push(...g.checked.map((d) => ({ key: d.id, d, group: 'checked' as const })))
  return e
}

/** Whether the field "Add a daily" shows: once the + beside the title opened it, or at once while there are no dailies. */
export function addShown(list: readonly DailyView[] | null, open: boolean): boolean {
  return open || (list !== null && list.length === 0)
}

/** What leaving a daily's edit field does: save a changed text, nothing for the same text, ask to delete for none. */
export function editOutcome(
  row: DailyView,
  draft: string,
): { kind: 'none' } | { kind: 'edit'; text: string } | { kind: 'delete' } {
  const text = draft.trim()
  if (text === '') return { kind: 'delete' }
  return text === row.text ? { kind: 'none' } : { kind: 'edit', text }
}

/** The header of the ticked dailies. */
export function doneLabel(n: number): string {
  return `Done (${n})`
}

/**
 * The `before` of `dailies.move` for dropping `id` at place `index` of its group (the place it
 * ends up in, counted among the group); `undefined` when the group's order would not change.
 */
export function moveTarget(
  list: DailyView[],
  group: BlockId[],
  id: BlockId,
  index: number,
): BlockId | null | undefined {
  const others = group.filter((g) => g !== id)
  if (others.length === 0) return undefined
  const place = Math.min(Math.max(index, 0), others.length)
  const wanted = [...others.slice(0, place), id, ...others.slice(place)]
  if (wanted.every((x, i) => x === group[i])) return undefined
  if (place < others.length) return others[place]
  const rest = list.map((x) => x.id).filter((x) => x !== id)
  return rest[rest.indexOf(others[others.length - 1]) + 1] ?? null
}

/**
 * Where a drop over daily `over` lands for `moveTarget`: its place among the group's other dailies (`after`: the
 * pointer is on the lower half of `over`). Null over the dragged daily itself or a daily outside the group.
 */
export function dropPlace(group: BlockId[], id: BlockId, over: BlockId, after: boolean): number | null {
  if (over === id || !group.includes(over)) return null
  return group.filter((g) => g !== id).indexOf(over) + (after ? 1 : 0)
}

/** `Alt ↑` (`dir` -1) and `Alt ↓` (1): the `before` of moving `id` one place within its group, as `moveTarget`. */
export function stepTarget(
  list: DailyView[],
  group: BlockId[],
  id: BlockId,
  dir: -1 | 1,
): BlockId | null | undefined {
  const i = group.indexOf(id)
  return i < 0 ? undefined : moveTarget(list, group, id, i + dir)
}

/** A checked row's tooltip: the time of a tick made today, the date too for another day; '' for none. */
export function tickedTip(checked: string | null, now: Date): string {
  if (checked === null) return ''
  const day = checked.slice(0, 10)
  const time = checked.slice(11, 16)
  return day === stampOf(now).slice(0, 10) ? `Ticked at ${time}` : `Ticked on ${formatDate(day)} at ${time}`
}

/** The question before a delete; it names the lines written under the daily, which go too. */
export function deleteQuestion(d: DailyView): string {
  return d.nested ? `Delete the daily '${d.text}' and the lines written under it?` : `Delete the daily '${d.text}'?`
}

export function dailiesItem(
  list: DailyView[] | null,
  now: Date,
  reset: string,
  shown: boolean,
): StatusItem | null {
  if (list === null || list.length === 0) return null
  const open = list.filter((x) => !isChecked(x.checked, now, reset)).length
  const base: StatusItem = {
    id: 'dailies',
    side: 'left',
    order: 20,
    text: open === 0 ? 'Dailies ✓' : `Dailies ${open} open`,
    action: true,
    pressed: shown,
    tip: 'Open Dailies',
    progress: null,
    tone: 'normal',
  }
  return open === 0 ? { ...base, label: 'Dailies: all done' } : base
}

/** `H:MM` or `HH:MM`, 0:00 to 23:59, as `HH:MM`; null when it is not a time. */
export function parseReset(text: string): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return `${pad(h)}:${pad(min)}`
}

/**
 * What leaving the reset box does with `typed`: `send` a time, `tidy` the box (the stored time, `4:00` shown as
 * `04:00`), or nothing for text that is no time. `invalid`: the file's reset is no time and is read as 00:00, so the
 * time is written even when it equals the one in use; otherwise the bad value and its notice would stay.
 */
export function resetCommit(typed: string, stored: string, invalid: boolean): { send: string } | 'tidy' | null {
  const value = parseReset(typed)
  if (value === null) return null
  return value === stored && !invalid ? 'tidy' : { send: value }
}

export function resetProblem(text: string): string | null {
  return parseReset(text) === null ? 'Enter a time from 00:00 to 23:59, such as 04:00.' : null
}
