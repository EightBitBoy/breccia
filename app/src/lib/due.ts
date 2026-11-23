// The words and tone of a task's due chip. The core renders an empty placeholder span; the window fills it with `today`.

export type DueTone = 'later' | 'soon' | 'overdue' | 'finished'

/** The refusal text for a due date on a block that is not a task (the core's `NotATask` message). */
export const NOT_A_TASK = 'Only a task can have a due date.'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function parts(key: string): [number, number, number] {
  const [y, m, d] = key.split('-').map(Number)
  return [y, m, d]
}

/** `22 Nov`, or `22 Nov 2026` when `withYear`. */
function shortDate(key: string, withYear: boolean): string {
  const [y, m, d] = parts(key)
  return `${d} ${MONTHS[m - 1]}${withYear ? ` ${y}` : ''}`
}

function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = parts(from)
  const [ty, tm, td] = parts(to)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000)
}

/**
 * The chip for a task due on `due`, seen on `today` (both `YYYY-MM-DD`). `title` is the full date when the label
 * is in words (the tooltip), else null.
 */
export function dueChip(
  due: string,
  today: string,
  finished: boolean,
): { label: string; tone: DueTone; title: string | null } {
  const withYear = parts(due)[0] !== parts(today)[0]
  const date = shortDate(due, withYear)
  if (finished) return { label: `due ${date}`, tone: 'finished', title: null }
  const days = daysBetween(today, due)
  if (days < 0) return { label: `overdue ${date}`, tone: 'overdue', title: null }
  const full = shortDate(due, true)
  if (days === 0) return { label: 'due today', tone: 'soon', title: full }
  if (days === 1) return { label: 'due tomorrow', tone: 'soon', title: full }
  if (days <= 5) return { label: `due in ${days} days`, tone: days <= 2 ? 'soon' : 'later', title: full }
  return { label: `due ${date}`, tone: 'later', title: null }
}

const PLACEHOLDER = /<span class="chip due" data-due="(\d{4}-\d{2}-\d{2})"( data-finished="")?><\/span>/g

/** Fills each due chip placeholder in rendered task HTML with its words, `data-tone` and tooltip. */
export function fillDueChips(html: string, today: string): string {
  return html.replace(PLACEHOLDER, (_m, due: string, fin: string | undefined) => {
    const c = dueChip(due, today, fin !== undefined)
    const title = c.title === null ? '' : ` title="${c.title}"`
    return `<span class="chip due" data-due="${due}"${fin ?? ''} data-tone="${c.tone}"${title}>${c.label}</span>`
  })
}
