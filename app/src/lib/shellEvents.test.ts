import { describe, expect, it, vi } from 'vitest'

// Each `listen` registers when the test says so; `ready` must wait for all of them.
const pending = new Map<string, () => void>()
const handlers = new Map<string, (e: { payload: unknown }) => void>()
vi.mock('@tauri-apps/api/event', () => ({
  listen: (name: string, handler: (e: { payload: unknown }) => void) => {
    handlers.set(name, handler)
    return new Promise<() => void>((resolve) => pending.set(name, () => resolve(() => {})))
  },
}))
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ onCloseRequested: () => Promise.resolve(() => {}) }),
}))

const { listenShell } = await import('./shellEvents')
const { CONFIG_CHANGED, DAILIES_CHANGED, GIT_CHANGED, PAGES_SAVED, SESSION_RECOVERED, TRAY_EXIT } = await import('../api')

describe('listenShell', () => {
  it('is ready only once every listener is registered, git:changed included', async () => {
    const noop = () => {}
    const shell = listenShell({
      pageChanged: noop, treeChanged: noop, pageRemoved: noop, notices: noop, indexChanged: noop,
      gitChanged: noop, pageRenamed: noop, configChanged: noop, dailiesChanged: noop, pagesSaved: noop, trayExit: noop, closeRequested: async () => {}, recovered: noop,
    })
    let ready = false
    void shell.ready.then(() => (ready = true))
    for (const [name, register] of pending) if (name !== GIT_CHANGED) register()
    await new Promise((r) => setTimeout(r, 0))
    expect(ready).toBe(false)
    pending.get(GIT_CHANGED)!()
    await new Promise((r) => setTimeout(r, 0))
    expect(ready).toBe(true)
  })
  it('listens to config:changed (settings a Git pull brought)', async () => {
    pending.clear()
    const seen: unknown[] = []
    const noop = () => {}
    const shell = listenShell({
      pageChanged: noop, treeChanged: noop, pageRemoved: noop, notices: noop, indexChanged: noop,
      gitChanged: noop, pageRenamed: noop, configChanged: (c) => seen.push(c), dailiesChanged: noop, pagesSaved: noop, trayExit: noop, closeRequested: async () => {}, recovered: noop,
    })
    let ready = false
    void shell.ready.then(() => (ready = true))
    for (const [name, register] of pending) if (name !== CONFIG_CHANGED) register()
    await new Promise((r) => setTimeout(r, 0))
    expect(ready).toBe(false)
    expect(pending.has(CONFIG_CHANGED)).toBe(true)
    pending.get(CONFIG_CHANGED)!()
    await new Promise((r) => setTimeout(r, 0))
    expect(ready).toBe(true)
  })
  it('routes dailies:changed to dailiesChanged with its list', async () => {
    pending.clear()
    const noop = () => {}
    const seen: unknown[] = []
    listenShell({
      pageChanged: noop, treeChanged: noop, pageRemoved: noop, notices: noop, indexChanged: noop,
      gitChanged: noop, pageRenamed: noop, configChanged: noop, dailiesChanged: (l) => seen.push(l), pagesSaved: noop, trayExit: noop, closeRequested: async () => {}, recovered: noop,
    })
    expect(DAILIES_CHANGED).toBe('dailies:changed')
    const list = [{ id: 1, text: 'a', checked: null, nested: false }]
    handlers.get(DAILIES_CHANGED)!({ payload: list })
    expect(seen).toEqual([list])
  })
  it('listens to pages:saved (pages saved after a failed save)', async () => {
    pending.clear()
    const noop = () => {}
    listenShell({
      pageChanged: noop, treeChanged: noop, pageRemoved: noop, notices: noop, indexChanged: noop,
      gitChanged: noop, pageRenamed: noop, configChanged: noop, dailiesChanged: noop, pagesSaved: noop, trayExit: noop, closeRequested: async () => {}, recovered: noop,
    })
    expect(PAGES_SAVED).toBe('pages:saved')
    expect(pending.has(PAGES_SAVED)).toBe(true)
  })
  it('listens to tray:exit (Exit in the tray menu)', async () => {
    pending.clear()
    const noop = () => {}
    listenShell({
      pageChanged: noop, treeChanged: noop, pageRemoved: noop, notices: noop, indexChanged: noop,
      gitChanged: noop, pageRenamed: noop, configChanged: noop, dailiesChanged: noop, pagesSaved: noop, trayExit: noop, closeRequested: async () => {}, recovered: noop,
    })
    expect(TRAY_EXIT).toBe('tray:exit')
    expect(pending.has(TRAY_EXIT)).toBe(true)
  })
  it('listens to session:recovered (the session recovered from an internal error)', async () => {
    pending.clear()
    const noop = () => {}
    listenShell({
      pageChanged: noop, treeChanged: noop, pageRemoved: noop, notices: noop, indexChanged: noop,
      gitChanged: noop, pageRenamed: noop, configChanged: noop, dailiesChanged: noop, pagesSaved: noop, trayExit: noop, closeRequested: async () => {}, recovered: noop,
    })
    expect(SESSION_RECOVERED).toBe('session:recovered')
    expect(pending.has(SESSION_RECOVERED)).toBe(true)
  })
})
