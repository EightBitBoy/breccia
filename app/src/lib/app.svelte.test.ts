import { afterEach, expect, test, vi } from 'vitest'
import { AppController } from './app.svelte'
import { block, configView, fakeWindow, pageView, settle, type FakeWindow } from './appEnv.testing'
import { duePick } from './duePick.svelte'
import { emptyOutput } from './emptyOutput.testing'
import type { Command } from './types'

let stop: (() => void) | null = null

afterEach(() => {
  stop?.()
  stop = null
  duePick.close()
})

/** A controller over a fake window, built inside an effect root as App.svelte builds it during setup. */
function start(): { app: AppController; w: FakeWindow } {
  const w = fakeWindow()
  let app!: AppController
  stop = $effect.root(() => {
    app = new AppController(w.env)
  })
  return { app, w }
}

/** The folder `/notes` is open (generation 1) and page `key` is shown. */
async function withPage(key = 'p', title = key) {
  const s = start()
  s.w.core.pages.set(key, pageView(key, [block(1, 'alpha')], title))
  await s.app.exec({ type: 'folder.status' })
  await s.app.exec({ type: 'config.get' })
  await s.app.exec({ type: 'page.show', key })
  await settle()
  expect(s.app.area.view.kind).toBe('page')
  expect(s.app.page?.key).toBe(key)
  return s
}

/** The commands sent after `from` (an index into `sent`). */
const since = (w: FakeWindow, from: number): Command[] => w.core.sent.slice(from)

test('a new folder closes every view and dialog and clears the history', async () => {
  const { app, w } = await withPage('p')
  await app.leaveMainView('allPages')
  await app.allPages.open()
  await settle()
  expect(app.nav.canBack).toBe(true)
  const answers: boolean[] = []
  app.overlays.open({ kind: 'confirm', message: 'Delete?', ok: 'Delete', answer: (yes) => void answers.push(yes) })

  w.core.folder = { path: '/other', generation: 2 }
  await app.exec({ type: 'folder.status' })
  await settle()

  expect(app.folder).toBe('/other')
  expect(app.area.view.kind).toBe('none')
  expect(app.allPages.rows).toBeNull()
  expect(app.page).toBeNull()
  expect(app.overlays.current).toBeNull()
  expect(answers).toEqual([false]) // the question answered no, never left waiting
  expect(app.nav.canBack).toBe(false)
  expect(app.nav.canForward).toBe(false)
})

test('a page removed on disk while shown: a notice and the journal', async () => {
  const { app, w } = await withPage('p', 'Pea')
  const from = w.core.sent.length

  app.shellHandlers().pageRemoved('p')
  await settle()

  expect(app.notices.items.map((n) => n.text)).toEqual(['“Pea” was removed on disk.'])
  expect(since(w, from).map((c) => c.type)).toContain('journal.feed')
  expect(app.area.view.kind).toBe('feed')
  expect(app.page).toBeNull()
})

test('removed right after a rename: the page follows the rename, no notice', async () => {
  const { app, w } = await withPage('a', 'Apple')
  w.core.pages.set('b', pageView('b', [block(1, 'alpha')], 'Banana'))
  const from = w.core.sent.length
  const shell = app.shellHandlers()

  shell.pageRenamed({ from: 'a', to: 'b' })
  shell.pageRemoved('a')
  await settle()

  expect(app.page?.key).toBe('b')
  expect(app.notices.items).toEqual([])
  expect(since(w, from).map((c) => c.type)).not.toContain('journal.feed')
})

test('an outside change while All pages shows reloads only the table', async () => {
  const { app, w } = await withPage('p')
  await app.leaveMainView('allPages')
  await app.allPages.open()
  await settle()
  expect(app.area.view.kind).toBe('allPages')
  const from = w.core.sent.length

  app.shellHandlers().pageChanged(pageView('p', [block(1, 'alpha changed')]))
  await settle()

  expect(since(w, from)).toEqual([{ type: 'pages.table' }])
  expect(app.area.view.kind).toBe('allPages')
  expect(app.page).toBeNull()
})

test("a config change from disk refreshes the shown page's tasks", async () => {
  const { app, w } = await withPage('p')
  const from = w.core.sent.length
  const states = [...configView().states, { keyword: 'DONE', color: 'green', finished: true, inCycle: true }]

  app.shellHandlers().configChanged(configView({ states, version: 2 }))
  await settle()

  expect(app.config.states.map((s) => s.keyword)).toEqual(['TODO', 'DONE'])
  expect(since(w, from)).toEqual(
    expect.arrayContaining([
      { type: 'page.get', key: 'p' },
      { type: 'page.refs', key: 'p' },
    ]),
  )
})

test('the refreshes run when applying an answer fails part-way', async () => {
  const { app, w } = await withPage('p')
  await app.leaveMainView('graph')
  await app.network.open()
  app.search.show(null)
  app.search.type('pea')
  await settle()
  expect(app.area.view.kind).toBe('graph')
  expect(app.search.shown).toBe(true)
  vi.spyOn(app.allPages, 'applyTable').mockImplementation(() => {
    throw new Error('the table failed')
  })
  const from = w.core.sent.length

  // A page removed by a command of the window, with a table answer that a view fails to take.
  const out = emptyOutput({ removed: ['gone'], answer: { kind: 'table', value: [] } })
  expect(() => app.apply(out, { type: 'folder.tree' })).toThrow('the table failed')
  await settle()

  const sent = since(w, from).map((c) => c.type)
  expect(sent).toContain('search.query') // the open search box asks again
  expect(sent).toContain('graph.get') // the shown graph reloads
})

test('a reload closes the search, the date picker and the due calendar', async () => {
  const { app } = await withPage('p')
  app.search.show(null)
  app.pickerOpen = true
  duePick.show(null, { left: 0, top: 0, right: 0, bottom: 0 }, () => {})
  expect(app.search.shown).toBe(true)

  app.shellHandlers().recovered({ reopened: true, notice: { kind: 'refused', message: 'Breccia hit an internal error.' } })

  expect(app.search.shown).toBe(false)
  expect(app.pickerOpen).toBe(false)
  expect(duePick.open).toBe(false)
  await settle()
})
