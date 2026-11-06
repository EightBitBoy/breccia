import { expect, test } from 'vitest'
import { cardOf } from './board'
import { Boards } from './boards.svelte'
import { refBlocks } from './refs'
import type { BlockView, BoardView, Command, Notice, Output, PageView } from './types'

const empty: Output = {
  page: null, focus: null, notices: [], folder: null, config: null, refs: null, names: null, tree: null,
  changed: [], removed: [], dirty: null, feed: null, pages: [], board: null, table: null, search: null, renamed: [], git: null, usage: null, usageSkipped: null, graph: null, saved: [],
}
const blk = (id: number, text: string, depth: number, state: string | null = null): BlockView => ({
  id, depth, text, html: text, state, finished: false, hasChildren: false,
})
const pg = (key: string, blocks: BlockView[]): PageView => ({
  key, name: key, kind: 'page', title: key, preambleHtml: '', hasFile: true, blocks,
})
const bv = (index: number): BoardView => ({ index, name: `B${index}`, columns: [], unknown: [] })
const tick = () => new Promise((r) => setTimeout(r, 0))

function setup(
  fail: (cmd: Command) => boolean = () => false,
  flush: (b: Boards) => Promise<void> = async () => {},
  code = 'internal',
) {
  const sent: Command[] = []
  const notices: Notice[] = []
  let home = 0
  const b: Boards = new Boards({
    run: async (cmd) => {
      sent.push(cmd)
      if (fail(cmd)) throw { code, message: 'boom' }
      return cmd.type === 'board.get' ? { ...empty, board: bv(cmd.index) } : empty
    },
    notify: (n) => notices.push(n),
    flush: () => flush(b),
    home: () => void home++,
  })
  return { b, sent, notices, homes: () => home }
}
const gets = (sent: Command[]) => sent.filter((c) => c.type === 'board.get')

test('open runs board.get and shows only the shown board', async () => {
  const { b, sent } = setup()
  await b.open(0)
  expect(sent).toEqual([{ type: 'board.get', index: 0 }])
  b.applyBoard(bv(1))
  expect(b.view).toBeNull()
  b.applyBoard(bv(0))
  expect(b.view?.index).toBe(0)
})
test('a failed board.get is shown', async () => {
  const { b, notices } = setup(() => true)
  await b.open(0)
  expect(notices).toEqual([{ kind: 'refused', message: 'boom' }])
})
test('the board does not reload while a card is open', async () => {
  const { b, sent } = setup()
  await b.open(0)
  b.openCard(cardOf(pg('p', [blk(5, 'TODO x', 0, 'TODO')]), 5)!, 'TODO')
  b.refresh()
  await tick()
  expect(gets(sent)).toHaveLength(1)
  b.closeCard()
  await tick()
  expect(gets(sent)).toHaveLength(2)
  expect(b.card).toBeNull()
})
test('an added card left as its keyword is deleted on close; a typed one is not', async () => {
  const { b, sent } = setup()
  await b.open(0)
  b.openCard(cardOf(pg('d', [blk(5, 'TODO', 0, 'TODO')]), 5)!, 'TODO', 'TODO')
  b.closeCard('TODO ')
  await tick()
  expect(sent).toContainEqual({ type: 'blocks.delete', ids: [5] })
  sent.length = 0
  b.openCard(cardOf(pg('d', [blk(6, 'TODO', 0, 'TODO')]), 6)!, 'TODO', 'TODO')
  b.closeCard('TODO Buy') // typed, not yet answered: the core text is still bare
  await tick()
  expect(sent.some((c) => c.type === 'blocks.delete')).toBe(false)
})
test('closing without text waits for the flush, so typed text is never deleted', async () => {
  const { b, sent } = setup(undefined, async (bb) => {
    await tick()
    bb.patchCard(pg('d', [blk(5, 'TODO Buy', 0, 'TODO')]), null)
  })
  await b.open(0)
  b.openCard(cardOf(pg('d', [blk(5, 'TODO', 0, 'TODO')]), 5)!, 'TODO', 'TODO')
  b.closeCard()
  await tick()
  await tick()
  expect(sent.some((c) => c.type === 'blocks.delete')).toBe(false)
  expect(b.card).toBeNull()
})
test('an added card with a description is not deleted', async () => {
  const { b, sent } = setup()
  await b.open(0)
  b.openCard(cardOf(pg('d', [blk(5, 'TODO', 0, 'TODO'), blk(6, 'note', 1)]), 5)!, 'TODO', 'TODO')
  b.closeCard('TODO')
  await tick()
  expect(sent.some((c) => c.type === 'blocks.delete')).toBe(false)
})
test('a card opened while closing waits for the flush is left alone', async () => {
  const { b, sent } = setup(undefined, async (bb) => {
    await tick()
    bb.openCard(cardOf(pg('e', [blk(7, 'TODO', 0, 'TODO')]), 7)!, 'TODO', 'TODO')
  })
  await b.open(0)
  b.openCard(cardOf(pg('d', [blk(5, 'TODO x', 0, 'TODO')]), 5)!, 'TODO')
  b.closeCard()
  await tick()
  await tick()
  expect(b.card?.key).toBe('e')
  expect(sent.some((c) => c.type === 'blocks.delete')).toBe(false)
})
test('the open card follows its page and closes when its block is gone', async () => {
  const { b, sent } = setup()
  await b.open(0)
  b.openCard(cardOf(pg('p', [blk(5, 'TODO x', 0, 'TODO')]), 5)!, 'TODO')
  expect(b.patchCard(pg('p', [blk(5, 'TODO x', 0, 'TODO'), blk(8, 'new', 0)]), 8)).toBe(true)
  expect(refBlocks(b.card!, new Set()).map((x) => x.id)).toEqual([5, 8])
  expect(b.patchCard(pg('q', [blk(1, 'y', 0)]), null)).toBe(false)
  expect(b.patchCard(pg('p', [blk(9, 'other', 0)]), null)).toBe(true)
  expect(b.card).toBeNull()
  await tick()
  expect(sent.some((c) => c.type === 'blocks.delete')).toBe(false)
  expect(gets(sent)).toHaveLength(2)
})
test('an added card whose block is gone sends no delete', async () => {
  const { b, sent } = setup()
  await b.open(0)
  b.openCard(cardOf(pg('d', [blk(5, 'TODO', 0, 'TODO')]), 5)!, 'TODO', 'TODO')
  expect(b.patchCard(pg('d', [blk(9, 'other', 0)]), null)).toBe(true)
  await tick()
  expect(b.card).toBeNull()
  expect(sent.some((c) => c.type === 'blocks.delete')).toBe(false)
  b.openCard(cardOf(pg('d', [blk(6, 'TODO', 0, 'TODO')]), 6)!, 'TODO', 'TODO')
  b.removed(['d'])
  await tick()
  expect(b.card).toBeNull()
  expect(sent.some((c) => c.type === 'blocks.delete')).toBe(false)
})
test("another view's change reloads the board, or patches the open card", async () => {
  const { b, sent } = setup()
  await b.open(0)
  expect(b.changed(pg('q', [blk(1, 'y', 0)]), true)).toBe(false)
  await tick()
  expect(gets(sent)).toHaveLength(1)
  b.changed(pg('q', [blk(1, 'y', 0)]), false)
  await tick()
  expect(gets(sent)).toHaveLength(2)
  b.openCard(cardOf(pg('p', [blk(5, 'TODO x', 0, 'TODO')]), 5)!, 'TODO')
  expect(b.changed(pg('p', [blk(5, 'TODO x!', 0, 'TODO')]), false)).toBe(true)
  expect(b.card!.groups[0].refs[0].blocks[0].text).toBe('TODO x!')
})
test('close forgets the board and its card', async () => {
  const { b } = setup()
  await b.open(0)
  b.close()
  b.applyBoard(bv(0))
  expect([b.index, b.view, b.card]).toEqual([null, null, null])
})
test('a late board.get from before the last open is not shown, even for the same index', async () => {
  const { b, sent } = setup()
  await b.open(1)
  const old = sent[0]
  await b.open(0)
  await b.open(1) // board 1 may now name another board (one was deleted or moved)
  b.applyBoard({ ...bv(1), name: 'Old' }, old)
  expect(b.view).toBeNull()
  b.applyBoard(bv(1), sent[2])
  expect(b.view?.name).toBe('B1')
})
test('closeCard settles once the card is closed, and a second call joins the first', async () => {
  let release!: () => void
  const { b } = setup(undefined, () => new Promise<void>((r) => (release = r)))
  await b.open(0)
  b.openCard(cardOf(pg('p', [blk(5, 'TODO Buy', 0, 'TODO')]), 5)!, 'TODO')
  let settled = 0
  void b.closeCard().then(() => settled++)
  void b.closeCard().then(() => settled++)
  await tick()
  expect([settled, b.card !== null]).toEqual([0, true])
  release()
  await tick()
  expect([settled, b.card]).toEqual([2, null])
})
test('a board answer that lands while a card is open is not shown; the board asks again on close', async () => {
  const { b, sent } = setup()
  await b.open(0)
  b.applyBoard(bv(0), sent[0])
  b.refresh() // card A closed: its reload is on its way
  await tick()
  b.openCard(cardOf(pg('p', [blk(5, 'TODO x', 0, 'TODO')]), 5)!, 'TODO') // card N opened meanwhile
  b.applyBoard({ ...bv(0), name: 'Late' }, gets(sent)[1])
  expect(b.view?.name).toBe('B0')
  b.closeCard('TODO x')
  await tick()
  expect(gets(sent)).toHaveLength(3)
  b.applyBoard({ ...bv(0), name: 'Late' }, gets(sent)[2])
  expect(b.view?.name).toBe('Late')
})
test('an added card opens; if another card was opened meanwhile, the bare new block is deleted', async () => {
  const { b, sent } = setup()
  await b.open(0)
  expect(b.openAdded(cardOf(pg('d', [blk(5, 'TODO', 0, 'TODO')]), 5)!, 'TODO', 'TODO')).toBe(true)
  expect(b.card?.groups[0].refs[0].blocks[0].id).toBe(5)
  b.closeCard('TODO')
  await tick()
  sent.length = 0
  b.openCard(cardOf(pg('p', [blk(7, 'DOING y', 0, 'DOING')]), 7)!, 'DOING')
  expect(b.openAdded(cardOf(pg('d', [blk(6, 'TODO', 0, 'TODO')]), 6)!, 'TODO', 'TODO')).toBe(false)
  await tick()
  expect(b.card?.groups[0].refs[0].blocks[0].id).toBe(7)
  expect(sent).toContainEqual({ type: 'blocks.delete', ids: [6] })
})
test('closing a bare added card settles once its delete is answered, so leaving the board waits for it', async () => {
  let answer!: () => void
  const sent: Command[] = []
  const b = new Boards({
    run: (cmd) => {
      sent.push(cmd)
      if (cmd.type !== 'blocks.delete') return Promise.resolve(empty)
      return new Promise<Output>((r) => (answer = () => r(empty)))
    },
    notify: () => {},
    flush: async () => {},
    home: () => {},
  })
  await b.open(0)
  b.openCard(cardOf(pg('d', [blk(5, 'TODO', 0, 'TODO')]), 5)!, 'TODO', 'TODO')
  let settled = false
  void b.closeCard('TODO').then(() => (settled = true))
  await tick()
  expect(sent).toContainEqual({ type: 'blocks.delete', ids: [5] })
  expect(settled).toBe(false)
  answer()
  await tick()
  expect(settled).toBe(true)
})
test('a board that no longer exists goes to the journal', async () => {
  const { b, notices, homes } = setup(() => true, undefined, 'unknownBoard')
  await b.open(3)
  expect(b.index).toBeNull()
  expect(homes()).toBe(1)
  expect(notices.length).toBe(1)
})
test('another failure keeps the board open', async () => {
  const { b, homes } = setup(() => true)
  await b.open(0)
  expect([b.index, homes()]).toEqual([0, 0])
})
test('"show more" stays pressed for the session', async () => {
  const { b } = setup()
  await b.open(0)
  b.expand(3)
  b.close()
  await b.open(1)
  expect(b.expanded.has(3)).toBe(true)
})
test('a new notes folder forgets the pressed "show more" (block ids may be reused)', async () => {
  const { b } = setup()
  await b.open(0)
  b.expand(3)
  b.newFolder()
  expect(b.expanded.size).toBe(0)
})
