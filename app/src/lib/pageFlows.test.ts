import { expect, test } from 'vitest'
import { PageFlows } from './pageFlows.svelte'
import type { Command, Notice, Output, TreeView } from './types'

const out = (removed: string[] = []): Output => ({
  page: null,
  focus: null,
  notices: [],
  folder: null,
  config: null,
  refs: null,
  names: null,
  tree: null,
  changed: [],
  removed,
  dirty: null,
  feed: null,
  pages: [],
  board: null, table: null, search: null, renamed: [], git: null, usage: null, usageSkipped: null, graph: null, saved: [],
})

function setup(shown: string | null, removed: string[]) {
  const ran: string[] = []
  const notices: Notice[] = []
  let homes = 0
  const flows = new PageFlows({
    run: async (cmd: Command) => {
      ran.push(cmd.type)
      return out(cmd.type === 'page.delete' || cmd.type === 'dir.delete' ? removed : [])
    },
    tree: () => null,
    shown: () => shown,
    notify: (n) => notices.push(n),
    home: async () => {
      homes++
    },
  })
  return { flows, ran, notices, homes: () => homes }
}

const settle = () => new Promise((r) => setTimeout(r, 0))

for (const row of [
  { id: 'p:a', depth: 0, kind: 'page' as const, label: 'A', key: 'a' },
  { id: 'f:F', depth: 0, kind: 'folder' as const, label: 'F', path: 'F' },
]) {
  test(`deleting the shown page (a ${row.kind}) goes home, then reloads the tree`, async () => {
    const { flows, ran, homes } = setup('a', ['a'])
    flows.start('delete', row)
    flows.answer('')
    await settle()
    expect(ran).toEqual([row.kind === 'page' ? 'page.delete' : 'dir.delete', 'folder.tree'])
    expect(homes()).toBe(1)
  })
}

test('deleting another page leaves the view alone', async () => {
  const { flows, ran, homes } = setup('b', ['a'])
  flows.start('delete', { id: 'p:a', depth: 0, kind: 'page', label: 'A', key: 'a' })
  flows.answer('')
  await settle()
  expect(ran).toEqual(['page.delete', 'folder.tree'])
  expect(homes()).toBe(0)
})

function renameSetup(reach: number) {
  const ran: Command[] = []
  const flows = new PageFlows({
    run: async (cmd: Command) => {
      ran.push(cmd)
      return cmd.type === 'page.renameReach' ? { ...out(), reach } : out()
    },
    tree: () => null,
    shown: () => null,
    notify: () => {},
    home: async () => {},
  })
  return { flows, ran }
}

test('the rename question counts the pages the new name rewrites', async () => {
  const { flows, ran } = renameSetup(1)
  await flows.rename('a', 'A', 'B')
  expect(flows.dialog).toMatchObject({ kind: 'confirm' })
  expect(flows.dialog && 'message' in flows.dialog ? flows.dialog.message : '').toContain(
    'Links in 1 page will be updated',
  )
  expect(ran).toEqual([{ type: 'page.renameReach', key: 'a', name: 'B' }])
})

test('a rename that rewrites no links asks nothing', async () => {
  const { flows, ran } = renameSetup(0)
  await flows.rename('a', 'A', 'B')
  await settle()
  expect(flows.dialog).toBeNull()
  expect(ran.slice(0, 2).map((c) => c.type)).toEqual(['page.renameReach', 'page.rename'])
})

test('moving a page only linked to offers only the folders and sends page.move', async () => {
  const ran: Command[] = []
  const tree: TreeView = {
    pages: [
      { kind: 'folder', name: 'Projects', path: 'Projects', children: [] },
      { kind: 'page', key: 'idea', name: 'Idea', linkedOnly: true },
    ],
    journals: [],
    tags: [],
    version: 0,
  }
  const flows = new PageFlows({
    run: async (cmd: Command) => {
      ran.push(cmd)
      return out()
    },
    tree: () => tree,
    shown: () => null,
    notify: () => {},
    home: async () => {},
  })
  flows.start('move', { id: 'p:idea', depth: 0, kind: 'page', label: 'Idea', key: 'idea', linkedOnly: true })
  const d = flows.dialog
  expect(d?.kind).toBe('move')
  if (d?.kind !== 'move') return
  // It is listed at the top level already: no "— top level".
  expect(d.targets).toEqual([{ path: 'Projects', label: 'Projects' }])
  d.ok('Projects')
  await settle()
  expect(ran).toEqual([{ type: 'page.move', key: 'idea', folder: 'Projects' }, { type: 'folder.tree' }])
})

function dropSetup(fail: string | null = null) {
  const ran: Command[] = []
  const notices: Notice[] = []
  const tree: TreeView = {
    pages: [
      { kind: 'folder', name: 'Projects', path: 'Projects', children: [{ kind: 'page', key: 'a', name: 'A' }] },
      { kind: 'folder', name: 'Other', path: 'Other', children: [] },
    ],
    journals: [],
    tags: [],
    version: 0,
  }
  const flows = new PageFlows({
    run: async (cmd: Command) => {
      ran.push(cmd)
      if (cmd.type === fail) throw { code: 'folderExists', message: 'A folder “Projects” already exists' }
      return out()
    },
    tree: () => tree,
    shown: () => null,
    notify: (n) => notices.push(n),
    home: async () => {},
  })
  return { flows, ran, notices }
}

test('a drop runs the move, then fetches the tree, before it resolves', async () => {
  const { flows, ran } = dropSetup()
  await flows.moveTo({ id: 'p:a', depth: 1, kind: 'page', label: 'A', key: 'a' }, 'Other')
  expect(ran).toEqual([{ type: 'page.move', key: 'a', folder: 'Other' }, { type: 'folder.tree' }])
})

test('a drop where the row already is sends nothing', async () => {
  const { flows, ran } = dropSetup()
  await flows.moveTo({ id: 'p:a', depth: 1, kind: 'page', label: 'A', key: 'a' }, 'Projects')
  await flows.moveTo({ id: 'f:Projects', depth: 0, kind: 'folder', label: 'Projects', path: 'Projects' }, '')
  expect(ran).toEqual([])
})

test('a refused drop becomes a notice', async () => {
  const { flows, ran, notices } = dropSetup('dir.rename')
  await flows.moveTo({ id: 'f:Other', depth: 0, kind: 'folder', label: 'Other', path: 'Other' }, 'Projects')
  // A refused drop fetches the tree again, so a stale one does not stay.
  expect(ran).toEqual([{ type: 'dir.rename', path: 'Other', to: 'Projects/Other' }, { type: 'folder.tree' }])
  expect(notices.map((n) => n.kind)).toEqual(['refused'])
})

function createSetup(fail: string | null = null) {
  const ran: Command[] = []
  const notices: Notice[] = []
  const tree: TreeView = {
    pages: [
      { kind: 'folder', name: 'Projects', path: 'Projects', children: [{ kind: 'page', key: 'a', name: 'A' }] },
    ],
    journals: [],
    tags: [],
    version: 0,
  }
  const flows = new PageFlows({
    run: async (cmd: Command) => {
      ran.push(cmd)
      if (cmd.type === fail) throw { code: 'pageExists', message: 'A page “Idea” already exists' }
      return out()
    },
    tree: () => tree,
    shown: () => null,
    notify: (n) => notices.push(n),
    home: async () => {},
  })
  return { flows, ran, notices }
}

const pageRow = { id: 'p:a', depth: 1, kind: 'page' as const, label: 'A', key: 'a' }

test('a new page asks for a name and is made in the folder of the row it started on', async () => {
  const { flows, ran } = createSetup()
  flows.start('newPage', pageRow)
  expect(flows.dialog).toMatchObject({ kind: 'name', title: 'New page', initial: '' })
  flows.answer('Idea')
  await settle()
  expect(ran).toEqual([{ type: 'page.create', name: 'Idea', folder: 'Projects' }, { type: 'folder.tree' }])
})

test('a new page started in the empty tree area goes to the top level', async () => {
  const { flows, ran } = createSetup()
  flows.start('newPage', null)
  flows.answer('Idea')
  await settle()
  expect(ran[0]).toEqual({ type: 'page.create', name: 'Idea', folder: '' })
})

test('a new folder joins the name to the folder of its row', async () => {
  const { flows, ran } = createSetup()
  flows.start('newFolder', { id: 'f:Projects', depth: 0, kind: 'folder', label: 'Projects', path: 'Projects' })
  expect(flows.dialog).toMatchObject({ kind: 'name', title: 'New folder' })
  flows.answer('2027')
  await settle()
  expect(ran[0]).toEqual({ type: 'dir.create', path: 'Projects/2027' })
})

test('renaming a folder offers its name, sends its sibling path, and the same name sends nothing', async () => {
  const { flows, ran } = createSetup()
  const row = { id: 'f:Projects/Old', depth: 1, kind: 'folder' as const, label: 'Old', path: 'Projects/Old' }
  flows.start('rename', row)
  expect(flows.dialog).toMatchObject({ kind: 'name', title: 'Rename folder', initial: 'Old' })
  flows.answer('Old')
  await settle()
  expect(ran).toEqual([])
  flows.start('rename', row)
  flows.answer('New')
  await settle()
  expect(ran[0]).toEqual({ type: 'dir.rename', path: 'Projects/Old', to: 'Projects/New' })
})

test('renaming a page from its row asks for the reach first, then renames', async () => {
  const { flows, ran } = createSetup()
  flows.start('rename', pageRow)
  expect(flows.dialog).toMatchObject({ kind: 'name', title: 'Rename page', initial: 'A' })
  flows.answer('B')
  await settle()
  expect(ran.slice(0, 2)).toEqual([
    { type: 'page.renameReach', key: 'a', name: 'B' },
    { type: 'page.rename', key: 'a', name: 'B' },
  ])
})

test('renaming a tag row says so', () => {
  const { flows } = createSetup()
  flows.start('rename', { id: 't:infra', depth: 0, kind: 'tag', label: 'infra', key: 'infra' })
  expect(flows.dialog).toMatchObject({ kind: 'name', title: 'Rename tag', initial: 'infra' })
})

test('a refused page create is a notice, and the tree is fetched again', async () => {
  const { flows, ran, notices } = createSetup('page.create')
  flows.start('newPage', pageRow)
  flows.answer('Idea')
  await settle()
  expect(notices).toEqual([{ kind: 'refused', message: 'A page “Idea” already exists' }])
  expect(ran.map((c) => c.type)).toEqual(['page.create', 'folder.tree'])
})

test('a refused rename question is a notice and renames nothing', async () => {
  const { flows, ran, notices } = createSetup('page.renameReach')
  await flows.rename('a', 'A', 'B')
  expect(notices.map((n) => n.kind)).toEqual(['refused'])
  expect(ran.map((c) => c.type)).toEqual(['page.renameReach'])
})
