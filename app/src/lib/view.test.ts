import { expect, test } from 'vitest'
import { placeOf } from './view'
import type { Command } from './types'

const cmd = (type: string) => ({ type }) as Command
const page = (key: string | null) => ({ page: key, days: null, board: false, allPages: false })

test('any output shows its page when none is shown, or when it is the shown one', () => {
  expect(placeOf(cmd('block.setText'), page(null), 'p')).toBe('navigate')
  expect(placeOf(cmd('block.setText'), page('p'), 'p')).toBe('page')
})

test('a late typing or edit output for another page is not shown', () => {
  for (const t of ['block.setText', 'block.split', 'blocks.indent', 'history.undo']) {
    expect(placeOf(cmd(t), page('q'), 'p')).toBe('none')
  }
})

test('navigation switches the page', () => {
  for (const t of ['page.open', 'page.today', 'page.reload', 'folder.open']) {
    expect(placeOf(cmd(t), page('q'), 'p')).toBe('navigate')
  }
  expect(placeOf({ type: 'page.create', name: 'N', folder: '' }, page('q'), 'n')).toBe('navigate')
  expect(placeOf(undefined, page('q'), 'p')).toBe('navigate')
})

test('a rename of another page does not navigate', () => {
  expect(placeOf({ type: 'page.rename', key: 'b', name: 'C' }, page('a'), 'c')).toBe('none')
  expect(placeOf({ type: 'page.rename', key: 'a', name: 'C' }, page('a'), 'c')).toBe('page')
})

test('a move of another page does not navigate', () => {
  expect(placeOf({ type: 'page.move', key: 'b', folder: 'F' }, page('a'), 'b')).toBe('none')
  expect(placeOf({ type: 'page.move', key: 'a', folder: 'F' }, page('a'), 'a')).toBe('page')
})

test('page.get shows the shown page only', () => {
  expect(placeOf({ type: 'page.get', key: 'b' }, page('a'), 'b')).toBe('none')
  expect(placeOf({ type: 'page.get', key: 'a' }, page('a'), 'a')).toBe('page')
})

test('coloring another page from a link stays on the shown page or the feed', () => {
  const set = (key: string) => ({ type: 'page.setColor', key, color: 'red' }) as Command
  expect(placeOf(set('hiring'), page('2026-10-29'), 'hiring')).toBe('none')
  expect(placeOf(set('a'), page('a'), 'a')).toBe('page')
  const feed = { page: null, days: new Set(['2026-10-29']), board: false, allPages: false }
  expect(placeOf(set('hiring'), feed, 'hiring')).toBe('none')
})

test('outputs for a loaded day update the day', () => {
  const shown = { page: null, days: new Set(['d1']), board: false, allPages: false }
  expect(placeOf(cmd('block.setText'), shown, 'd1')).toBe('day')
  expect(placeOf({ type: 'page.get', key: 'd1' }, shown, 'd1')).toBe('day')
  expect(placeOf(cmd('block.setText'), shown, 'x')).toBe('none')
})

test('opening a day from the feed navigates', () => {
  expect(placeOf({ type: 'page.open', name: 'd1' }, { page: null, days: new Set(['d1']), board: false, allPages: false }, 'd1')).toBe('navigate')
})

test('page.open, page.today and page.create answering with a loaded day navigate', () => {
  const shown = { page: null, days: new Set(['d1']), board: false, allPages: false }
  expect(placeOf({ type: 'page.open', name: 'd1' }, shown, 'd1')).toBe('navigate')
  expect(placeOf({ type: 'page.today' }, shown, 'd1')).toBe('navigate')
  expect(placeOf({ type: 'page.create', name: 'd1', folder: '' }, shown, 'd1')).toBe('navigate')
})

test('with a page shown and loaded days both given, the shown page wins, then the days', () => {
  const shown = { page: 'p', days: new Set(['d1']), board: false, allPages: false }
  expect(placeOf(cmd('block.setText'), shown, 'p')).toBe('page')
  expect(placeOf(cmd('block.setText'), shown, 'd1')).toBe('day')
  expect(placeOf(cmd('block.setText'), shown, 'x')).toBe('none')
  expect(placeOf({ type: 'page.get', key: 'd1' }, shown, 'd1')).toBe('day')
  expect(placeOf({ type: 'page.open', name: 'd1' }, shown, 'd1')).toBe('navigate')
})

test('with a board shown, edits stay put and navigation leaves it', () => {
  const board = { page: null, days: null, board: true, allPages: false }
  expect(placeOf({ type: 'block.setText', id: 1, text: 'x' }, board, 'p')).toBe('none')
  expect(placeOf({ type: 'blocks.setState', ids: [1], keyword: 'DONE' }, board, 'p')).toBe('none')
  expect(placeOf({ type: 'journal.append', text: 'TODO' }, board, 'd')).toBe('none')
  expect(placeOf({ type: 'page.open', name: 'p' }, board, 'p')).toBe('navigate')
})

test('the table stays for edits and tree operations; navigation leaves it', () => {
  const t = { page: null, days: null, board: false, allPages: true }
  expect(placeOf({ type: 'page.rename', key: 'a', name: 'B' }, t, 'b')).toBe('none')
  expect(placeOf({ type: 'page.get', key: 'a' }, t, 'a')).toBe('none')
  expect(placeOf({ type: 'page.show', key: 'a' }, t, 'a')).toBe('navigate')
  expect(placeOf({ type: 'page.create', name: 'N', folder: '' }, t, 'n')).toBe('navigate')
})
test('page.show of a loaded feed day navigates, like page.open', () => {
  expect(placeOf({ type: 'page.show', key: 'd' }, { page: null, days: new Set(['d']), board: false, allPages: false }, 'd')).toBe('navigate')
})

test('with the graph shown, only navigation navigates', () => {
  const shown = { page: null, days: null, board: false, allPages: false, graph: true }
  expect(placeOf({ type: 'block.setText', id: 1, text: 'x' }, shown, 'a')).toBe('none')
  expect(placeOf({ type: 'page.open', name: 'a' }, shown, 'a')).toBe('navigate')
})

test('with the Archive view shown, only navigation navigates', () => {
  const shown = { page: null, days: null, board: false, allPages: false, archive: true }
  expect(placeOf({ type: 'archive.auto', editing: null }, shown, 'a')).toBe('none')
  expect(placeOf({ type: 'page.show', key: 'a' }, shown, 'a')).toBe('navigate')
})

test('with the Git history shown, only navigation navigates', () => {
  const shown = { page: null, days: null, board: false, allPages: false, gitLog: true }
  expect(placeOf({ type: 'block.setText', id: 1, text: 'x' }, shown, 'a')).toBe('none')
  expect(placeOf({ type: 'page.open', name: 'a' }, shown, 'a')).toBe('navigate')
})
