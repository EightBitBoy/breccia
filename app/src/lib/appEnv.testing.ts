// A fake window for `AppController` tests: a scripted core answering `invoke`, the in-memory editor, real timers
// (bound, as App passes them) and DOM hooks that record what they are asked.
import { flushSync } from 'svelte'
import { fakeMount } from '../editor/mount.testing'
import type { AppEnv } from './app.svelte'
import { emptyOutput } from './emptyOutput.testing'
import type { SearchRow } from './search'
import type { BlockView, Command, ConfigView, Output, PageView, Request } from './types'

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
  /** The rows the search box chose (`ui.chooseRow`). */
  chosen: SearchRow[]
  /** How often the sidebar was asked to show (`ui.showSidebar`). */
  sidebarShown: number
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
    chosen: [],
    sidebarShown: 0,
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
    },
    timers: {
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      setInterval: globalThis.setInterval.bind(globalThis),
      clearInterval: globalThis.clearInterval.bind(globalThis),
    },
    now: () => w.clock,
    shell: {
      webviewZoom: () => Promise.resolve(),
      setZoom: () => Promise.resolve(),
      hiddenColumns: () => Promise.resolve({}),
      setHiddenColumns: () => Promise.resolve(),
    },
    ui: {
      chooseRow: (row) => void w.chosen.push(row),
      showSidebar: () => void w.sidebarShown++,
    },
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
