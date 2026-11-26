// A fake window for `AppController` tests: a scripted core answering `invoke`, the in-memory editor, the timers of the
// moment (so a test may fake them) and DOM, window and shell hooks that record what they are asked.
import { flushSync } from 'svelte'
import { fakeMount } from '../editor/mount.testing'
import type { AppEnv } from './app.svelte'
import { emptyOutput } from './emptyOutput.testing'
import type { BlockView, Command, ConfigView, Output, PageView, Request, UiState } from './types'

export function block(id: number, text: string): BlockView {
  return { id, depth: 0, text, html: '', state: null, finished: false, hasChildren: false }
}

export function pageView(key: string, blocks: BlockView[] = [], title = key): PageView {
  return { key, name: key, kind: 'page', title, preambleHtml: '', hasFile: true, blocks }
}

export function configView(over: Partial<ConfigView> = {}): ConfigView {
  return {
    states: [{ keyword: 'TODO', color: 'blue', finished: false, inCycle: true }],
    boards: [],
    archiveAfterDays: 7,
    autoArchive: false,
    git: { enabled: false, commitDelayMinutes: 5, pullIntervalMinutes: 10 },
    dailiesReset: '04:00',
    replaced: [],
    version: 1,
    ...over,
  }
}

/** A refusal as the core sends it. */
export function refusal(code: string, message = code): { code: string; message: string } {
  return { code, message }
}

type Handler = (cmd: Command) => Output | Promise<Output>

export interface FakeCore {
  /** Every command sent, in order. */
  sent: Command[]
  /** The pages `page.show`, `page.get` and `page.open` answer with; a missing key is refused `unknownPage`. */
  pages: Map<string, PageView>
  /** The folder `folder.status` names. */
  folder: { path: string | null; generation: number }
  /** What `config.get` answers. */
  config: ConfigView
  /** Answers by command type, over the defaults above; a handler may throw to refuse. */
  on: Partial<Record<Command['type'], Handler>>
}

export interface FakeWindow {
  env: AppEnv
  core: FakeCore
  /** The window's calls (`show`, `unminimize`, `setFocus`, `hide`, `destroy`), in order. */
  windowCalls: string[]
  /** The layouts saved (`setUiState`). */
  layouts: UiState[]
  /** The blocks scrolled to (`dom.scrollToBlock`). */
  scrolledTo: number[]
  /** The fake `.main`: its scroll position. */
  scroller: { scrollTop: number; scrollLeft: number }
  /** The time `now` answers, in ms. */
  clock: number
}

function answer(core: FakeCore, cmd: Command): Output | Promise<Output> {
  const own = core.on[cmd.type]
  if (own) return own(cmd)
  const shown = (key: string) => {
    const p = core.pages.get(key)
    if (!p) throw refusal('unknownPage', `no page ${key}`)
    return emptyOutput({ page: p })
  }
  switch (cmd.type) {
    case 'folder.status':
      return emptyOutput({ answer: { kind: 'folder', value: { ...core.folder } } })
    case 'config.get':
      return emptyOutput({ config: core.config })
    case 'page.show':
    case 'page.get':
      return shown(cmd.key)
    case 'page.open':
      return shown(cmd.name)
    case 'page.refs':
      return emptyOutput({ answer: { kind: 'refs', value: { key: cmd.key, count: 0, groups: [] } } })
    case 'journal.feed':
      return emptyOutput({ answer: { kind: 'feed', value: { today: '2026-11-26', days: [] } } })
    case 'pages.table':
      return emptyOutput({ answer: { kind: 'table', value: [] } })
    case 'pages.list':
      return emptyOutput({ answer: { kind: 'names', value: [] } })
    default:
      return emptyOutput()
  }
}

/** A window over a fake core with no folder open yet (`folder.status` names `/notes`, generation 1). */
export function fakeWindow(): FakeWindow {
  const core: FakeCore = {
    sent: [],
    pages: new Map(),
    folder: { path: '/notes', generation: 1 },
    config: configView(),
    on: {},
  }
  const w: FakeWindow = {
    core,
    windowCalls: [],
    layouts: [],
    scrolledTo: [],
    scroller: { scrollTop: 0, scrollLeft: 0 },
    clock: 1_000_000,
    env: undefined as unknown as AppEnv,
  }
  w.env = {
    async invoke(req: Request) {
      core.sent.push(req.command)
      return answer(core, req.command)
    },
    mountEditor: fakeMount(),
    dom: {
      scroller: () => w.scroller as unknown as HTMLElement,
      topDay: () => null,
      scrollToBlock: (id) => void w.scrolledTo.push(id),
      tick: () => Promise.resolve(),
      setBusy() {},
      slot: () => ({}) as HTMLElement,
      root: () => ({ dataset: {} }),
      keyTaken: () => false,
    },
    // Looked up at each call, so `vi.useFakeTimers` after the window is built still takes effect.
    timers: {
      setTimeout: ((f: () => void, ms?: number) => globalThis.setTimeout(f, ms)) as typeof setTimeout,
      clearTimeout: (t) => globalThis.clearTimeout(t),
      setInterval: ((f: () => void, ms?: number) => globalThis.setInterval(f, ms)) as typeof setInterval,
      clearInterval: (t) => globalThis.clearInterval(t),
    },
    now: () => w.clock,
    shell: {
      webviewZoom: () => Promise.resolve(),
      setZoom: () => Promise.resolve(),
      hiddenColumns: () => Promise.resolve({}),
      setHiddenColumns: () => Promise.resolve(),
      uiState: () => Promise.resolve({ sidebarWidth: null, sidebarHidden: false }),
      setUiState: async (s) => void w.layouts.push(s),
      setTheme: () => Promise.resolve(),
      setJournalsAt: () => Promise.resolve(),
      setLinkDisplay: () => Promise.resolve(),
      recentFolders: () => Promise.resolve([]),
      forgetFolder: () => Promise.resolve(),
      getAppVersion: () => Promise.resolve('0.0.0'),
      logFolder: () => Promise.resolve(null),
      openLogFolder: () => Promise.resolve(),
      gitInstalled: () => Promise.resolve(true),
      trayEnabled: () => Promise.resolve(false),
      startupOpen: () => ({ opening: () => Promise.resolve(null), onOpened: () => () => {} }),
      startupNotices: () => Promise.resolve([]),
    },
    window: {
      show: async () => void w.windowCalls.push('show'),
      unminimize: async () => void w.windowCalls.push('unminimize'),
      setFocus: async () => void w.windowCalls.push('setFocus'),
      hide: async () => void w.windowCalls.push('hide'),
      destroy: async () => void w.windowCalls.push('destroy'),
      setTheme: () => Promise.resolve(),
    },
    pickFolder: () => Promise.resolve(null),
    openUrl: () => Promise.resolve(),
  }
  return w
}

/** Lets the queued commands, their answers, the held shell events and the effects run. */
export async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 0))
    flushSync()
  }
}
