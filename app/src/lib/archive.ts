// The Archive view: every archived task in one table, newest done date first.
import type { ArchivedView } from './types'

/** Every whitespace-separated word of `filter` occurs in the task, its state, its page or the page's key, ignoring case. */
export function matches(r: ArchivedView, filter: string): boolean {
  const words = filter.toLowerCase().split(/\s+/).filter((w) => w !== '')
  const hay = [r.text, r.state, r.source, r.page].map((s) => s.toLowerCase())
  return words.every((w) => hay.some((h) => h.includes(w)))
}

/** The rows to show: in the core's order (newest done date first), filtered. */
export function shownRows(rows: ArchivedView[], filter: string): ArchivedView[] {
  return rows.filter((r) => matches(r, filter))
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** `YYYY-MM-DD` as `2 Mar 2026`, and `YYYY-MM-DD HH:MM` as `2 Mar 2026 09:00`; '—' for none. */
export function formatDate(day: string | null): string {
  const m = day === null ? null : /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}:\d{2}))?$/.exec(day)
  if (!m) return '—'
  const date = `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`
  return m[4] ? `${date} ${m[4]}` : date
}

/** '1 task', '6 tasks', '2 of 6 tasks' (the last when `filtered`). */
export function countLabel(shown: number, total: number, filtered: boolean): string {
  const noun = total === 1 ? 'task' : 'tasks'
  return filtered ? `${shown} of ${total} ${noun}` : `${total} ${noun}`
}
