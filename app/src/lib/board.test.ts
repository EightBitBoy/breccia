import { expect, test } from 'vitest'
import {
  moveBoardNamed,
  addableColumns,
  cardMenu,
  cardOf,
  cardRoot,
  clip,
  defaultColumns,
  descriptionOf,
  dropBefore,
  placeCommand,
  isBareKeyword,
  addedText,
  moveColumn,
  settingsAfterSet,
  boardDialogAfterConfig,
  moveBoard,
  settingsIndexAfterConfig,
  shownAfterDelete,
  sourceLine,
  subtaskHint,
  withBoard,
  withoutBoard,
} from './board'
import type { BlockView, CardView, PageView, RefsView, StateView } from './types'

const blk = (id: number, text: string, depth: number, state: string | null = null): BlockView => ({
  id, depth, text, html: text, state, finished: false, hasChildren: false,
})
const pg = (key: string, blocks: BlockView[]): PageView => ({
  key, name: key, kind: 'page', title: key, preambleHtml: '', hasFile: true, blocks,
})
const card = (blocks: BlockView[]): CardView => ({
  id: blocks[0]?.id ?? 1, page: 'p', pageName: 'P', pageKind: 'page', source: 'P', html: '', blocks,
  subtasksDone: 0, subtasksTotal: 0, parent: null, done: null, created: null,
})
const refsOf = (key: string, blocks: BlockView[]): RefsView => ({
  key, count: 1, groups: [{ page: key, title: key, kind: 'page', refs: [{ crumbs: [], blocks }] }],
})
const st = (keyword: string, finished: boolean, inCycle: boolean): StateView => ({ keyword, color: 'grey', finished, inCycle })

test('the description is the stateless blocks outside subtasks', () => {
  const c = card([blk(1, 'TODO R', 0, 'TODO'), blk(2, 'note', 1), blk(3, 'deeper', 2), blk(4, 'TODO S', 1, 'TODO'), blk(5, 'S note', 2), blk(6, 'more', 1)])
  expect(descriptionOf(c).map((b) => [b.id, b.depth])).toEqual([[2, 0], [3, 1], [6, 0]])
})
test('clip keeps n items and counts the rest', () => {
  expect(clip([1, 2, 3, 4, 5], 4)).toEqual({ shown: [1, 2, 3, 4], more: 1 })
  expect(clip([1], 4)).toEqual({ shown: [1], more: 0 })
})
test('source line and subtask hint', () => {
  expect(sourceLine({ ...card([]), source: '29 Oct 2026', done: '28 Oct' })).toBe('29 Oct 2026 · ✓ 28 Oct')
  expect(sourceLine({ ...card([]), source: 'P', done: null })).toBe('P')
  expect(sourceLine({ ...card([]), source: 'Release 2', created: '26 Oct' })).toBe('Release 2 · created 26 Oct')
  // A finished card shows its done day, not the created one.
  expect(sourceLine({ ...card([]), source: 'P', done: '28 Oct', created: '26 Oct' })).toBe('P · ✓ 28 Oct')
  expect(subtaskHint({ ...card([]), subtasksDone: 1, subtasksTotal: 2 })).toBe('1/2 subtasks')
  expect(subtaskHint({ ...card([]), subtasksDone: 0, subtasksTotal: 0 })).toBeNull()
})
test('cardOf takes the subtree with relative depths', () => {
  const page = pg('p', [blk(1, 'a', 0), blk(2, 'TODO b', 1, 'TODO'), blk(3, 'c', 2), blk(4, 'd', 1)])
  const r = cardOf(page, 2)!
  expect(r.key).toBe('p')
  expect(r.groups[0].refs[0].blocks.map((b) => [b.id, b.depth])).toEqual([[2, 0], [3, 1]])
  expect(cardOf(page, 9)).toBeNull()
})
test('a drop places the card above the card under the pointer, in any column', () => {
  const todo = { keyword: 'TODO', finished: false, ids: [1, 2, 3] }
  const place = (before: number | null, keyword = 'TODO') => ({ type: 'board.place', id: 1, keyword, before })
  // Another column, at a place or at its end; its own column at another place.
  expect(placeCommand({ id: 1, state: 'TODO' }, { keyword: 'DOING', finished: false, ids: [7] }, 7)).toEqual(place(7, 'DOING'))
  expect(placeCommand({ id: 1, state: 'TODO' }, { keyword: 'DOING', finished: false, ids: [] }, null)).toEqual(place(null, 'DOING'))
  expect(placeCommand({ id: 1, state: 'TODO' }, todo, 3)).toEqual(place(3))
  expect(placeCommand({ id: 1, state: 'TODO' }, todo, null)).toEqual(place(null))
  expect(placeCommand({ id: 3, state: 'TODO' }, todo, 1)).toEqual({ type: 'board.place', id: 3, keyword: 'TODO', before: 1 })
  // Its own place: on itself, above the card below it, or the last card at the end.
  expect(placeCommand({ id: 1, state: 'TODO' }, todo, 1)).toBeNull()
  expect(placeCommand({ id: 1, state: 'TODO' }, todo, 2)).toBeNull()
  expect(placeCommand({ id: 3, state: 'TODO' }, todo, null)).toBeNull()
  // A finished column: into it from another column, at any place; within it nothing.
  const done = { keyword: 'DONE', finished: true, ids: [8, 9] }
  expect(placeCommand({ id: 1, state: 'TODO' }, done, 9)).toEqual(place(9, 'DONE'))
  expect(placeCommand({ id: 8, state: 'DONE' }, done, null)).toBeNull()
})
test('the pointer drops above the first card whose middle is below it', () => {
  const cards = [
    { id: 1, top: 0, bottom: 100 },
    { id: 2, top: 110, bottom: 150 },
    { id: 3, top: 160, bottom: 260 },
  ]
  expect(dropBefore(cards, 9, -20)).toBe(1)
  expect(dropBefore(cards, 9, 49)).toBe(1)
  expect(dropBefore(cards, 9, 51)).toBe(2)
  expect(dropBefore(cards, 9, 129)).toBe(2)
  expect(dropBefore(cards, 9, 131)).toBe(3)
  expect(dropBefore(cards, 9, 211)).toBeNull()
  // The dragged card itself is left out.
  expect(dropBefore(cards, 2, 120)).toBe(3)
  expect(dropBefore([], 2, 120)).toBeNull()
})
test('bare keyword', () => {
  expect(isBareKeyword('TODO', 'TODO')).toBe(true)
  expect(isBareKeyword('TODO  ', 'TODO')).toBe(true)
  expect(isBareKeyword('TODO x', 'TODO')).toBe(false)
  // "+ Add" writes created:: under the keyword: still bare.
  expect(isBareKeyword('TODO\ncreated:: 2026-11-04 09:12:30', 'TODO')).toBe(true)
  expect(isBareKeyword('TODO \ncreated:: 2026-11-04 09:12:30', 'TODO')).toBe(true)
  expect(isBareKeyword('TODO\ncreated:: 2026-11-04 09:12:30\nowner:: Ben', 'TODO')).toBe(false)
  expect(isBareKeyword('TODO x\ncreated:: 2026-11-04 09:12:30', 'TODO')).toBe(false)
})
test('an added card opens with a space after its keyword and keeps its other lines', () => {
  expect(addedText('TODO', 'TODO')).toBe('TODO ')
  expect(addedText('TODO\ncreated:: 2026-11-04 09:12:30', 'TODO')).toBe('TODO \ncreated:: 2026-11-04 09:12:30')
})
test('column editing helpers', () => {
  const states = [st('TODO', false, true), st('DOING', false, true), st('WAITING', false, false), st('DONE', true, true), st('ARCHIVED', true, false)]
  expect(defaultColumns(states)).toEqual(['TODO', 'DOING', 'WAITING', 'DONE'])
  expect(moveColumn(['A', 'B', 'C'], 0, 1)).toEqual(['B', 'A', 'C'])
  expect(moveColumn(['A', 'B', 'C'], 0, -1)).toEqual(['A', 'B', 'C'])
  expect(addableColumns(states, ['DOING', 'DONE'])).toEqual(['TODO', 'WAITING', 'ARCHIVED'])
})
test('board list edits replace, remove and leave the list given alone', () => {
  const list = [{ name: 'A', columns: ['TODO'] }, { name: 'B', columns: ['DONE'] }, { name: 'C', columns: [] }]
  const b = { name: 'B2', columns: ['DOING'] }
  expect(withBoard(list, 1, b)).toEqual([list[0], b, list[2]])
  expect(withoutBoard(list, 1)).toEqual([list[0], list[2]])
  expect(withoutBoard(list, 0)).toEqual([list[1], list[2]])
  expect(list.map((x) => x.name)).toEqual(['A', 'B', 'C'])
})
test('the board shown after a delete', () => {
  expect(shownAfterDelete(1, 1)).toBe('feed')
  expect(shownAfterDelete(2, 1)).toBe(1)
  expect(shownAfterDelete(0, 1)).toBe(0)
  expect(shownAfterDelete(null, 1)).toBeNull()
})
test('board settings close only after the core accepted the edit, and only their own dialog', () => {
  expect(settingsAfterSet(1, 1, true)).toBeNull()
  expect(settingsAfterSet(1, 1, false)).toBe(1)
  // refused because config.toml changed since the dialog opened: it closes, so the file's values show when it opens again
  expect(settingsAfterSet(1, 1, false, 'configChanged')).toBeNull()
  expect(settingsAfterSet(1, 1, false, 'invalidSetting')).toBe(1)
  expect(settingsAfterSet(2, 1, true)).toBe(2)
  expect(settingsAfterSet(null, 1, true)).toBeNull()
})
test('cardRoot is the open card root, or null', () => {
  expect(cardRoot(null)).toBeNull()
  expect(cardRoot(refsOf('c', [blk(7, 'TODO x', 0, 'TODO'), blk(8, 'y', 1)]))).toBe(7)
})
test('the board dialog follows its board by name, case-insensitively (never by index)', () => {
  const boards = [{ name: 'Work', columns: [] }, { name: 'Home', columns: [] }]
  expect(settingsIndexAfterConfig({ index: 0, name: 'Work' }, boards)).toBe(0)
  expect(settingsIndexAfterConfig({ index: 0, name: 'work' }, [boards[1], boards[0]])).toBe(1)
  expect(settingsIndexAfterConfig({ index: 0, name: 'Gone' }, boards)).toBeNull()
  expect(settingsIndexAfterConfig(null, boards)).toBeNull()
})

test('moveBoard swaps with a neighbour; the ends are a no-op', () => {
  const a = { name: 'A', columns: ['TODO'] }
  const b = { name: 'B', columns: ['DONE'] }
  expect(moveBoard([a, b], 0, 1)).toEqual([b, a])
  expect(moveBoard([a, b], 1, -1)).toEqual([b, a])
  expect(moveBoard([a, b], 0, -1)).toEqual([a, b])
  expect(moveBoard([a, b], 1, 1)).toEqual([a, b])
})

test('boardDialogAfterConfig follows the board by name, else closes with a notice', () => {
  const boards = [
    { name: 'Work', columns: ['TODO'] },
    { name: 'Home', columns: ['TODO'] },
  ]
  expect(boardDialogAfterConfig(null, boards)).toEqual({ index: null, notice: null })
  expect(boardDialogAfterConfig({ index: 0, name: 'Home' }, boards)).toEqual({ index: 1, notice: null })
  expect(boardDialogAfterConfig({ index: 0, name: 'Gone' }, boards)).toEqual({
    index: null,
    notice: 'The board Gone changed in breccia/config.toml.',
  })
})

test('cardMenu: the other columns, and Archive (no Unarchive)', () => {
  const cols = ['TODO', 'DOING', 'DONE']
  expect(cardMenu('DONE', cols)).toStrictEqual({ moveTo: ['TODO', 'DOING'], archive: true })
  // Any column can archive.
  expect(cardMenu('TODO', cols)).toStrictEqual({ moveTo: ['DOING', 'DONE'], archive: true })
})

test('moveBoardNamed moves the board with that name, wherever it is now', () => {
  const b = (name: string) => ({ name, columns: ['TODO'] })
  const list = [b('A'), b('B'), b('C')]
  // ↑ ↑ on C: the second click runs after the first answer, when C is second.
  const once = moveBoardNamed(list, 'C', -1)
  expect(once?.map((x) => x.name)).toEqual(['A', 'C', 'B'])
  expect(moveBoardNamed(once!, 'c', -1)?.map((x) => x.name)).toEqual(['C', 'A', 'B'])
  // Gone, or already at the end: nothing to send.
  expect(moveBoardNamed(list, 'X', -1)).toBeNull()
  expect(moveBoardNamed(list, 'A', -1)).toBeNull()
})
