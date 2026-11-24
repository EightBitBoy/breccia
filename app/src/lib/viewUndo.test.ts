import { expect, test } from 'vitest'
import { historyKey } from './keys'
import { stepPages, ViewUndo } from './viewUndo'
import type { Command, Output, PageView } from './types'
import { emptyOutput } from './emptyOutput.testing'

const pg = (key: string): PageView => ({ key, name: key, kind: 'page', title: key, preambleHtml: '', hasFile: true, blocks: [] })
const out = (page: string | null, changed: string[] = []): Output => ({
  ...emptyOutput(),
  page: page === null ? null : pg(page),
  changed: changed.map(pg),
})
const place: Command = { type: 'board.place', id: 1, keyword: 'DOING', before: null }
const undo = (page: string): Command => ({ type: 'history.undo', page })
const redo = (page: string): Command => ({ type: 'history.redo', page })
const k = (key: string, mods: { ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean } = {}) => ({
  key, ctrl: false, shift: false, alt: false, meta: false, ...mods,
})

test('historyKey: Ctrl Z undoes, Ctrl Shift Z and Ctrl Y redo; Cmd on a Mac', () => {
  expect(historyKey(k('z', { ctrl: true }), false)).toBe('undo')
  expect(historyKey(k('Z', { ctrl: true, shift: true }), false)).toBe('redo')
  expect(historyKey(k('y', { ctrl: true }), false)).toBe('redo')
  expect(historyKey(k('z', { meta: true }), true)).toBe('undo')
  expect(historyKey(k('z', { ctrl: true }), true)).toBeNull()
  expect(historyKey(k('z', { ctrl: true, alt: true }), false)).toBeNull()
  expect(historyKey(k('z'), false)).toBeNull()
  expect(historyKey(k('y', { ctrl: true, shift: true }), false)).toBeNull()
})

test('stepPages: a drop is one step on its page; archiving is one step per page; reads have none', () => {
  // The drop also raised a card on b: one grouped step, which the card's page's undo takes whole.
  expect(stepPages(place, out('a', ['b']))).toEqual(['a'])
  expect(stepPages({ type: 'board.archive', keyword: 'DONE' }, out(null, ['a', 'b']))).toEqual(['a', 'b'])
  expect(stepPages({ type: 'blocks.delete', ids: [1] }, out('a'))).toEqual(['a'])
  expect(stepPages({ type: 'page.get', key: 'a' }, out('a'))).toEqual([])
  expect(stepPages({ type: 'board.get', index: 0 }, out(null))).toEqual([])
  expect(stepPages(undo('a'), out('a'))).toEqual([])
})

test('undo and redo step back through the changes made in the view, newest first', () => {
  const u = new ViewUndo()
  u.record('board:0', place, out('a', ['c']))
  u.record('board:0', { ...place, id: 2 }, out('b'))
  expect(u.step('board:0', 'undo')).toEqual([undo('b')])
  expect(u.step('board:0', 'undo')).toEqual([undo('a')])
  expect(u.step('board:0', 'undo')).toEqual([])
  expect(u.step('board:0', 'redo')).toEqual([redo('a')])
  expect(u.step('board:0', 'redo')).toEqual([redo('b')])
  expect(u.step('board:0', 'redo')).toEqual([])
  expect(u.step('board:0', 'undo')).toEqual([undo('b')])
})

test('an archive of several pages is undone on each of them with one key', () => {
  const u = new ViewUndo()
  u.record('board:0', { type: 'board.archive', keyword: 'DONE' }, out(null, ['a', 'b']))
  expect(u.step('board:0', 'undo')).toEqual([undo('a'), undo('b')])
  expect(u.step('board:0', 'redo')).toEqual([redo('a'), redo('b')])
})

test('a new change drops what could be redone', () => {
  const u = new ViewUndo()
  u.record('journal', { type: 'blocks.delete', ids: [1] }, out('d1'))
  u.step('journal', 'undo')
  u.record('journal', { type: 'blocks.delete', ids: [2] }, out('d2'))
  expect(u.step('journal', 'redo')).toEqual([])
  expect(u.step('journal', 'undo')).toEqual([undo('d2')])
})

test('another view has nothing to undo; a change made there starts again', () => {
  const u = new ViewUndo()
  u.record('board:0', place, out('a'))
  expect(u.step('journal', 'undo')).toEqual([])
  expect(u.step('board:1', 'undo')).toEqual([])
  u.record('page:x', { type: 'blocks.delete', ids: [1] }, out('x'))
  expect(u.step('board:0', 'undo')).toEqual([])
})

test('typing in one block is one change, as the core keeps it one step', () => {
  const u = new ViewUndo()
  u.record('journal', { type: 'block.setText', id: 1, text: 'a' }, out('d1'))
  u.record('journal', { type: 'block.setText', id: 1, text: 'ab' }, out('d1'))
  u.record('journal', { type: 'block.setText', id: 2, text: 'x' }, out('d2'))
  expect(u.step('journal', 'undo')).toEqual([undo('d2')])
  expect(u.step('journal', 'undo')).toEqual([undo('d1')])
  expect(u.step('journal', 'undo')).toEqual([])
})

test('an undo or redo sent from the editor moves the newest change of its page along', () => {
  const u = new ViewUndo()
  u.record('journal', { type: 'blocks.delete', ids: [1] }, out('d1'))
  u.record('journal', { type: 'blocks.delete', ids: [2] }, out('d2'))
  u.record('journal', undo('d2'), out('d2'))
  expect(u.step('journal', 'undo')).toEqual([undo('d1')])
  u.record('journal', redo('d1'), out('d1'))
  expect(u.step('journal', 'redo')).toEqual([redo('d2')])
})

test('the answers to its own undo and redo do not move it twice', () => {
  const u = new ViewUndo()
  u.record('board:0', place, out('a'))
  u.record('board:0', { ...place, id: 2 }, out('b'))
  const [cmd] = u.step('board:0', 'undo')
  u.record('board:0', cmd, out('b'))
  expect(u.step('board:0', 'undo')).toEqual([undo('a')])
})

test('another notes folder forgets every change', () => {
  const u = new ViewUndo()
  u.record('board:0', place, out('a'))
  u.clear()
  expect(u.step('board:0', 'undo')).toEqual([])
})
