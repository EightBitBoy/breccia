// The wire contract with the core is generated from crates/core (`generated.ts`, written by `just types`); this file
// re-exports it under the names the window uses, next to the shell's own types and the window's.
// Block IDs are numbers; `at` and `Focus.at` are UTF-8 byte offsets.

import type { Command as CoreCommand, GitSettingsView, NameEntry, Notice, TagEntry } from './generated'

export type {
  Answer,
  ArchivedView,
  BlockId,
  BlockView,
  Board,
  BoardSummary,
  BoardView,
  CardView,
  ColumnView,
  CommandError,
  ConfigView,
  DailyView,
  DateView,
  DirtyView,
  ErrorCode,
  FeedView,
  Focus,
  FolderView,
  GitLogView,
  GitState,
  GitView,
  GraphNode,
  GraphView,
  JournalDay,
  JournalMonth,
  JournalYear,
  LogEntry,
  NodePosition,
  Notice,
  Output,
  PageColor,
  PageRowView,
  PageView,
  PageViewKind,
  ProblemView,
  RefGroup,
  RefsView,
  RefView,
  RenameView,
  SaveFailReason,
  SearchGroup,
  SearchHit,
  SearchView,
  Segment,
  StateInput,
  StateRename,
  StateUsage,
  StateView,
  TargetKind,
  TargetView,
  TreeNode,
  TreeView,
  UsageView,
} from './generated'

/** A name the page picker offers (`pages.list`). */
export type NameView = NameEntry
/** A name used as `#tag` (the sidebar's Tags section). */
export type TagView = TagEntry
export type GitSettings = GitSettingsView

/** The shell's own commands: the Git item and the Git history view. */
export type ShellCommand =
  | { type: 'git.status' }
  | { type: 'git.sync' }
  | { type: 'git.init' }
  | { type: 'git.log'; skip: number; limit: number }

/** Every command the window sends through `run`: the core's and the shell's. */
export type Command = CoreCommand | ShellCommand

export interface Request {
  generation: number
  command: Command
}

/**
 * `session:recovered`: the core recovered from an internal error. `reopened`: the notes were read again from disk,
 * or no folder is open any more; the window must reload. Else the session was kept because of unsaved edits.
 */
export interface RecoveredEvent {
  reopened: boolean
  notice: Notice
}

/** The shell's `index:changed`: how far the background build of the search index is. */
export interface IndexProgress {
  done: number
  total: number
  /** The folder generation the build belongs to. */
  generation: number
}

/** Machine-local window state kept by the shell. */
export interface UiState {
  sidebarWidth: number | null
  sidebarHidden: boolean
  /** The board's column width in px; null (or missing) lets the columns fill the window. */
  boardColumnWidth?: number | null
  /** The chosen theme's id; null follows the operating system. `setUiState` leaves it alone. */
  theme?: string | null
  /** The zoom level in percent; null or missing is 100. `setUiState` leaves it alone. */
  zoomPercent?: number | null
  /** Where the sidebar lists Journals: top, bottom or inline; null or missing is bottom. `setUiState` leaves it alone. */
  journalsAt?: string | null
  /** Show a web address without `https://`; null or missing is off. `setUiState` leaves it alone. */
  hideLinkScheme?: boolean | null
  /** Show a long web address cut short; null or missing is off. `setUiState` leaves it alone. */
  shortenLinks?: boolean | null
  /** Show a web address without a `/` at the end; null or missing is off. `setUiState` leaves it alone. */
  trimLinkSlash?: boolean | null
}

/** One entry of the recent-folders list. */
export interface RecentFolder {
  path: string
  name: string
  exists: boolean
}

export interface NoticeAction {
  label: string
  run: () => void
}

/** A notice as shown: its text, and the actions it offers. */
export interface Item {
  id: number
  /** What the notice is about (`noticeKey`): one notice per key. */
  key: string
  text: string
  /** A conflict's two versions; `theirs` is null when there is no disk version to offer. */
  detail?: { mine: string; theirs: string | null }
  error?: boolean
  /** Holds text the core never got (`isUnsent`): closing asks first. */
  unsent?: boolean
  /** A conflict offering Keep mine or Use theirs: its page's key (a folder switch waits for the choice). */
  page?: string
  /** A "could not be saved" notice: its page's key (the notice goes once the page is saved). */
  unsavedPage?: string
  actions?: NoticeAction[]
}
