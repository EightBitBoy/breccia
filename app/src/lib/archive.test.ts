import { expect, test } from 'vitest'
import { countLabel, formatDate, matches, shownRows } from './archive'
import type { ArchivedView } from './types'

const row = (o: Partial<ArchivedView> = {}): ArchivedView => ({
  id: 1,
  page: 'release plan',
  pageName: 'Release plan',
  pageKind: 'page',
  source: 'Release plan',
  text: 'Update the changelog',
  state: 'DONE',
  color: 'green',
  done: '2026-10-26',
  archived: '2026-11-03',
  created: null,
  took: null,
  ...o,
})

test('the filter matches every word in the task, its state or its page, ignoring case', () => {
  expect(matches(row(), '')).toBe(true)
  expect(matches(row(), 'changelog')).toBe(true)
  expect(matches(row(), 'UPDATE release')).toBe(true)
  expect(matches(row(), 'done plan')).toBe(true)
  expect(matches(row(), 'changelog zzz')).toBe(false)
  expect(matches(row({ pageKind: 'journal', page: '2026-10-29', source: '29 Oct 2026' }), '2026-10-29')).toBe(true)
})

test('shownRows keeps the order (newest done first, from the core) and filters', () => {
  const rows = [row({ id: 1, text: 'a' }), row({ id: 2, text: 'b' }), row({ id: 3, text: 'ab' })]
  expect(shownRows(rows, 'b').map((r) => r.id)).toEqual([2, 3])
  expect(shownRows(rows, '  ').map((r) => r.id)).toEqual([1, 2, 3])
})

test('formatDate: 2 Mar 2026, and a dash for none', () => {
  expect(formatDate('2026-03-02')).toBe('2 Mar 2026')
  expect(formatDate('2026-11-03')).toBe('3 Nov 2026')
  expect(formatDate(null)).toBe('—')
  // With a time (the created and done columns).
  expect(formatDate('2026-08-29 09:00')).toBe('29 Aug 2026 09:00')
})

test('countLabel: tasks, and "of" while filtered', () => {
  expect(countLabel(1, 1, false)).toBe('1 task')
  expect(countLabel(6, 6, false)).toBe('6 tasks')
  expect(countLabel(2, 6, true)).toBe('2 of 6 tasks')
})
