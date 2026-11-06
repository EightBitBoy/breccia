// The Git history view: its status bar button, when it reloads, and its dates.
import type { StatusItem } from './status'
import type { GitView } from './types'

/** Commits per load; "Show more" loads this many more. */
export const PAGE_SIZE = 200

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const pad = (n: number) => String(n).padStart(2, '0')

/** '3 Nov 2026 14:05', local time. */
export function formatWhen(ms: number): string {
  const d = new Date(ms)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Its tooltip: 'Tuesday, 3 November 2026, 14:05:09', local time. */
export function formatWhenFull(ms: number): string {
  const d = new Date(ms)
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${LONG_MONTHS[d.getMonth()]} ${d.getFullYear()}, ${time}`
}

/** The history button right of the Git item; only while the folder is in a repository. */
export function historyItem(v: GitView | null, shown: boolean): StatusItem | null {
  if (!v || v.top === null || v.state === 'off' || v.state === 'noGit' || v.state === 'notRepo') return null
  return {
    id: 'gitLog',
    side: 'right',
    order: 11,
    text: '',
    progress: null,
    tone: 'normal',
    action: true,
    tip: 'Git history',
    icon: 'history',
    pressed: shown,
  }
}

/** Whether the open view loads again: a new commit (the head moved), a push (fewer not pushed) or another remote. */
export function historyStale(prev: GitView | null, next: GitView): boolean {
  return prev === null || prev.head !== next.head || prev.ahead !== next.ahead || prev.remote !== next.remote
}
