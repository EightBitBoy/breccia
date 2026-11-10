import { expect, test } from 'vitest'
import { removeSlash, slashEdit, slashInsert, slashItems, slashQuery, type SlashItem } from './slash'

const TODAY: SlashItem = { kind: 'date', label: 'Today', days: 0, words: 'date', icon: 'calendar' }
const YESTERDAY: SlashItem = { kind: 'date', label: 'Yesterday', days: -1, words: 'date', icon: 'calendar' }
const PICK: SlashItem = { kind: 'pickdate', label: 'Date…', words: '', icon: 'calendar' }
const yesterdayAt = (now: Date) => slashInsert(YESTERDAY, now)?.text

test('slash query only at word start', () => {
  expect(slashQuery('ask /to')).toEqual({ start: 4, query: 'to' })
  expect(slashQuery('/')).toEqual({ start: 0, query: '' })
  expect(slashQuery('a/b')).toBeNull()
  expect(slashQuery('/to do')).toBeNull()
})

test('slash items filter', () => {
  const s = [{ keyword: 'TODO' }, { keyword: 'DOING' }, { keyword: 'WAITING' }]
  expect(slashItems(s, 'do').map((i) => i.label)).toEqual(['DOING'])
  expect(slashItems(s, 't').map((i) => i.label)).toEqual(['TODO', 'Link to page', 'Today'])
  expect(slashItems(s, 'date').map((i) => i.label)).toEqual(['Today', 'Yesterday', 'Date…'])
  expect(slashItems(s, 'yes').map((i) => i.label)).toEqual(['Yesterday'])
  expect(slashItems(s, 'tod').map((i) => i.label)).toEqual(['TODO', 'Today'])
  expect(slashItems(s, 'da').map((i) => i.label)).toEqual(['Today', 'Yesterday', 'Date…'])
  expect(slashItems(s, 'page').map((i) => i.label)).toEqual(['Link to page'])
  expect(slashItems(s, '').map((i) => i.label)).toHaveLength(7)
  expect(slashItems(s, 'TODO')[0]).toEqual({ kind: 'state', keyword: 'TODO', label: 'TODO' })
})

test('a state item carries its colour for the menu chip', () => {
  const s = [{ keyword: 'DOING', color: 'amber' }]
  expect(slashItems(s, 'doi')[0]).toEqual({ kind: 'state', keyword: 'DOING', label: 'DOING', color: 'amber' })
})

test('removing the query drops the space before it only at the end of the text', () => {
  // "TODO later /do": the slash is at 11, the caret at 14.
  expect(removeSlash('TODO later /do', 11, 14)).toEqual({ text: 'TODO later', at: 10 })
  // Something follows the query: only "/query" goes.
  expect(removeSlash('a /do b', 2, 5)).toEqual({ text: 'a  b', at: 2 })
  // The whitespace is the first character of the text: it stays.
  expect(removeSlash(' /do', 1, 4)).toEqual({ text: ' ', at: 1 })
  // The slash starts the text.
  expect(removeSlash('/do', 0, 3)).toEqual({ text: '', at: 0 })
  // Only one whitespace character goes.
  expect(removeSlash('a  /do', 3, 6)).toEqual({ text: 'a ', at: 2 })
  expect(removeSlash('a\n/do', 2, 5)).toEqual({ text: 'a', at: 1 })
})

test('removing the query for an item that inserts text keeps the space', () => {
  expect(removeSlash('see /da', 4, 7, false)).toEqual({ text: 'see ', at: 4 })
})

test('what each item inserts, with the caret offset in it', () => {
  const now = new Date(2026, 0, 5, 7, 3)
  expect(slashInsert({ kind: 'link', label: 'Link to page' }, now)).toEqual({ text: '[[]]', caret: 2 })
  expect(slashInsert(TODAY, now)).toEqual({ text: '[[2026-01-05]]', caret: 14 })
  expect(slashInsert(YESTERDAY, now)).toEqual({ text: '[[2026-01-04]]', caret: 14 })
  expect(slashInsert(PICK, now)).toEqual({ text: '', caret: 0 })
  expect(slashInsert({ kind: 'state', keyword: 'TODO', label: 'TODO' }, now)).toBeNull()
})

test('yesterday crosses month, year and leap day', () => {
  expect(yesterdayAt(new Date(2026, 0, 1, 0, 0, 1))).toBe('[[2025-12-31]]')
  expect(yesterdayAt(new Date(2028, 2, 1, 12))).toBe('[[2028-02-29]]')
  expect(yesterdayAt(new Date(2026, 2, 1, 12))).toBe('[[2026-02-28]]')
})

test('yesterday is the calendar day before, around midnight and a clock change', () => {
  expect(yesterdayAt(new Date(2026, 10, 10, 23, 59, 59))).toBe('[[2026-11-09]]')
  expect(yesterdayAt(new Date(2026, 10, 10, 0, 0, 0))).toBe('[[2026-11-09]]')
  // The day after Europe's spring clock change; it only crosses the change in a European time zone (CI runs in UTC).
  expect(yesterdayAt(new Date(2026, 2, 30, 0, 30))).toBe('[[2026-03-29]]')
})

test('date items carry the calendar icon, states and the link none', () => {
  const items = slashItems([{ keyword: 'TODO' }], '')
  const icon = (i: SlashItem) => ('icon' in i ? i.icon : undefined)
  expect(items.map(icon)).toEqual([undefined, undefined, 'calendar', 'calendar', 'calendar'])
})

test('slashEdit for a state removes the query and the space, and names the state', () => {
  expect(slashEdit('TODO later /do', 11, 14, { kind: 'state', keyword: 'DOING', label: 'DOING' }, new Date())).toEqual({
    from: 10,
    to: 14,
    insert: '',
    caret: 10,
    setState: 'DOING',
    pickDate: false,
  })
})

test('slashEdit for the date picker removes only the query, keeps the space, and asks for the picker', () => {
  expect(slashEdit('see /da', 4, 7, PICK, new Date())).toEqual({
    from: 4,
    to: 7,
    insert: '',
    caret: 4,
    setState: null,
    pickDate: true,
  })
})

test('slashEdit for a link inserts brackets with the caret inside', () => {
  expect(slashEdit('see /li', 4, 7, { kind: 'link', label: 'Link to page' }, new Date())).toEqual({
    from: 4,
    to: 7,
    insert: '[[]]',
    caret: 6,
    setState: null,
    pickDate: false,
  })
})
