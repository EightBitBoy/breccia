// The shell's events (§9): other views and programs change pages too.
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow, type CloseRequestedEvent } from '@tauri-apps/api/window'
import { CONFIG_CHANGED, GIT_CHANGED, INDEX_CHANGED, NOTICES_ADDED, PAGE_CHANGED, PAGE_REMOVED, PAGE_RENAMED, PAGES_SAVED, SESSION_RECOVERED, TRAY_EXIT, TREE_CHANGED } from '../api'
import type { ConfigView, GitView, IndexProgress, Notice, PageView, RecoveredEvent, RenameView, TreeView } from './types'

export interface ShellHandlers {
  pageChanged(p: PageView): void
  treeChanged(t: TreeView): void
  pageRemoved(key: string): void
  notices(ns: Notice[]): void
  indexChanged(p: IndexProgress): void
  gitChanged(v: GitView): void
  pageRenamed(r: RenameView): void
  configChanged(c: ConfigView): void
  pagesSaved(keys: string[]): void
  closeRequested(e: CloseRequestedEvent): Promise<void>
  /** "Exit" in the tray menu. */
  trayExit(): void
  /** The core recovered from an internal error. */
  recovered(e: RecoveredEvent): void
}

/**
 * Listens to the shell's events; `ready` settles once every listener is registered, so a
 * command sent after it hears every event it gives rise to.
 */
export function listenShell(h: ShellHandlers): { ready: Promise<void>; stop(): void } {
  const unlisten = listen<PageView>(PAGE_CHANGED, (e) => h.pageChanged(e.payload))
  const others = [
    listen<TreeView>(TREE_CHANGED, (e) => h.treeChanged(e.payload)),
    listen<string>(PAGE_REMOVED, (e) => h.pageRemoved(e.payload)),
    listen<Notice[]>(NOTICES_ADDED, (e) => h.notices(e.payload)),
    listen<IndexProgress>(INDEX_CHANGED, (e) => h.indexChanged(e.payload)),
    listen<GitView>(GIT_CHANGED, (e) => h.gitChanged(e.payload)),
    listen<RenameView>(PAGE_RENAMED, (e) => h.pageRenamed(e.payload)),
    listen<ConfigView>(CONFIG_CHANGED, (e) => h.configChanged(e.payload)),
    listen<string[]>(PAGES_SAVED, (e) => h.pagesSaved(e.payload)),
    listen<null>(TRAY_EXIT, () => h.trayExit()),
    listen<RecoveredEvent>(SESSION_RECOVERED, (e) => h.recovered(e.payload)),
    getCurrentWindow()
      .onCloseRequested(h.closeRequested)
      .catch((e) => {
        console.error('no close hook', e)
        return () => {}
      }),
  ]
  return {
    ready: Promise.all([unlisten, ...others]).then(() => {}),
    stop() {
      for (const u of [unlisten, ...others]) u.then((f) => f())
    },
  }
}
