import { expect, test } from 'vitest'
import { NOT_A_TASK, dueChip, fillDueChips } from './due'

const T = '2026-11-23'

test.each([
  ['2026-11-29', 'due 29 Nov', 'later', null],
  ['2026-11-28', 'due in 5 days', 'later', '28 Nov 2026'],
  ['2026-11-26', 'due in 3 days', 'later', '26 Nov 2026'],
  ['2026-11-25', 'due in 2 days', 'soon', '25 Nov 2026'],
  ['2026-11-24', 'due tomorrow', 'soon', '24 Nov 2026'],
  ['2026-11-23', 'due today', 'soon', '23 Nov 2026'],
  ['2026-11-22', 'overdue 22 Nov', 'overdue', null],
  ['2027-01-05', 'due 5 Jan 2027', 'later', null],
  ['2025-12-01', 'overdue 1 Dec 2025', 'overdue', null],
])('unfinished task due %s', (due, label, tone, title) => {
  expect(dueChip(due, T, false)).toEqual({ label, tone, title })
})

test.each([
  ['2026-11-22', 'due 22 Nov'],
  ['2026-11-23', 'due 23 Nov'],
  ['2026-11-25', 'due 25 Nov'],
])('finished task due %s keeps the date', (due, label) => {
  expect(dueChip(due, T, true)).toEqual({ label, tone: 'finished', title: null })
})

test('the words cross a month and a year end', () => {
  expect(dueChip('2027-01-01', '2026-12-30', false)).toEqual({ label: 'due in 2 days', tone: 'soon', title: '1 Jan 2027' })
  expect(dueChip('2027-01-05', '2026-12-30', false)).toEqual({ label: 'due 5 Jan 2027', tone: 'later', title: null })
})

test('fillDueChips fills one placeholder with words, tone and tooltip', () => {
  const out = fillDueChips('<p>x <span class="chip due" data-due="2026-11-22"></span></p>', T)
  expect(out).toBe('<p>x <span class="chip due" data-due="2026-11-22" data-tone="overdue">overdue 22 Nov</span></p>')
  expect(fillDueChips('<span class="chip due" data-due="2026-11-24"></span>', T)).toBe(
    '<span class="chip due" data-due="2026-11-24" data-tone="soon" title="24 Nov 2026">due tomorrow</span>',
  )
})

test('fillDueChips keeps data-finished and fills every placeholder', () => {
  const html =
    '<span class="chip due" data-due="2026-11-22" data-finished=""></span> <span class="chip due" data-due="2026-11-29"></span>'
  expect(fillDueChips(html, T)).toBe(
    '<span class="chip due" data-due="2026-11-22" data-finished="" data-tone="finished">due 22 Nov</span> <span class="chip due" data-due="2026-11-29" data-tone="later">due 29 Nov</span>',
  )
})

test('fillDueChips returns other HTML as is', () => {
  const html = '<p>a <span class="chip">x</span></p>'
  expect(fillDueChips(html, T)).toBe(html)
})

test('the refusal sentence matches the core', () => {
  expect(NOT_A_TASK).toBe('Only a task can have a due date.')
})
