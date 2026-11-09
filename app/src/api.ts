// The Tauri side of the command client. Everything the UI changes goes through
// one named command (`lib/api.ts`); these are the few raw calls besides it.
import { invoke } from '@tauri-apps/api/core'
import type { CommandError, Notice, Output, Request, UiState, RecentFolder } from './lib/types'

/**
 * The event the shell emits with every page a command returns (§9's `page.changed`;
 * Tauri event names allow no `.`).
 */
export const PAGE_CHANGED = 'page:changed'

/** Sends one request to the core's `run` command. */
export function invokeRun(request: Request): Promise<Output> {
  return invoke<Output>('run', { request })
}

/** What the startup folder open has to tell the user (load warnings, or why it failed), once. */
export function startupNotices(): Promise<Notice[]> {
  return invoke<Notice[]>('startup_notices')
}

function isCommandError(e: unknown): e is CommandError {
  return typeof e === 'object' && e !== null && 'code' in e && 'message' in e
}

/** The stable code of a refused command, or null for any other failure. */
export function errorCode(e: unknown): string | null {
  return isCommandError(e) ? e.code : null
}

export function errorMessage(e: unknown): string {
  if (typeof e === 'object' && e !== null && 'message' in e) return String((e as CommandError).message)
  return String(e)
}

/** The shell emits these (names allow no `.`). */
export const TREE_CHANGED = 'tree:changed'
export const PAGE_REMOVED = 'page:removed'
export const NOTICES_ADDED = 'notices:added'
/** How far the background build of the search index is (`{ done, total }`). */
export const INDEX_CHANGED = 'index:changed'
/** A page another program re-keyed (a `RenameView`). */
export const PAGE_RENAMED = 'page:renamed'
/** The Git state changed (a `GitView`). */
export const GIT_CHANGED = 'git:changed'
/** Settings (states, boards) a Git pull brought (a `ConfigView`). */
export const CONFIG_CHANGED = 'config:changed'
/** Keys of pages saved after a failed save (`string[]`): their "could not be saved" notice goes. */
export const PAGES_SAVED = 'pages:saved'

/** The sidebar's saved width and visibility (machine-local, in settings.json). */
export function uiState(): Promise<UiState> {
  return invoke<UiState>('ui_state')
}

export function setUiState(state: UiState): Promise<void> {
  return invoke<void>('set_ui_state', { state })
}

/** Saves the zoom level in percent (machine-local). */
export function setZoom(percent: number): Promise<void> {
  return invoke<void>('set_zoom', { percent })
}

/** Saves where the sidebar lists Journals: top, bottom or inline (machine-local). */
export function setJournalsAt(at: string): Promise<void> {
  return invoke<void>('set_journals_at', { at })
}

/** Saves the chosen theme; null follows the operating system. */
export function setTheme(theme: string | null): Promise<void> {
  return invoke<void>('set_theme', { theme })
}

/** The recent folders, most recent first, each with whether it still exists. */
export function recentFolders(): Promise<RecentFolder[]> {
  return invoke<RecentFolder[]>('recent_folders')
}

export function forgetFolder(path: string): Promise<void> {
  return invoke<void>('forget_folder', { path })
}

/** Whether the app lives in the tray (Windows): closing the window then hides it. */
export function trayEnabled(): Promise<boolean> {
  return invoke<boolean>('tray_enabled')
}

/** The tray's "Exit" was chosen: the app closes for real (`tray:exit` on the wire). */
export const TRAY_EXIT = 'tray:exit'

/** Whether the `git` command can be started on this computer. */
export function gitInstalled(): Promise<boolean> {
  return invoke<boolean>('git_installed')
}

/** The running program's version (what `@tauri-apps/api/app`'s `getVersion` calls). */
export function getAppVersion(): Promise<string> {
  return invoke<string>('plugin:app|version')
}

/** The hidden board columns saved on this PC for notes folder `folder`: board name to state keywords. */
export function hiddenColumns(folder: string): Promise<unknown> {
  return invoke<unknown>('hidden_columns', { folder })
}

/** Saves the hidden board columns of notes folder `folder`, all its boards at once. */
export function setHiddenColumns(folder: string, boards: Record<string, string[]>): Promise<void> {
  return invoke<void>('set_hidden_columns', { folder, boards })
}
