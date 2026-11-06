import { expect, test } from 'vitest'
import { extendsTo, route, selectionPageOf, type ShownView } from './route'
import type { Feed } from './feed'
import type { Command, Output, PageView } from './types'

const empty: Output = {
  page: null,
  focus: null,
  notices: [],
  folder: null,
  config: null,
  refs: null,
  names: null,
  tree: null,
  changed: [],
  removed: [],
  dirty: null,
  feed: null,
  pages: [],
  board: null, table: null, search: null, renamed: [], git: null, usage: null, usageSkipped: null, graph: null, saved: [],
}

const pg = (key: string, ids: number[]): PageView => ({
  key,
  name: key,
  kind: 'page',
  title: key,
  preambleHtml: '', hasFile: true,
  blocks: ids.map((id) => ({ id, depth: 0, text: '', html: '', state: null, finished: false, hasChildren: false })),
})

const view = (o: Partial<ShownView> = {}): ShownView => ({ page: null, days: null, groups: new Set(), editingInRefs: false, board: false, allPages: false, settings: false, graph: false, gitLog: false, archive: false, card: null, ...o })
const out = (o: Partial<Output>): Output => ({ ...empty, ...o })

test('an applied feed answer is shown and leaves the page', () => {
  const r = route(out({ feed: { today: 'd', days: [] } }), { type: 'journal.feed' }, view({ page: 'p' }), true)
  expect(r.leavePage).toBe(true)
  expect(r.clearSelection).toBe(true)
  expect(r.shown).toBe(true)
})

test('a feed answer that was not applied changes nothing', () => {
  const r = route(out({ feed: { today: 'd', days: [] } }), { type: 'journal.feed' }, view({ page: 'p' }), false)
  expect(r.leavePage).toBe(false)
  expect(r.shown).toBe(false)
})

test('navigating to another page resets the scroll and reloads the references', () => {
  const r = route(out({ page: pg('b', [1]) }), { type: 'page.open', name: 'b' }, view({ page: 'a' }), false)
  expect(r.place).toBe('navigate')
  expect(r.show?.key).toBe('b')
  expect([r.moved, r.resetScroll, r.closeFeed, r.refreshRefs, r.clearSelection]).toEqual([true, true, true, true, true])
  expect(r.own.map((p) => p.key)).toEqual(['b'])
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
  expect(r.own.map((p) => p.key)).toEqual(['d'])
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
  const held = route(out({ refs }), { type: 'page.refs', key: 'a' }, view({ page: 'a', editingInRefs: true }), false)
  expect([held.applyRefs, held.refreshRefs]).toEqual([false, true])
  const now = route(out({ refs }), { type: 'page.refs', key: 'a' }, view({ page: 'a' }), false)
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
  const r = route(out({ feed: { today: 'd', days: [] }, changed: [pg('g', [1])] }), { type: 'journal.feed' }, view({ page: 'a', groups: new Set(['g']), editingInRefs: true }), true)
  expect(r.leavePage).toBe(true)
  expect(r.patch).toEqual([])
  expect(r.refreshRefs).toBe(false)
})

test('an edit in the open card patches it and reloads nothing yet', () => {
  const r = route(out({ page: pg('p', [5]) }), { type: 'block.setText', id: 5, text: 'x' }, view({ board: true, card: 'p' }), false)
  expect(r.place).toBe('none')
  expect(r.cardPages.map((p) => p.key)).toEqual(['p'])
  expect(r.own.map((p) => p.key)).toEqual(['p'])
  expect(r.shown).toBe(true)
  expect(r.refreshBoard).toBe(true) // held by Boards while the card is open
})
test('a state change on the board reloads it; a navigation leaves it', () => {
  const set = route(out({ page: pg('p', [5]) }), { type: 'blocks.setState', ids: [5], keyword: 'DONE' }, view({ board: true }), false)
  expect([set.refreshBoard, set.leaveBoard, set.shown]).toEqual([true, false, false])
  // The board's own outputs are echoes, so their page:changed does not load the board a second time.
  expect(set.own.map((p) => p.key)).toEqual(['p'])
  const nav = route(out({ page: pg('p', [5]) }), { type: 'page.open', name: 'p' }, view({ board: true }), false)
  expect([nav.place, nav.leaveBoard]).toEqual(['navigate', true])
  const feed = route(out({ feed: { today: 'd', days: [] } }), { type: 'journal.feed' }, view({ board: true }), true)
  expect(feed.leaveBoard).toBe(true)
})
test('journal.append on a board opens the new card', () => {
  const r = route(out({ page: pg('d', [9]), focus: { id: 9, at: 4 } }), { type: 'journal.append', text: 'TODO' }, view({ board: true }), false)
  expect(r.openAdded).toBe(true)
  const off = route(out({ page: pg('d', [9]), focus: { id: 9, at: 4 } }), { type: 'journal.append', text: 'TODO' }, view({ page: 'x' }), false)
  expect(off.openAdded).toBe(false)
})
test('archiving reloads the board through its changed pages', () => {
  const r = route(out({ changed: [pg('p', [1])] }), { type: 'board.archive', keyword: 'DONE' }, view({ board: true }), false)
  expect(r.refreshBoard).toBe(true)
})

test('a rename from the tree while the table is shown stays and reloads it', () => {
  const r = route(out({ page: pg('b', [1]), changed: [pg('c', [2])] }), { type: 'page.rename', key: 'a', name: 'B' }, view({ allPages: true }), false)
  expect([r.place, r.leaveAllPages, r.refreshAllPages]).toEqual(['none', false, true])
  expect(r.own.map((p) => p.key)).toEqual(['b', 'c'])
})
test('opening a page or the feed leaves the table', () => {
  const r = route(out({ page: pg('b', [1]) }), { type: 'page.show', key: 'b' }, view({ allPages: true }), false)
  expect([r.place, r.leaveAllPages, r.refreshAllPages]).toEqual(['navigate', true, false])
  const f = route(out({ feed: { today: 'd', days: [] } }), { type: 'journal.feed' }, view({ allPages: true }), true)
  expect(f.leaveAllPages).toBe(true)
})
test('a pages.table answer alone does not reload the table', () => {
  const r = route(out({ table: [] }), { type: 'pages.table' }, view({ allPages: true }), false)
  expect(r.refreshAllPages).toBe(false)
})
test('cardPages is empty for a changed page that holds no card', () => {
  const r = route(out({ changed: [pg('y', [2])] }), { type: 'blocks.delete', ids: [2] }, view({ board: true, card: 'x' }), false)
  expect(r.cardPages).toEqual([])
})
test('a removed group reloads the references', () => {
  const r = route(out({ removed: ['g'] }), { type: 'page.delete', key: 'g' }, view({ page: 'a', groups: new Set(['g']) }), false)
  expect(r.refreshRefs).toBe(true)
})
test('refs and a changed group in one output: both apply', () => {
  const refs = { key: 'a', count: 1, groups: [] }
  const r = route(out({ refs, changed: [pg('g', [3])] }), { type: 'page.rename', key: 'x', name: 'Y' }, view({ page: 'a', groups: new Set(['g']) }), false)
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
  const on = route(out({ page: day, focus: { id: 5, at: 4 } }), cmd, view({ board: true }), false)
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
  const r = route(out({ page: pg('b', [1]) }), { type: 'page.show', key: 'b' }, view({ settings: true }), false)
  expect(r.leaveSettings).toBe(true)
  const f = route(out({ feed: { today: 'd', days: [] } }), { type: 'journal.feed' }, view({ settings: true }), true)
  expect(f.leaveSettings).toBe(true)
})
test('Settings stays for an answer without a page', () => {
  const r = route(out({ changed: [pg('c', [2])] }), { type: 'blocks.delete', ids: [2] }, view({ settings: true }), false)
  expect([r.place, r.leaveSettings]).toEqual(['none', false])
  expect(route(out({}), { type: 'config.get' }, view({ settings: true }), false).leaveSettings).toBe(false)
})
test('Settings stays for the answer to text sent when it opened (the edited block left for Settings)', () => {
  const r = route(out({ page: pg('d', [1]), focus: null }), { type: 'block.setText', id: 1, text: 'x' }, view({ settings: true }), false)
  expect([r.place, r.leaveSettings, r.show]).toEqual(['none', false, null])
})
test('leaveSettings is false while Settings is not shown', () => {
  const r = route(out({ page: pg('b', [1]) }), { type: 'page.show', key: 'b' }, view({}), false)
  expect(r.leaveSettings).toBe(false)
})

test('a navigation leaves the graph; other answers keep it', () => {
  const r = route(out({ page: pg('b', [1]) }), { type: 'page.open', name: 'b' }, view({ graph: true }), false)
  expect(r.leaveGraph).toBe(true)
  const t = route(out({ page: pg('d', [1]), focus: null }), { type: 'block.setText', id: 1, text: 'x' }, view({ graph: true }), false)
  expect([t.place, t.leaveGraph, t.show]).toEqual(['none', false, null])
  const f = route(out({ feed: { today: 'd', days: [] } }), { type: 'journal.feed' }, view({ graph: true }), true)
  expect(f.leaveGraph).toBe(true)
  expect(route(out({ page: pg('b', [1]) }), { type: 'page.open', name: 'b' }, view({}), false).leaveGraph).toBe(false)
})

test('a navigation leaves the Archive view; other answers keep it', () => {
  const r = route(out({ page: pg('b', [1]) }), { type: 'page.show', key: 'b' }, view({ archive: true }), false)
  expect([r.leaveArchive, r.place]).toEqual([true, 'navigate'])
  const t = route(out({ changed: [pg('d', [1])] }), { type: 'archive.auto', editing: null }, view({ archive: true }), false)
  expect([t.place, t.leaveArchive, t.show]).toEqual(['none', false, null])
  const f = route(out({ feed: { today: 'd', days: [] } }), { type: 'journal.feed' }, view({ archive: true }), true)
  expect(f.leaveArchive).toBe(true)
  expect(route(out({ page: pg('b', [1]) }), { type: 'page.open', name: 'b' }, view({}), false).leaveArchive).toBe(false)
})

test('a navigation leaves the Git history; other answers keep it', () => {
  const r = route(out({ page: pg('b', [1]) }), { type: 'page.open', name: 'b' }, view({ gitLog: true }), false)
  expect(r.leaveGitLog).toBe(true)
  const t = route(out({ page: pg('d', [1]), focus: null }), { type: 'block.setText', id: 1, text: 'x' }, view({ gitLog: true }), false)
  expect([t.place, t.leaveGitLog, t.show]).toEqual(['none', false, null])
  const f = route(out({ feed: { today: 'd', days: [] } }), { type: 'journal.feed' }, view({ gitLog: true }), true)
  expect(f.leaveGitLog).toBe(true)
  expect(route(out({ page: pg('b', [1]) }), { type: 'page.open', name: 'b' }, view({}), false).leaveGitLog).toBe(false)
})
