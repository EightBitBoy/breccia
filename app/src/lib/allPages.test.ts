import { expect, test } from 'vitest'
import { COLUMNS, countLabel, folderLabel, formatDay, formatDayTime, matches, nextSort, shownRows, DEFAULT_SORT, type Sort } from './allPages'
import type { PageRowView } from './types'

const row = (o: Partial<PageRowView>): PageRowView => ({
  key: (o.name ?? 'a').toLowerCase(), name: 'a', title: o.name ?? 'a', kind: 'page', folder: '',
  created: null, edited: null, linkedFrom: 0, linksOut: 0, linkedOnly: false, ...o,
})
const day = (key: string, title: string): PageRowView => row({ key, name: key, title, kind: 'journal' })
const names = (rows: PageRowView[]) => rows.map((r) => r.title)
const show = (rows: PageRowView[], sort: Sort = DEFAULT_SORT, filter = '', journals = false) =>
  names(shownRows(rows, { filter, journals, sort }))

test('nextSort reverses the same column and starts each column its own way', () => {
  expect(nextSort(DEFAULT_SORT, 'name')).toEqual({ key: 'name', dir: 'desc' })
  expect(nextSort(DEFAULT_SORT, 'folder')).toEqual({ key: 'folder', dir: 'asc' })
  for (const k of ['created', 'edited', 'linkedFrom', 'linksOut'] as const) expect(nextSort(DEFAULT_SORT, k)).toEqual({ key: k, dir: 'desc' })
  expect(nextSort({ key: 'edited', dir: 'desc' }, 'edited')).toEqual({ key: 'edited', dir: 'asc' })
})

test('names sort ignoring case, numbers in number order; journals are hidden by default', () => {
  const rows = [row({ name: 'b' }), row({ name: 'A' }), row({ name: 'Page 10' }), row({ name: 'Page 2' }), day('2026-10-02', 'Friday, 2 Oct 2026')]
  expect(show(rows)).toEqual(['A', 'b', 'Page 2', 'Page 10'])
  expect(show(rows, { key: 'name', dir: 'desc' })).toEqual(['Page 10', 'Page 2', 'b', 'A'])
})

test('journal days sort by date and come before letters', () => {
  const rows = [row({ name: 'Anna' }), day('2026-10-02', 'Friday, 2 Oct 2026'), day('2026-09-30', 'Wednesday, 30 Sep 2026')]
  expect(show(rows, DEFAULT_SORT, '', true)).toEqual(['Wednesday, 30 Sep 2026', 'Friday, 2 Oct 2026', 'Anna'])
})

test('ties are ordered by name A to Z in both directions', () => {
  const rows = [row({ name: 'x', linkedFrom: 1 }), row({ name: 'b', linkedFrom: 3 }), row({ name: 'a', linkedFrom: 3 })]
  expect(show(rows, { key: 'linkedFrom', dir: 'desc' })).toEqual(['a', 'b', 'x'])
  expect(show(rows, { key: 'linkedFrom', dir: 'asc' })).toEqual(['x', 'a', 'b'])
})

test('nulls are last in both directions', () => {
  const rows = [row({ name: 'a', edited: null }), row({ name: 'b', edited: 5 }), row({ name: 'c', edited: 9 })]
  expect(show(rows, { key: 'edited', dir: 'desc' })).toEqual(['c', 'b', 'a'])
  expect(show(rows, { key: 'edited', dir: 'asc' })).toEqual(['b', 'c', 'a'])
})

test('folder sorts top level first; journals are in "Journals"', () => {
  const rows = [row({ name: 'p', folder: 'Projects' }), row({ name: 't' }), row({ name: 'w', folder: 'People' })]
  expect(show(rows, { key: 'folder', dir: 'asc' })).toEqual(['t', 'w', 'p'])
  expect(folderLabel(row({ folder: '' }))).toBe('—')
  expect(folderLabel(row({ folder: 'Projects/Web' }))).toBe('Projects/Web')
  expect(folderLabel(day('2026-10-02', 'x'))).toBe('Journals')
})

test('the filter needs every word, ignores case, and finds journals by ISO date', () => {
  expect(matches(row({ name: 'Project X' }), 'pro x')).toBe(true)
  expect(matches(row({ name: 'Project Y' }), 'pro x')).toBe(false)
  expect(matches(row({ name: 'Anna' }), '  ')).toBe(true)
  expect(matches(day('2026-10-02', 'Friday, 2 Oct 2026'), '2026-10')).toBe(true)
  expect(matches(day('2026-10-02', 'Friday, 2 Oct 2026'), 'friday')).toBe(true)
  const rows = [row({ name: 'Release' }), row({ name: 'Release plan' }), row({ name: 'Anna' })]
  expect(show(rows, DEFAULT_SORT, 'REL')).toEqual(['Release', 'Release plan'])
})

test('countLabel and the date formats', () => {
  expect(countLabel(1, 1, false)).toBe('1 page')
  expect(countLabel(6, 6, false)).toBe('6 pages')
  expect(countLabel(2, 6, true)).toBe('2 of 6 pages')
  expect(formatDay(new Date(2026, 2, 2, 15, 0).getTime())).toBe('2 Mar 2026')
  expect(formatDayTime(new Date(2026, 9, 29, 9, 4).getTime())).toBe('29 Oct 2026, 09:04')
  expect(formatDay(null)).toBe('—')
  expect(formatDayTime(null)).toBe('—')
})

test('column labels and count tooltips follow §7.7 and the mockup', () => {
  expect(COLUMNS.map((c) => [c.key, c.label, c.numeric, c.title])).toEqual([
    ['name', 'Page', false, undefined],
    ['folder', 'Folder', false, undefined],
    ['created', 'Created', false, undefined],
    ['edited', 'Last edited', false, undefined],
    ['linkedFrom', 'Linked from', true, 'How many blocks elsewhere link to this page'],
    ['linksOut', 'Links out', true, 'How many links this page makes to other pages'],
  ])
})
