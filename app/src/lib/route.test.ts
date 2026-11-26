import { expect, test } from 'vitest'
import type { MainKind } from './mainArea.svelte'
import { extendsTo, route, selectionPageOf, type ShownView } from './route'
import type { Feed } from './feed'
import type { Command, Output, PageView, TreeView } from './types'
import { emptyOutput } from './emptyOutput.testing'

const empty: Output = emptyOutput()

const pg = (key: string, ids: number[]): PageView => ({
  key,
  name: key,
  kind: 'page',
  title: key,
  preambleHtml: '', hasFile: true,
  blocks: ids.map((id) => ({ id, depth: 0, text: '', html: '', state: null, finished: false, hasChildren: false })),
})

const view = (o: Partial<ShownView> = {}): ShownView => ({ page: null, days: null, groups: new Set(), editingInRefs: false, main: 'none', card: null, ...o })
const out = (o: Partial<Output>): Output => ({ ...empty, ...o })
/** A `journal.feed` answer's part of an output. */
const feedAnswer: Partial<Output> = { answer: { kind: 'feed', value: { today: 'd', days: [] } } }
const tree = (version: number): TreeView => ({ pages: [], journals: [], tags: [], version })
const keys = (ps: PageView[]) => ps.map((p) => p.key)

test('an applied feed answer is shown and leaves the page', () => {
  const r = route(out(feedAnswer), { type: 'journal.feed' }, view({ page: 'p' }), true)
  expect(r.leavePage).toBe(true)
  expect(r.clearSelection).toBe(true)
  expect(r.shown).toBe(true)
})

test('a feed answer that was not applied changes nothing', () => {
  const r = route(out(feedAnswer), { type: 'journal.feed' }, view({ page: 'p' }), false)
  expect(r.leavePage).toBe(false)
  expect(r.shown).toBe(false)
})

test('navigating to another page resets the scroll and reloads the references', () => {
  const r = route(out({ page: pg('b', [1]) }), { type: 'page.open', name: 'b' }, view({ page: 'a' }), false)
  expect(r.place).toBe('navigate')
  expect(r.show?.key).toBe('b')
  expect([r.moved, r.resetScroll, r.closeFeed, r.refreshRefs, r.clearSelection]).toEqual([true, true, true, true, true])
  expect(r.others).toEqual([])
})

test('opening the shown page again keeps the scroll', () => {
  const r = route(out({ page: pg('a', [1]) }), { type: 'page.open', name: 'a' }, view({ page: 'a' }), false)
  expect(r.place).toBe('page')
  expect([r.moved, r.resetScroll]).toEqual([false, false])
})

test('an edit in a loaded day goes to that day', () => {
  const r = route(out({ page: pg('d', [1]) }), { type: 'block.setText', id: 1, text: 'x' }, view({ days: new Set(['d']) }), false)
  expect(r.place).toBe('day')
  expect(r.days.map((p) => p.key)).toEqual(['d'])
  expect(r.others).toEqual([])
  expect(r.shown).toBe(true)
})

test('an edit in the references patches its group and keeps the focused block', () => {
  const r = route(out({ page: pg('g', [7]), focus: { id: 7, at: 0 } }), { type: 'block.split', id: 6, at: 1 }, view({ page: 'a', groups: new Set(['g']) }), false)
  expect(r.place).toBe('none')
  expect(r.patch.map((p) => p.key)).toEqual(['g'])
  expect(r.madeInRefs).toBe(7)
  expect(r.refreshRefs).toBe(true)
  expect(r.shown).toBe(true)
})

test('references for the shown page wait while the editor is in them', () => {
  const refs = { key: 'a', count: 0, groups: [] }
  const held = route(out({ answer: { kind: 'refs', value: refs } }), { type: 'page.refs', key: 'a' }, view({ page: 'a', editingInRefs: true }), false)
  expect([held.applyRefs, held.refreshRefs]).toEqual([false, true])
  const now = route(out({ answer: { kind: 'refs', value: refs } }), { type: 'page.refs', key: 'a' }, view({ page: 'a' }), false)
  expect([now.applyRefs, now.refreshRefs]).toEqual([true, false])
})

test("a rename's changed pages update the loaded days", () => {
  const r = route(out({ changed: [pg('d', [1]), pg('x', [2])] }), { type: 'page.rename', key: 'a', name: 'B' }, view({ days: new Set(['d']) }), false)
  expect(r.days.map((p) => p.key)).toEqual(['d'])
})

test('Shift-click extends within one feed day or within the page outline', () => {
  const feed: Feed = { today: 'd1', days: [{ key: 'd1', title: '' }, { key: 'd2', title: '' }], loaded: { d1: pg('d1', [1, 2]), d2: pg('d2', [3]) } }
  expect(extendsTo(feed, null, 1, 2)).toBe(true)
  expect(extendsTo(feed, null, 1, 3)).toBe(false)
  expect(extendsTo(feed, null, null, 2)).toBe(false)
  expect(extendsTo(null, pg('p', [1, 2]), 1, 2)).toBe(true)
  expect(extendsTo(null, pg('p', [1, 2]), 1, 9)).toBe(false)
  expect(selectionPageOf(feed, null, 3)?.key).toBe('d2')
  expect(selectionPageOf(feed, null, null)).toBeNull()
  expect(selectionPageOf(null, pg('p', [1]), null)?.key).toBe('p')
})

test('a feed answer that leaves the page drops its reference groups too', () => {
  const r = route(out({ ...feedAnswer, changed: [pg('g', [1])] }), { type: 'journal.feed' }, view({ page: 'a', groups: new Set(['g']), editingInRefs: true }), true)
  expect(r.leavePage).toBe(true)
  expect(r.patch).toEqual([])
  expect(r.refreshRefs).toBe(false)
})

test('an edit in the open card patches it and reloads nothing yet', () => {
  const r = route(out({ page: pg('p', [5]) }), { type: 'block.setText', id: 5, text: 'x' }, view({ main: 'board', card: 'p' }), false)
  expect(r.place).toBe('none')
  expect(r.cardPages.map((p) => p.key)).toEqual(['p'])
  expect(r.others).toEqual([])
  expect(r.shown).toBe(true)
  expect(r.refreshBoard).toBe(true) // held by Boards while the card is open
})
test('a state change on the board reloads it; a navigation leaves it', () => {
  const set = route(out({ page: pg('p', [5]) }), { type: 'blocks.setState', ids: [5], keyword: 'DONE' }, view({ main: 'board' }), false)
  expect([set.refreshBoard, set.leave, set.shown]).toEqual([true, false, false])
  // The board takes its own outputs, so they do not load it a second time as pages changed elsewhere.
  expect(set.others).toEqual([])
  const nav = route(out({ page: pg('p', [5]) }), { type: 'page.open', name: 'p' }, view({ main: 'board' }), false)
  expect([nav.place, nav.leave]).toEqual(['navigate', true])
  const feed = route(out(feedAnswer), { type: 'journal.feed' }, view({ main: 'board' }), true)
  expect(feed.leave).toBe(true)
})
test('journal.append on a board opens the new card', () => {
  const r = route(out({ page: pg('d', [9]), focus: { id: 9, at: 4 } }), { type: 'journal.append', text: 'TODO' }, view({ main: 'board' }), false)
  expect(r.openAdded).toBe(true)
  const off = route(out({ page: pg('d', [9]), focus: { id: 9, at: 4 } }), { type: 'journal.append', text: 'TODO' }, view({ page: 'x' }), false)
  expect(off.openAdded).toBe(false)
})
test('archiving reloads the board through its changed pages', () => {
  const r = route(out({ changed: [pg('p', [1])] }), { type: 'board.archive', keyword: 'DONE' }, view({ main: 'board' }), false)
  expect(r.refreshBoard).toBe(true)
})

test('a rename from the tree while the table is shown stays and reloads it', () => {
  const r = route(out({ page: pg('b', [1]), changed: [pg('c', [2])] }), { type: 'page.rename', key: 'a', name: 'B' }, view({ main: 'allPages' }), false)
  expect([r.place, r.leave, r.refreshAllPages]).toEqual(['none', false, true])
  expect(r.others).toEqual([])
})
test('opening a page or the feed leaves the table', () => {
  const r = route(out({ page: pg('b', [1]) }), { type: 'page.show', key: 'b' }, view({ main: 'allPages' }), false)
  expect([r.place, r.leave, r.refreshAllPages]).toEqual(['navigate', true, false])
  const f = route(out(feedAnswer), { type: 'journal.feed' }, view({ main: 'allPages' }), true)
  expect(f.leave).toBe(true)
})
test('a pages.table answer alone does not reload the table', () => {
  const r = route(out({ answer: { kind: 'table', value: [] } }), { type: 'pages.table' }, view({ main: 'allPages' }), false)
  expect(r.refreshAllPages).toBe(false)
})
test('cardPages is empty for a changed page that holds no card', () => {
  const r = route(out({ changed: [pg('y', [2])] }), { type: 'blocks.delete', ids: [2] }, view({ main: 'board', card: 'x' }), false)
  expect(r.cardPages).toEqual([])
})
test('a removed group reloads the references', () => {
  const r = route(out({ removed: ['g'] }), { type: 'page.delete', key: 'g' }, view({ page: 'a', groups: new Set(['g']) }), false)
  expect(r.refreshRefs).toBe(true)
})
test('refs and a changed group in one output: both apply', () => {
  const refs = { key: 'a', count: 1, groups: [] }
  const r = route(out({ answer: { kind: 'refs', value: refs }, changed: [pg('g', [3])] }), { type: 'page.rename', key: 'x', name: 'Y' }, view({ page: 'a', groups: new Set(['g']) }), false)
  expect(r.applyRefs).toBe(true)
  expect(r.patch.map((p) => p.key)).toEqual(['g'])
  expect(r.refreshRefs).toBe(true)
})
test('a journal.append answered off the board names its bare block', () => {
  const day: PageView = { ...pg('d', [5]), blocks: [{ ...pg('d', [5]).blocks[0], text: 'TODO' }] }
  const cmd: Command = { type: 'journal.append', text: 'TODO' }
  const off = route(out({ page: day, focus: { id: 5, at: 4 } }), cmd, view({ page: 'p' }), false)
  expect([off.strayAdded, off.openAdded]).toEqual([5, false])
  const typed: PageView = { ...day, blocks: [{ ...day.blocks[0], text: 'TODO call' }] }
  expect(route(out({ page: typed, focus: { id: 5, at: 4 } }), cmd, view({ page: 'p' }), false).strayAdded).toBeNull()
  const on = route(out({ page: day, focus: { id: 5, at: 4 } }), cmd, view({ main: 'board' }), false)
  expect([on.strayAdded, on.openAdded]).toEqual([null, true])
})
test('the editor does not open on a stray added block, and one with a child stays', () => {
  const day: PageView = { ...pg('d', [5, 6]), blocks: [{ ...pg('d', [5]).blocks[0], text: 'TODO' }, { ...pg('d', [6]).blocks[0], depth: 1 }] }
  const cmd: Command = { type: 'journal.append', text: 'TODO' }
  const bare: PageView = { ...day, blocks: [day.blocks[0]] }
  expect(route(out({ page: bare, focus: { id: 5, at: 4 } }), cmd, view({ page: 'd' }), false).dropFocus).toBe(true)
  const kept = route(out({ page: day, focus: { id: 5, at: 4 } }), cmd, view({ page: 'd' }), false)
  expect([kept.strayAdded, kept.dropFocus]).toEqual([null, false])
})

test('Settings leaves like the table: on a page shown by navigation or a feed', () => {
  const r = route(out({ page: pg('b', [1]) }), { type: 'page.show', key: 'b' }, view({ main: 'settings' }), false)
  expect(r.leave).toBe(true)
  const f = route(out(feedAnswer), { type: 'journal.feed' }, view({ main: 'settings' }), true)
  expect(f.leave).toBe(true)
})
test('Settings stays for an answer without a page', () => {
  const r = route(out({ changed: [pg('c', [2])] }), { type: 'blocks.delete', ids: [2] }, view({ main: 'settings' }), false)
  expect([r.place, r.leave]).toEqual(['none', false])
  expect(route(out({}), { type: 'config.get' }, view({ main: 'settings' }), false).leave).toBe(false)
})
test('Settings stays for the answer to text sent when it opened (the edited block left for Settings)', () => {
  const r = route(out({ page: pg('d', [1]), focus: null }), { type: 'block.setText', id: 1, text: 'x' }, view({ main: 'settings' }), false)
  expect([r.place, r.leave, r.show]).toEqual(['none', false, null])
})
test('leave is false while Settings is not shown', () => {
  const r = route(out({ page: pg('b', [1]) }), { type: 'page.show', key: 'b' }, view({}), false)
  expect(r.leave).toBe(false)
})

test('a navigation leaves the graph; other answers keep it', () => {
  const r = route(out({ page: pg('b', [1]) }), { type: 'page.open', name: 'b' }, view({ main: 'graph' }), false)
  expect(r.leave).toBe(true)
  const t = route(out({ page: pg('d', [1]), focus: null }), { type: 'block.setText', id: 1, text: 'x' }, view({ main: 'graph' }), false)
  expect([t.place, t.leave, t.show]).toEqual(['none', false, null])
  const f = route(out(feedAnswer), { type: 'journal.feed' }, view({ main: 'graph' }), true)
  expect(f.leave).toBe(true)
  expect(route(out({ page: pg('b', [1]) }), { type: 'page.open', name: 'b' }, view({}), false).leave).toBe(false)
})

test('a navigation leaves the Archive view; other answers keep it', () => {
  const r = route(out({ page: pg('b', [1]) }), { type: 'page.show', key: 'b' }, view({ main: 'archive' }), false)
  expect([r.leave, r.place]).toEqual([true, 'navigate'])
  const t = route(out({ changed: [pg('d', [1])] }), { type: 'archive.auto', editing: null }, view({ main: 'archive' }), false)
  expect([t.place, t.leave, t.show]).toEqual(['none', false, null])
  const f = route(out(feedAnswer), { type: 'journal.feed' }, view({ main: 'archive' }), true)
  expect(f.leave).toBe(true)
  expect(route(out({ page: pg('b', [1]) }), { type: 'page.open', name: 'b' }, view({}), false).leave).toBe(false)
})

test('a navigation leaves the Dailies view; other answers keep it', () => {
  const r = route(out({ page: pg('b', [1]) }), { type: 'page.show', key: 'b' }, view({ main: 'dailies' }), false)
  expect([r.leave, r.place]).toEqual([true, 'navigate'])
  const t = route(out({ page: pg('d', [1]), focus: null }), { type: 'block.setText', id: 1, text: 'x' }, view({ main: 'dailies' }), false)
  expect([t.place, t.leave, t.show]).toEqual(['none', false, null])
  const a = route(out({ changed: [pg('d', [1])] }), { type: 'archive.auto', editing: null }, view({ main: 'dailies' }), false)
  expect([a.place, a.leave]).toEqual(['none', false])
  const f = route(out(feedAnswer), { type: 'journal.feed' }, view({ main: 'dailies' }), true)
  expect(f.leave).toBe(true)
  expect(route(out({ page: pg('b', [1]) }), { type: 'page.open', name: 'b' }, view({}), false).leave).toBe(false)
})

test('a navigation leaves the Git history; other answers keep it', () => {
  const r = route(out({ page: pg('b', [1]) }), { type: 'page.open', name: 'b' }, view({ main: 'gitLog' }), false)
  expect(r.leave).toBe(true)
  const t = route(out({ page: pg('d', [1]), focus: null }), { type: 'block.setText', id: 1, text: 'x' }, view({ main: 'gitLog' }), false)
  expect([t.place, t.leave, t.show]).toEqual(['none', false, null])
  const f = route(out(feedAnswer), { type: 'journal.feed' }, view({ main: 'gitLog' }), true)
  expect(f.leave).toBe(true)
  expect(route(out({ page: pg('b', [1]) }), { type: 'page.open', name: 'b' }, view({}), false).leave).toBe(false)
})

test('leave is one flag for every screen and the board', () => {
  const kinds: MainKind[] = ['board', 'allPages', 'settings', 'graph', 'gitLog', 'archive', 'dailies']
  for (const main of kinds) {
    const nav = route(out({ page: pg('b', [1]) }), { type: 'page.open', name: 'b' }, view({ main }), false)
    expect([main, nav.leave]).toEqual([main, true])
    const f = route(out(feedAnswer), { type: 'journal.feed' }, view({ main }), true)
    expect([main, f.leave]).toEqual([main, true])
    const edit = route(out({ page: pg('d', [1]), focus: null }), { type: 'block.setText', id: 1, text: 'x' }, view({ main }), false)
    expect([main, edit.leave]).toEqual([main, false])
  }
  for (const main of ['none', 'page', 'feed', 'newPage'] as MainKind[]) {
    const nav = route(out({ page: pg('b', [1]) }), { type: 'page.open', name: 'b' }, view({ main }), false)
    expect([main, nav.leave]).toEqual([main, false])
  }
})

// What the shell's events would do for a change made outside the window, done from the answer.
const setText = (id: number): Command => ({ type: 'block.setText', id, text: 'x' })
const rename = (key: string): Command => ({ type: 'page.rename', key, name: 'B' })
const autoArchive: Command = { type: 'archive.auto', editing: null }

test('a page in the answer refreshes an open search', () => {
  expect(route(out({ page: pg('a', [1]) }), setText(1), view({ page: 'a' }), false).refreshSearch).toBe(true)
  const changed = route(out({ changed: [pg('c', [2])] }), { type: 'blocks.delete', ids: [2] }, view({ page: 'a' }), false)
  expect(changed.refreshSearch).toBe(true)
})
test('a tree in the answer refreshes the names, All pages and the graph', () => {
  const t = out({ tree: tree(2) })
  const table = route(t, { type: 'page.create', name: 'n', folder: '' }, view({ main: 'allPages' }), false)
  expect([table.refreshSearch, table.refreshNames, table.refreshAllPages]).toEqual([true, true, true])
  const graph = route(t, { type: 'dir.create', path: 'x' }, view({ main: 'graph' }), false)
  expect([graph.refreshSearch, graph.refreshNames, graph.refreshGraph]).toEqual([true, true, true])
})
test('a removal in the answer refreshes search and the graph', () => {
  const r = route(out({ removed: ['g'] }), { type: 'page.delete', key: 'g' }, view({ main: 'graph' }), false)
  expect([r.refreshSearch, r.refreshGraph, r.refreshNames]).toEqual([true, true, false])
})
test('every page of the answer goes to the journal', () => {
  const r = route(out({ page: pg('b', [1]), changed: [pg('c', [2]), pg('d', [3])] }), rename('a'), view({ page: 'a' }), false)
  expect(keys(r.journalChanged)).toEqual(['b', 'c', 'd'])
})
test('archive.auto on the shown page puts it in others', () => {
  const r = route(out({ changed: [pg('a', [1]), pg('x', [2])] }), autoArchive, view({ page: 'a' }), false)
  expect(keys(r.others)).toEqual(['a', 'x'])
})
test('archive.auto with the Archive view shown puts its pages in others', () => {
  const r = route(out({ changed: [pg('d', [1])] }), autoArchive, view({ main: 'archive' }), false)
  expect(keys(r.others)).toEqual(['d'])
})
test('a rename that rewrites the shown page puts it in others', () => {
  const r = route(out({ page: pg('b', [1]), changed: [pg('a', [2])] }), rename('x'), view({ page: 'a' }), false)
  expect(r.place).toBe('none')
  expect(keys(r.others)).toEqual(['b', 'a'])
})
test('a page the route applies is not in others', () => {
  const shown = route(out({ page: pg('a', [1]) }), setText(1), view({ page: 'a' }), false)
  expect(shown.others).toEqual([])
  const day = route(out({ changed: [pg('d', [1]), pg('x', [2])] }), rename('a'), view({ days: new Set(['d']) }), false)
  expect(keys(day.others)).toEqual(['x'])
  const group = route(out({ page: pg('g', [7]) }), setText(7), view({ page: 'a', groups: new Set(['g']) }), false)
  expect(group.others).toEqual([])
  const board = route(out({ changed: [pg('p', [1])] }), { type: 'board.archive', keyword: 'DONE' }, view({ main: 'board' }), false)
  expect(board.others).toEqual([])
})
test('a query answer refreshes nothing', () => {
  const search = { query: 'q', text: 'q', filtered: false, date: null, groups: [], more: false }
  const shown = view({ page: 'a', main: 'graph' })
  const found = route(out({ answer: { kind: 'search', value: search } }), { type: 'search.query', text: 'q' }, shown, false)
  const refs = { key: 'a', count: 0, groups: [] }
  const asked = route(out({ answer: { kind: 'refs', value: refs } }), { type: 'page.refs', key: 'a' }, shown, false)
  for (const r of [found, asked]) {
    expect([r.refreshSearch, r.refreshNames, r.refreshGraph, r.refreshAllPages]).toEqual([false, false, false, false])
    expect([r.journalChanged, r.others]).toEqual([[], []])
  }
})
