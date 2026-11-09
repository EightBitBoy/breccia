import { expect, test } from 'vitest'
import { removeSlash, slashEdit, slashInsert, slashItems, slashQuery } from './slash'

test('slash query only at word start', () => {
  expect(slashQuery('ask /to')).toEqual({ start: 4, query: 'to' })
  expect(slashQuery('/')).toEqual({ start: 0, query: '' })
  expect(slashQuery('a/b')).toBeNull()
  expect(slashQuery('/to do')).toBeNull()
})

test('slash items filter', () => {
  const s = [{ keyword: 'TODO' }, { keyword: 'DOING' }, { keyword: 'WAITING' }]
  expect(slashItems(s, 'do').map((i) => i.label)).toEqual(['DOING'])
  expect(slashItems(s, 't').map((i) => i.label)).toEqual(['TODO', 'Link to page', "Today's date", 'Current time'])
  expect(slashItems(s, 'page').map((i) => i.label)).toEqual(['Link to page'])
  expect(slashItems(s, '').map((i) => i.label)).toHaveLength(6)
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
  expect(slashInsert({ kind: 'date', label: "Today's date" }, now)).toEqual({ text: '[[2026-01-05]]', caret: 14 })
  expect(slashInsert({ kind: 'time', label: 'Current time' }, now)).toEqual({ text: '07:03', caret: 5 })
  expect(slashInsert({ kind: 'time', label: 'Current time' }, new Date(2026, 0, 5, 23, 59))).toEqual({
    text: '23:59',
    caret: 5,
  })
  expect(slashInsert({ kind: 'state', keyword: 'TODO', label: 'TODO' }, now)).toBeNull()
})

test('slashEdit for a state removes the query and the space, and names the state', () => {
  expect(slashEdit('TODO later /do', 11, 14, { kind: 'state', keyword: 'DOING', label: 'DOING' }, new Date())).toEqual({
    from: 10,
    to: 14,
    insert: '',
    caret: 10,
    setState: 'DOING',
  })
})

test('slashEdit for a link inserts brackets with the caret inside', () => {
  expect(slashEdit('see /li', 4, 7, { kind: 'link', label: 'Link to page' }, new Date())).toEqual({
    from: 4,
    to: 7,
    insert: '[[]]',
    caret: 6,
    setState: null,
  })
})
