import { EditorSelection, EditorState } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { beforeEach, expect, test } from 'vitest'
import { createClient, type Client } from '../lib/api'
import { patchRefs, refBlocks } from '../lib/refs'
import type { BlockView, Command, Notice, Output, PageView, RefsView } from '../lib/types'
import type { EditorHooks, mountEditor } from './blockEditor'
import { EditorHost } from './host.svelte'
import type { MenuView } from './menu'

function block(id: number, text: string): BlockView {
  return { id, depth: 0, text, html: '', state: null, finished: false, hasChildren: false }
}

let blocks: BlockView[]
let sent: Command[]
let notices: Notice[]
/** The texts sent with `setTextDebounced`. */
let typed: { id: number; text: string }[]
/** The hooks of the last mounted editor. */
let hooks: EditorHooks
let host: EditorHost
/** The caret menus drawn (or hidden with null), in order. */
let shown: [string, MenuView | null][]
/** What `order` returns for the focus walk; undefined = every block. */
let order: ((id: number) => BlockView[]) | undefined
/** The page names the mock answers `pages.list` with; a test sets them. */
let linkNames: { key: string; name: string; exists: boolean }[]

/** An in-memory editor: the text and a caret, no selection. */
const mount: typeof mountEditor = (_parent, text, cursor16, h, opts = {}) => {
  hooks = h
  let t = text
  let c = Math.min(cursor16, text.length)
  return {
    destroy() {},
    text: () => t,
    setText(next, at) {
      t = next
      c = Math.max(0, Math.min(at, next.length))
    },
    insert(s) {
      t = t.slice(0, c) + s + t.slice(c)
      c += s.length
      h.onChange(t)
    },
    cursor16: () => c,
    selection: () => ({ from: c, to: c }),
    deleteChar() {},
    setEditable() {},
    focus() {},
    // A view holding the text now, with the editor's extensions (the caret menus).
    run(f) {
      const state = EditorState.create({ doc: t, selection: EditorSelection.cursor(c), extensions: opts.extensions ?? [] })
      f({ state, requestMeasure() {} } as unknown as EditorView)
    },
  }
}

/** Commands are recorded and never answered: the test applies outputs itself. */
const client: Client = {
  run(cmd) {
    sent.push(cmd)
    // Link completion asks for the page names; everything else is answered by the test.
    if (cmd.type === 'pages.list') return Promise.resolve({ ...out(pageOf('p', [])), names: linkNames })
    return new Promise<Output>(() => {})
  },
  setTextDebounced(id, text) {
    typed.push({ id, text })
  },
  flush: () => Promise.resolve(),
  cancel() {},
  setGeneration() {},
}

function pageOf(key: string, bs: BlockView[]): PageView {
  return { key, name: key, kind: 'page', title: key, preambleHtml: '', hasFile: true, blocks: bs }
}

beforeEach(() => {
  linkNames = []
  blocks = [block(1, 'alpha'), block(2, 'beta')]
  sent = []
  notices = []
  shown = []
  order = undefined
  typed = []
  host = new EditorHost(
    {
      client,
      blocks: () => blocks,
      order: (id) => (order ? order(id) : blocks),
      pageOf: () => 'p',
      states: () => [],
      notify: (n) => notices.push(n),
      showMenu: (which, m) => void shown.push([which, m]),
      selectWithNeighbour() {},
      mount,
      slot: () => ({}) as HTMLElement,
    },
    new Set(),
  )
})

test('a split answer for a page that is not shown still ends the split', async () => {
  await host.edit(1, 2)
  hooks.onAction('split', { cursor16: 2 })
  const split = sent.find((c) => c.type === 'block.split')
  expect(split).toEqual({ type: 'block.split', id: 1, at: 2 })
  const out: Output = {
    page: pageOf('other', [block(7, 'x')]),
    focus: { id: 7, at: 0 },
    notices: [],
    folder: null,
    config: null,
    refs: null, names: null, tree: null, changed: [], removed: [], dirty: null, feed: null, pages: [], board: null, table: null, search: null, renamed: [], git: null, usage: null, usageSkipped: null, graph: null, saved: [],
  }
  host.apply(split, out, false)
  hooks.onAction('split', { cursor16: 2 })
  expect(sent.filter((c) => c.type === 'block.split')).toHaveLength(2)
})

test('an outline paste while locked tells the user', async () => {
  await host.edit(1, 0)
  void host.exec({ type: 'block.merge', id: 1 })
  hooks.onOutlinePaste!('- a')
  expect(notices).toEqual([
    { kind: 'refused', message: 'Paste skipped while a change is being saved; the text is still on the clipboard.' },
  ])
  expect(sent.map((c) => c.type)).toEqual(['block.merge'])
})

test('while a split runs, the caret floor is the split caret', async () => {
  await host.edit(1, 3)
  expect(hooks.caretFloor?.()).toBeNull()
  hooks.onAction('split', { cursor16: 3 })
  expect(hooks.caretFloor?.()).toBe(3)
})

test('a text output focusing a block that is not shown ends editing', async () => {
  // A merge of a reference's root into a block above it: the focus is outside the references.
  await host.edit(1, 0)
  const merge: Command = { type: 'block.merge', id: 1 }
  void host.exec(merge)
  blocks = [block(2, 'beta')]
  const out: Output = {
    page: pageOf('j', [block(9, 'gammaalpha'), block(2, 'beta')]),
    focus: { id: 9, at: 5 },
    notices: [],
    folder: null,
    config: null,
    refs: null, names: null, tree: null, changed: [], removed: [], dirty: null, feed: null, pages: [], board: null, table: null, search: null, renamed: [], git: null, usage: null, usageSkipped: null, graph: null, saved: [],
  }
  host.apply(merge, out, true)
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 0))
  expect(host.editingId).toBeNull()
  expect(host.editor).toBeNull()
})

test('a split whose new block is not shown sends the typed text there and trims the editor', async () => {
  // Enter in a reference root without children: the new block is a sibling outside the reference.
  await host.edit(1, 2)
  hooks.onAction('split', { cursor16: 2 })
  const split = sent.find((c) => c.type === 'block.split')!
  typed = []
  // Typed while the split runs, at the split caret.
  host.editor!.ed.insert('X')
  const out: Output = {
    page: pageOf('j', [block(1, 'al'), block(8, 'pha')]),
    focus: { id: 8, at: 0 },
    notices: [],
    folder: null,
    config: null,
    refs: null, names: null, tree: null, changed: [], removed: [], dirty: null, feed: null, pages: [], board: null, table: null, search: null, renamed: [], git: null, usage: null, usageSkipped: null, graph: null, saved: [],
  }
  blocks = [block(1, 'al'), block(2, 'beta')]
  host.apply(split, out, true)
  await new Promise((r) => setTimeout(r, 0))
  expect(typed).toEqual([{ id: 8, text: 'Xpha' }])
  expect(host.editingId).toBe(1)
  expect(host.editor!.ed.text()).toBe('al')
  expect(host.editor!.ed.cursor16()).toBe(2)
})

test('Enter at the end of a reference root moves into the new block shown after it', async () => {
  const refs: RefsView = {
    key: 'a',
    count: 1,
    groups: [{ page: 'j', title: 'J', kind: 'journal', refs: [{ crumbs: [], blocks: [block(1, 'see [[a]]')] }] }],
  }
  const kept = new Set<number>()
  blocks = refBlocks(refs, new Set())
  await host.edit(1, 9)
  hooks.onAction('split', { cursor16: 9 })
  const split = sent.find((c) => c.type === 'block.split')!
  typed = []
  host.editor!.ed.insert('x') // typed while the split runs
  const out: Output = {
    page: pageOf('j', [block(0, 'top'), { ...block(1, 'see [[a]]'), depth: 1 }, { ...block(8, ''), depth: 1 }]),
    focus: { id: 8, at: 0 },
    notices: [],
    folder: null,
    config: null,
    refs: null, names: null, tree: null, changed: [], removed: [], dirty: null, feed: null, pages: [], board: null, table: null, search: null, renamed: [], git: null, usage: null, usageSkipped: null, graph: null, saved: [],
  }
  // What App does with an output about a group page.
  kept.add(8)
  blocks = refBlocks(patchRefs(refs, out.page!, kept), new Set())
  host.apply(split, out, true)
  await new Promise((r) => setTimeout(r, 0))
  expect(blocks.map((b) => b.id)).toEqual([1, 8])
  expect(host.editingId).toBe(8)
  expect(typed).toEqual([{ id: 8, text: 'x' }])
  expect(host.editor!.ed.text()).toBe('x')
})

function out(page: PageView | null): Output {
  return {
    page,
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
}

const settle = () => new Promise((r) => setTimeout(r, 0))

test('a refresh that changed the edited block keeps the typing and shows both versions', async () => {
  await host.edit(1, 5)
  host.editor!.ed.insert('!')
  const get: Command = { type: 'page.get', key: 'p' }
  blocks = [block(1, 'ALPHA'), block(2, 'beta')]
  host.apply(get, out(pageOf('p', blocks)), true, 'alpha')
  await settle()
  expect(host.editingId).toBe(1)
  expect(host.editor!.ed.text()).toBe('alpha!')
  expect(notices).toEqual([
    {
      kind: 'conflict',
      page: 'p',
      block: 1,
      mine: 'alpha!',
      theirs: 'ALPHA',
      message: 'This block changed on disk while you were editing it.',
    },
  ])
})

test('a refresh that changed another block leaves the editor and its caret alone', async () => {
  await host.edit(1, 2)
  host.editor!.ed.insert('x')
  blocks = [block(1, 'alpha'), block(2, 'BETA')]
  host.apply({ type: 'page.get', key: 'p' }, out(pageOf('p', blocks)), true, 'alpha')
  await settle()
  expect(host.editor!.ed.text()).toBe('alxpha')
  expect(host.editor!.ed.cursor16()).toBe(3)
  expect(notices).toEqual([])
})

test('a refresh without the edited block ends editing', async () => {
  await host.edit(1, 2)
  blocks = [block(2, 'beta')]
  host.apply({ type: 'page.get', key: 'p' }, out(pageOf('p', blocks)), true, 'alpha')
  await settle()
  expect(host.editingId).toBeNull()
})

test('text sent to a block that is gone is shown to copy, never dropped', () => {
  const cmd: Command = { type: 'block.setText', id: 9, text: 'my words' }
  host.backgroundFailed({ code: 'unknownBlock', message: 'no such block' }, cmd)
  expect(notices).toEqual([
    {
      kind: 'conflict',
      page: 'p',
      block: 9,
      mine: 'my words',
      theirs: null,
      message: 'This block is gone, so your text was not saved. Copy it from here:',
    },
  ])
})

test('typed text that met an internal error or a reloaded folder is shown to copy, never dropped', () => {
  // `recovered`: the core recovered from an internal error before it ran; `stale`: it was typed before the reload.
  for (const code of ['recovered', 'stale']) {
    notices = []
    const cmd: Command = { type: 'block.setText', id: 9, text: `my words ${code}` }
    host.backgroundFailed({ code, message: 'Breccia hit an internal error' }, cmd)
    expect(notices).toEqual([
      {
        kind: 'conflict',
        page: 'p',
        block: 9,
        mine: `my words ${code}`,
        theirs: null,
        message: 'This block is gone, so your text was not saved. Copy it from here:',
      },
    ])
  }
})

test('a refusal the env calls quiet is not shown; typed text never asks', async () => {
  const asked: [string | null, string][] = []
  const quietHost = new EditorHost(
    {
      client: { ...client, run: (cmd) => (sent.push(cmd), Promise.reject({ code: 'recovered', message: 'internal' })) },
      blocks: () => blocks,
      pageOf: () => 'p',
      states: () => [],
      notify: (n) => notices.push(n),
      showMenu() {},
      selectWithNeighbour() {},
      quiet: (code, cmd) => (asked.push([code, cmd.type]), true),
      mount,
      slot: () => ({}) as HTMLElement,
    },
    new Set(),
  )
  await quietHost.exec({ type: 'block.merge', id: 1 })
  expect(notices).toEqual([])
  await quietHost.exec({ type: 'block.setText', id: 9, text: 'kept' })
  expect(notices.map((n) => n.kind === 'conflict' && n.mine)).toEqual(['kept'])
  expect(asked).toEqual([['recovered', 'block.merge']])
})

test('a refused setText run by a command shows the unsent text too', async () => {
  const run = client.run
  client.run = (cmd) => (sent.push(cmd), Promise.reject({ code: 'unknownBlock', message: 'no such block' }))
  try {
    await host.exec({ type: 'block.setText', id: 9, text: 'kept' })
  } finally {
    client.run = run
  }
  expect(notices.map((n) => n.kind === 'conflict' && n.mine)).toEqual(['kept'])
})

test('Use theirs sets the block and the editor to the disk text', async () => {
  await host.edit(1, 5)
  const run = client.run
  client.run = (cmd) => (sent.push(cmd), Promise.resolve(out(null)))
  try {
    await host.resolveConflict(1, 'ALPHA', true, host.typingMark())
  } finally {
    client.run = run
  }
  expect(sent).toEqual([{ type: 'block.setText', id: 1, text: 'ALPHA' }])
  expect(host.editor!.ed.text()).toBe('ALPHA')
})

test('Keep mine keeps text typed since in the editor and sends it again', async () => {
  await host.edit(1, 5)
  host.editor!.ed.insert('!')
  typed = []
  const run = client.run
  client.run = (cmd) => (sent.push(cmd), Promise.resolve(out(null)))
  try {
    await host.resolveConflict(1, 'alpha', false, host.typingMark())
  } finally {
    client.run = run
  }
  expect(sent).toEqual([{ type: 'block.setText', id: 1, text: 'alpha' }])
  expect(host.editor!.ed.text()).toBe('alpha!')
  expect(typed).toEqual([{ id: 1, text: 'alpha!' }])
})

test('Keep mine after leaving the block sends the text typed since the notice, not the older snapshot', async () => {
  await host.edit(1, 5)
  host.editor!.ed.insert('!')
  // The notice is made now, with the editor's text as `mine`.
  const since = host.typingMark()
  host.editor!.ed.insert('?')
  // A mouse click on the notice leaves the block first (App's onPointerDown).
  host.leave()
  const run = client.run
  client.run = (cmd) => (sent.push(cmd), Promise.resolve(out(null)))
  try {
    await host.resolveConflict(1, 'alpha!', false, since)
  } finally {
    client.run = run
  }
  expect(sent).toEqual([{ type: 'block.setText', id: 1, text: 'alpha!?' }])
})

test('Keep mine sends the snapshot when nothing was typed since the notice', async () => {
  await host.edit(1, 5)
  host.editor!.ed.insert('!')
  const since = host.typingMark()
  host.leave()
  const run = client.run
  client.run = (cmd) => (sent.push(cmd), Promise.resolve(out(null)))
  try {
    await host.resolveConflict(1, 'alpha!', false, since)
  } finally {
    client.run = run
  }
  expect(sent).toEqual([{ type: 'block.setText', id: 1, text: 'alpha!' }])
})

test('text carried into the new block by a split opens the link menu', async () => {
  const names = [{ key: 'pro', name: 'Pro', exists: true }]
  linkNames = names
  await host.edit(1, 5)
  hooks.onAction('split', { cursor16: 5 })
  const split = sent.find((c) => c.type === 'block.split')!
  // Typed while the split runs, at the split caret: lands in the old editor.
  host.editor!.ed.insert('see [[Pr')
  const o = out(pageOf('p', [block(1, 'alpha'), block(8, '')]))
  o.focus = { id: 8, at: 0 }
  blocks = [block(1, 'alpha'), block(8, ''), block(2, 'beta')]
  host.apply(split, o, true)
  await settle()
  await settle()
  expect(host.editingId).toBe(8)
  expect(host.editor!.ed.text()).toBe('see [[Pr')
  expect(shown.at(-1)?.[0]).toBe('link')
  expect(shown.at(-1)?.[1]?.items.map((i) => i.label)).toContain('Pro')
})

test('ArrowDown at the last block of a run does not jump to a later run', async () => {
  order = () => [block(1, 'alpha')] // blocks() still lists 1 and 2
  await host.edit(1, 5)
  hooks.onAction('focusNext', { cursor16: 5 })
  await settle()
  expect(host.editingId).toBe(1)
})

test('a new folder forgets the text typed in the old one: Keep mine then sends the notice text', async () => {
  await host.edit(1, 5)
  host.editor!.ed.insert('!') // typed into block 1 of the old folder
  host.leave()
  host.newFolder()
  // Block 1 of the new folder is another block; a notice about it made from mark 0 keeps its own text.
  const run = client.run
  client.run = (cmd) => (sent.push(cmd), Promise.resolve(out(null)))
  try {
    await host.resolveConflict(1, 'new folder text', false, 0)
  } finally {
    client.run = run
  }
  expect(sent.filter((c) => c.type === 'block.setText')).toEqual([{ type: 'block.setText', id: 1, text: 'new folder text' }])
})

// A state typed or removed by hand is settled when the editor closes.
const settles = () => sent.filter((c) => c.type === 'block.settle')

test('leaving a block whose state was typed by hand settles it, once', async () => {
  host.setKeywords(['TODO', 'DONE'])
  await host.edit(1, 0)
  host.editor!.ed.insert('TODO ')
  expect(settles()).toEqual([]) // never while the editor is open
  host.leave()
  expect(settles()).toEqual([{ type: 'block.settle', id: 1, before: null }])
  host.leave()
  host.close()
  expect(settles()).toHaveLength(1)
})

test('moving to another block settles the one left; the same state sends nothing', async () => {
  host.setKeywords(['TODO', 'DONE'])
  blocks = [{ ...block(1, 'TODO alpha'), state: 'TODO' }, block(2, 'beta')]
  await host.edit(1, 10)
  host.editor!.ed.insert(' more')
  await host.edit(2, 0)
  expect(settles()).toEqual([])
  host.editor!.ed.setText('DONE beta', 9)
  host.editor!.ed.setText('beta', 4) // typed and taken back
  host.close()
  expect(settles()).toEqual([])
})

test('the state when the editor opened counts, also after the block is edited again', async () => {
  host.setKeywords(['TODO', 'DONE'])
  blocks = [{ ...block(1, 'TODO alpha'), state: 'TODO' }, block(2, 'beta')]
  await host.edit(1, 0)
  host.editor!.ed.setText('alpha', 0) // the keyword removed by hand
  // An output shows the block without its state and focuses it again: still the same editing.
  blocks = [block(1, 'alpha'), block(2, 'beta')]
  await host.edit(1, 0)
  await host.edit(2, 0)
  expect(settles()).toEqual([{ type: 'block.settle', id: 1, before: 'TODO' }])
})

test('a new folder drops the block that was being edited: nothing is settled in it', async () => {
  host.setKeywords(['TODO'])
  await host.edit(1, 0)
  host.editor!.ed.insert('TODO ')
  host.newFolder()
  host.close()
  expect(settles()).toEqual([])
})

test('a state set by a command while editing is the core\'s: the editor closing settles nothing more', async () => {
  host.setKeywords(['TODO', 'DONE'])
  await host.edit(1, 0)
  // Ctrl Enter: the core gives the block its state and created:: line.
  const cycle: Command = { type: 'block.cycleState', id: 1 }
  void host.exec(cycle)
  blocks = [{ ...block(1, 'TODO alpha'), state: 'TODO' }, block(2, 'beta')]
  host.apply(cycle, out(pageOf('p', blocks)), true, 'alpha')
  await settle()
  host.editor!.ed.setText('TODO alpha', 10) // the created:: line deleted by hand stays deleted
  host.leave()
  expect(settles()).toEqual([])
})

test('a keyword typed before a state command still settles from the state the editor opened with', async () => {
  host.setKeywords(['TODO', 'DOING'])
  await host.edit(1, 0)
  host.editor!.ed.insert('TODO ')
  // The typing reached the core first (no created:: then), and Ctrl Enter moved it on to DOING.
  const cycle: Command = { type: 'block.cycleState', id: 1 }
  void host.exec(cycle)
  const typedView = [{ ...block(1, 'TODO alpha'), state: 'TODO' }, block(2, 'beta')]
  blocks = [{ ...block(1, 'DOING alpha'), state: 'DOING' }, block(2, 'beta')]
  host.apply(cycle, out(pageOf('p', blocks)), true, typedView[0].text)
  await settle()
  host.leave()
  expect(settles()).toEqual([{ type: 'block.settle', id: 1, before: null }])
})

test('a state removed by a command while editing, then typed again by hand, settles from no state', async () => {
  host.setKeywords(['TODO', 'DONE'])
  blocks = [{ ...block(1, 'DONE alpha'), state: 'DONE' }, block(2, 'beta')]
  await host.edit(1, 0)
  // Ctrl Shift Enter: the core removes the state.
  const cycle: Command = { type: 'blocks.setState', ids: [1], keyword: null }
  void host.exec(cycle)
  blocks = [block(1, 'alpha'), block(2, 'beta')]
  host.apply(cycle, out(pageOf('p', blocks)), true, 'DONE alpha')
  await settle()
  host.editor!.ed.setText('TODO alpha', 5)
  host.leave()
  expect(settles()).toEqual([{ type: 'block.settle', id: 1, before: null }])
})

test('Ctrl Shift Enter while editing sends blocks.setState with no keyword', async () => {
  blocks = [{ ...block(1, 'TODO alpha'), state: 'TODO' }, block(2, 'beta')]
  await host.edit(1, 0)
  host.act(1, 'removeState')
  expect(sent.at(-1)).toEqual({ type: 'blocks.setState', ids: [1], keyword: null })
})

// ---- Ctrl Shift K: delete the block -------------------------------------------------

test('the delete key sends the typed text first, then block.delete', async () => {
  const invoked: Command[] = []
  const real = createClient((req) => (invoked.push(req.command), Promise.resolve(out(null))))
  const h = new EditorHost(
    {
      client: real,
      blocks: () => blocks,
      pageOf: () => 'p',
      states: () => [],
      notify: (n) => notices.push(n),
      showMenu() {},
      selectWithNeighbour() {},
      mount,
      slot: () => ({}) as HTMLElement,
    },
    new Set(),
  )
  await h.edit(2, 4)
  h.editor!.ed.insert('!') // still in the typing pause when the key is pressed
  hooks.onAction('deleteBlock', { cursor16: 5 })
  await real.flush()
  expect(invoked).toEqual([
    { type: 'block.setText', id: 2, text: 'beta!' },
    { type: 'block.delete', id: 2 },
  ])
})

test('after the delete the caret is at the end of the block above', async () => {
  blocks = [block(1, 'alpha'), block(2, 'beta'), { ...block(5, 'kid'), depth: 1 }, block(3, 'gamma')]
  await host.edit(2, 1)
  hooks.onAction('deleteBlock', { cursor16: 1 })
  const del = sent.at(-1)!
  expect(del).toEqual({ type: 'block.delete', id: 2 })
  blocks = [block(1, 'alpha'), block(3, 'gamma')]
  host.apply(del, out(pageOf('p', blocks)), true)
  await settle()
  expect(host.editingId).toBe(1)
  expect(host.editor!.ed.cursor16()).toBe(5)
})

test('deleting the first block puts the caret at the start of the block after its children', async () => {
  blocks = [block(1, 'alpha'), { ...block(5, 'kid'), depth: 1 }, block(2, 'beta')]
  await host.edit(1, 3)
  hooks.onAction('deleteBlock', { cursor16: 3 })
  const del = sent.at(-1)!
  blocks = [block(2, 'beta')]
  host.apply(del, out(pageOf('p', blocks)), true)
  await settle()
  expect(host.editingId).toBe(2)
  expect(host.editor!.ed.cursor16()).toBe(0)
})

test('a delete key during a split waits for the new block, and keys after it are dropped', async () => {
  await host.edit(1, 5)
  hooks.onAction('split', { cursor16: 5 })
  const split = sent.find((c) => c.type === 'block.split')!
  // Pressed before the split answers.
  hooks.onAction('deleteBlock', { cursor16: 5 })
  hooks.onAction('indent', { cursor16: 5 })
  const o = out(pageOf('p', [block(1, 'alpha'), block(8, ''), block(2, 'beta')]))
  o.focus = { id: 8, at: 0 }
  blocks = [block(1, 'alpha'), block(8, ''), block(2, 'beta')]
  host.apply(split, o, true)
  await settle()
  expect(sent.filter((c) => c.type !== 'pages.list')).toEqual([split, { type: 'block.delete', id: 8 }])
  expect(notices).toEqual([])
})

test('after deleting the only block the caret stays in it', async () => {
  blocks = [block(1, 'solo'), { ...block(5, 'kid'), depth: 1 }]
  await host.edit(1, 4)
  hooks.onAction('deleteBlock', { cursor16: 4 })
  const del = sent.at(-1)!
  expect(del).toEqual({ type: 'block.delete', id: 1 })
  blocks = [block(1, '')]
  const o = out(pageOf('p', blocks))
  o.focus = { id: 1, at: 0 }
  host.apply(del, o, true)
  await settle()
  expect(host.editingId).toBe(1)
  expect(host.editor!.ed.text()).toBe('')
  expect(host.editor!.ed.cursor16()).toBe(0)
})

test('in the feed the caret stays on the block\'s own day', async () => {
  // Two days in one feed: 1 and 2 on the day above, 3 and 4 on the lower day.
  const day: Record<number, string> = { 1: 'a', 2: 'a', 3: 'b', 4: 'b' }
  blocks = [block(1, 'one'), block(2, 'two'), block(3, 'three'), block(4, 'four')]
  const h = new EditorHost(
    {
      client,
      blocks: () => blocks,
      order: () => blocks,
      pageOf: (id) => day[id] ?? null,
      states: () => [],
      notify: (n) => notices.push(n),
      showMenu() {},
      selectWithNeighbour() {},
      mount,
      slot: () => ({}) as HTMLElement,
    },
    new Set(),
  )
  await h.edit(3, 0)
  hooks.onAction('deleteBlock', { cursor16: 0 })
  const del = sent.at(-1)!
  expect(del).toEqual({ type: 'block.delete', id: 3 })
  blocks = [block(1, 'one'), block(2, 'two'), block(4, 'four')]
  h.apply(del, out(pageOf('b', [block(4, 'four')])), true)
  await settle()
  expect(h.editingId).toBe(4)
  expect(h.editor!.ed.cursor16()).toBe(0)
})

test('deleting a linked reference with nothing else of its page shown ends editing', async () => {
  // The reference shows only block 1 of page j; the core deletes it (j has other blocks).
  const page: Record<number, string> = { 1: 'j', 2: 'k' }
  blocks = [block(1, 'see [[a]]'), block(2, 'other')]
  const h = new EditorHost(
    {
      client,
      blocks: () => blocks,
      pageOf: (id) => page[id] ?? null,
      states: () => [],
      notify: (n) => notices.push(n),
      showMenu() {},
      selectWithNeighbour() {},
      mount,
      slot: () => ({}) as HTMLElement,
    },
    new Set(),
  )
  await h.edit(1, 0)
  hooks.onAction('deleteBlock', { cursor16: 0 })
  const del = sent.at(-1)!
  expect(del).toEqual({ type: 'block.delete', id: 1 })
  blocks = [block(2, 'other')]
  h.apply(del, out(pageOf('j', [block(0, 'top')])), true)
  await settle()
  expect(h.editingId).toBeNull()
  expect(notices).toEqual([])
})
