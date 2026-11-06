import type { PageRowView } from './types'

export type ColumnKey = 'name' | 'folder' | 'created' | 'edited' | 'linkedFrom' | 'linksOut'
export interface Sort {
  key: ColumnKey
  dir: 'asc' | 'desc'
}

export const DEFAULT_SORT: Sort = { key: 'name', dir: 'asc' }

/** In table order: label, whether right-aligned, header tooltip. */
export const COLUMNS: { key: ColumnKey; label: string; numeric: boolean; title?: string }[] = [
  { key: 'name', label: 'Page', numeric: false },
  { key: 'folder', label: 'Folder', numeric: false },
  { key: 'created', label: 'Created', numeric: false },
  { key: 'edited', label: 'Last edited', numeric: false },
  { key: 'linkedFrom', label: 'Linked from', numeric: true, title: 'How many blocks elsewhere link to this page' },
  { key: 'linksOut', label: 'Links out', numeric: true, title: 'How many links this page makes to other pages' },
]

/** The same column reverses; another starts asc for name/folder, desc for the rest. */
export function nextSort(s: Sort, key: ColumnKey): Sort {
  if (s.key === key) return { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
  return { key, dir: key === 'name' || key === 'folder' ? 'asc' : 'desc' }
}

/** §7.7: 'Journals' for a journal, '—' at top level, else the folder path. */
export function folderLabel(r: PageRowView): string {
  if (r.kind === 'journal') return 'Journals'
  return r.folder === '' ? '—' : r.folder
}

/** Every whitespace-separated word of `filter` occurs in the title (or, for a journal, the title or key), ignoring case. */
export function matches(r: PageRowView, filter: string): boolean {
  const words = filter.toLowerCase().split(/\s+/).filter((w) => w !== '')
  const hay = [r.title, ...(r.kind === 'journal' ? [r.key] : [])].map((s) => s.toLowerCase())
  return words.every((w) => hay.some((h) => h.includes(w)))
}

const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true })

const nameOf = (r: PageRowView) => (r.kind === 'journal' ? r.key : r.name)

function compareValue(a: PageRowView, b: PageRowView, key: ColumnKey): number {
  switch (key) {
    case 'name':
      return collator.compare(nameOf(a), nameOf(b))
    case 'folder':
      return collator.compare(a.kind === 'journal' ? 'Journals' : a.folder, b.kind === 'journal' ? 'Journals' : b.folder)
    default:
      return (a[key] as number) - (b[key] as number)
  }
}

/** The rows to show: journals only if `journals`; filtered; sorted. */
export function shownRows(rows: PageRowView[], o: { filter: string; journals: boolean; sort: Sort }): PageRowView[] {
  const { key, dir } = o.sort
  const sign = dir === 'asc' ? 1 : -1
  return rows
    .filter((r) => (o.journals || r.kind !== 'journal') && matches(r, o.filter))
    .sort((a, b) => {
      if (key === 'created' || key === 'edited') {
        const x = a[key]
        const y = b[key]
        if (x === null && y !== null) return 1
        if (x !== null && y === null) return -1
      }
      const c = compareValue(a, b, key)
      return c !== 0 ? c * sign : collator.compare(nameOf(a), nameOf(b))
    })
}

/** '1 page', '6 pages', '2 of 6 pages' (the last when `filtered`). */
export function countLabel(shown: number, total: number, filtered: boolean): string {
  if (filtered) return `${shown} of ${total} ${total === 1 ? 'page' : 'pages'}`
  return `${total} ${total === 1 ? 'page' : 'pages'}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pad = (n: number) => String(n).padStart(2, '0')

/** '2 Mar 2026'; '—' for null. Local time. */
export function formatDay(ms: number | null): string {
  if (ms === null) return '—'
  const d = new Date(ms)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

/** '29 Oct 2026, 09:04'; '—' for null. Local time. */
export function formatDayTime(ms: number | null): string {
  if (ms === null) return '—'
  const d = new Date(ms)
  return `${formatDay(ms)}, ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
