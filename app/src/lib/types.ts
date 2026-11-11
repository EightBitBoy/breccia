// Mirrors the wire contract of crates/core/src/session (command.rs, view.rs).
// Block IDs are numbers; `at` and `Focus.at` are UTF-8 byte offsets.

export type BlockId = number

export interface BlockView {
  id: BlockId
  depth: number
  text: string
  html: string
  /** The task state keyword, if the block has one. */
  state: string | null
  /** Whether that state counts as finished. */
  finished: boolean
  hasChildren: boolean
  /** Journal blocks only: the page the block's first topic link goes to. */
  topic?: string
  /** Journal blocks only: that page's color (a name, `hue <h>` or `hue <h> vivid <v>`), when it has one. */
  color?: string
}

export interface PageView {
  key: string
  name: string
  kind: 'journal' | 'page'
  /** The long date for a journal, else the name. */
  title: string
  preambleHtml: string
  blocks: BlockView[]
  /** Whether the page has a file; a moved page's file may be empty. */
  hasFile: boolean
  /** The page's own color (a name, `hue <h>` or `hue <h> vivid <v>`); absent for a journal or an uncolored page. */
  color?: string
  /** Journals only: the links and tags of its blocks whose page can be given a color; absent when there are none. */
  targets?: TargetView[]
}

/** A link or tag in a journal whose page can be given a color. */
export interface TargetView {
  /** The link's key, as the rendered anchor's `data-page` holds it. */
  raw: string
  kind: 'link' | 'tag'
  /** The page the link goes to. */
  key: string
  name: string
  /** That page's color (a name, `hue <h>` or `hue <h> vivid <v>`); absent when it has none. */
  color?: string
}

/** Where the caret goes: a block and a UTF-8 byte offset in its text. */
export interface Focus {
  id: BlockId
  at: number
}

export interface FolderView {
  /** The open notes folder; null while no folder is open. */
  path: string | null
  generation: number
}

export interface StateView {
  keyword: string
  color: string
  finished: boolean
  inCycle: boolean
}

export interface ConfigView {
  states: StateView[]
  boards: BoardSummary[]
  archiveAfterDays: number
  /** `[board] auto_archive`: finished tasks are archived by themselves. */
  autoArchive: boolean
  git: GitSettings
  /** Goes up with every reload and write of config.toml; a change that writes it carries the one it was made from. */
  version: number
}

export interface GitSettings {
  enabled: boolean
  commitDelayMinutes: number
  pullIntervalMinutes: number
}

/** How much of the notes uses a state (`states.usage`). */
export interface StateUsage {
  keyword: string
  blocks: number
  pages: number
}

export interface CardView {
  id: BlockId
  page: string
  pageName: string
  pageKind: 'journal' | 'page'
  source: string
  html: string
  blocks: BlockView[]
  subtasksDone: number
  subtasksTotal: number
  parent: string | null
  done: string | null
}

export interface ColumnView {
  keyword: string
  color: string
  finished: boolean
  cards: CardView[]
}

export interface BoardView {
  index: number
  name: string
  columns: ColumnView[]
  unknown: string[]
}

export interface BoardSummary {
  name: string
  columns: string[]
}

export type SaveFailReason = 'changedOnDisk' | 'pathTaken' | 'io'

export type Notice =
  | { kind: 'loadWarning'; message: string }
  | { kind: 'saveFailed'; page: string; reason: SaveFailReason; message: string }
  | { kind: 'refused'; message: string }
  /** A quiet note about something Breccia did by itself. */
  | { kind: 'info'; message: string }
  | {
      kind: 'conflict'
      page: string
      block: BlockId
      mine: string
      /** The disk text; null if another program deleted the block. */
      theirs: string | null
      message: string
    }

/**
 * `session:recovered`: the core recovered from an internal error. `reopened`: the notes were read again from disk,
 * or no folder is open any more; the window must reload. Else the session was kept because of unsaved edits.
 */
export interface RecoveredEvent {
  reopened: boolean
  notice: Notice
}

export type TreeNode =
  | { kind: 'folder'; name: string; path: string; children: TreeNode[] }
  | {
      kind: 'page'
      key: string
      name: string
      /** No file and no text of its own: only `[[…]]` links go to it. Absent means false. */
      linkedOnly?: boolean
    }

export interface JournalDay {
  key: string
  title: string
}

export interface JournalMonth {
  month: number
  label: string
  days: JournalDay[]
}

export interface JournalYear {
  year: number
  months: JournalMonth[]
}

/** The sidebar's tree: folders and pages, and the journals by date. */
export interface TreeView {
  pages: TreeNode[]
  journals: JournalYear[]
  /** The sidebar's Tags section: every name used as `#tag`, sorted by name. */
  tags: TagView[]
}

/** A name used as `#tag`. */
export interface TagView {
  key: string
  /** The page's name when there is a page, else the tag as first written. */
  name: string
  /** The blocks that have the tag. */
  count: number
  /** No file and no text of its own. */
  linkedOnly: boolean
}

export interface DirtyView {
  key: string
  title: string
}

export interface RefView {
  /** The ancestors of the root, outermost first. */
  crumbs: string[]
  /** The root and its subtree, `depth` relative to the root. */
  blocks: BlockView[]
}

export interface RefGroup {
  page: string
  title: string
  kind: 'journal' | 'page'
  refs: RefView[]
}

/** The linked references to a page. */
export interface RefsView {
  key: string
  count: number
  groups: RefGroup[]
}

export interface FeedView {
  /** Today's key; also the first day. */
  today: string
  /** Newest first. */
  days: JournalDay[]
}

export interface NameView {
  key: string
  name: string
  exists: boolean
}

/** A row of the All pages table (`pages.table`). */
export interface PageRowView {
  key: string
  name: string
  /** The long date for a journal, else the name. */
  title: string
  kind: 'journal' | 'page'
  /** `/`-joined folder under pages/; '' at top level and for journals. */
  folder: string
  /** Milliseconds since 1970; null when unknown. */
  created: number | null
  edited: number | null
  linkedFrom: number
  linksOut: number
  /** No file and no text of its own: only `[[…]]` links go to it. */
  linkedOnly: boolean
}

export interface Output {
  page: PageView | null
  focus: Focus | null
  notices: Notice[]
  folder: FolderView | null
  config: ConfigView | null
  refs: RefsView | null
  names: NameView[] | null
  tree: TreeView | null
  /** Pages other than `page` that the command changed. */
  changed: PageView[]
  /** Keys of pages that are gone. */
  removed: string[]
  dirty: DirtyView[] | null
  feed: FeedView | null
  /** Pages a query returned without showing them (`pages.get`). */
  pages: PageView[]
  board: BoardView | null
  /** The All pages rows (`pages.table`). */
  table: PageRowView[] | null
  /** The matches of `search.query`. */
  search: SearchView | null
  /** Pages another program re-keyed (`files.changed`). */
  renamed: RenameView[]
  /** The Git state (`git.status`, `git.sync`, `git.init`). */
  git: GitView | null
  /** The state usage (`states.usage`). */
  usage: StateUsage[] | null
  /** Pages that did not load, so are not counted (with `usage`). */
  usageSkipped: number | null
  /** The network view's pages and links (`graph.get`). */
  graph: GraphView | null
  /** Pages whose earlier save failed and whose file now holds Breccia's text. */
  saved: string[]
  /** How many other pages a rename would rewrite (`page.renameReach`). */
  reach?: number | null
  /** One page of the notes folder's commits (`git.log`). */
  gitLog?: GitLogView | null
  /** The archived tasks (`archive.list`). */
  archive?: ArchivedView[] | null
  /** One journal day for the date picker (`journal.day`). */
  day?: DateView | null
}

/** A row of the Archive view (`archive.list`). */
export interface ArchivedView {
  id: BlockId
  page: string
  pageName: string
  pageKind: 'journal' | 'page'
  /** `29 Oct 2026` for a journal, else the page name. */
  source: string
  /** The first line without its keyword, links shown as their text. */
  text: string
  state: string
  color: string
  /** `YYYY-MM-DD`, with ` HH:MM` when the done line has a time; or null. */
  done: string | null
  archived: string | null
  /** `YYYY-MM-DD HH:MM` (or the day alone) from `created::`, or null. */
  created: string | null
  /** How long the task took (`3 days`), when both times are known; or null. */
  took: string | null
}

export interface GraphNode {
  key: string
  name: string
  title: string
  kind: 'journal' | 'page'
  folder: string
  linkedFrom: number
  exists: boolean
  tag: boolean
  tagOnly: boolean
}

export interface GraphView {
  /** Sorted by key. */
  nodes: GraphNode[]
  /** `[from, to]` node indexes, directed, sorted, no repeats. */
  edges: [number, number][]
  /** Saved positions aligned with `nodes`. */
  positions: ([number, number] | null)[]
}

/** One dot position for `graph.saveLayout`. */
export interface NodePosition {
  key: string
  x: number
  y: number
}

export interface StateInput {
  keyword: string
  color: string
  finished: boolean
  inCycle: boolean
}

export interface StateRename {
  from: string
  to: string
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
}

/** One entry of the recent-folders list. */
export interface RecentFolder {
  path: string
  name: string
  exists: boolean
}

/** A command that did not run. `code` is camelCase and stable. */
export interface CommandError {
  code: string
  message: string
}

export type Command =
  | { type: 'folder.open'; path: string }
  | { type: 'folder.create'; path: string }
  | { type: 'folder.status' }
  | { type: 'folder.tree' }
  | { type: 'config.get' }
  | { type: 'page.today' }
  | { type: 'page.open'; name: string; link?: boolean }
  | { type: 'page.create'; name: string; folder: string }
  | { type: 'dir.create'; path: string }
  | { type: 'page.rename'; key: string; name: string }
  | { type: 'page.move'; key: string; folder: string }
  | { type: 'page.delete'; key: string }
  /** `null` removes the page's color. */
  | { type: 'page.setColor'; key: string; color: string | null }
  | { type: 'dir.rename'; path: string; to: string }
  | { type: 'dir.delete'; path: string }
  | { type: 'page.refs'; key: string }
  /** How many other pages a rename of `key` to `name` would rewrite; answers in `reach`. */
  | { type: 'page.renameReach'; key: string; name: string }
  | { type: 'pages.list' }
  | { type: 'files.changed'; paths: string[] }
  | { type: 'session.dirty' }
  | { type: 'page.get'; key: string }
  | { type: 'journal.feed' }
  | { type: 'pages.get'; keys: string[] }
  | { type: 'page.reload'; key: string }
  | { type: 'page.overwrite'; key: string }
  | { type: 'block.insert'; page: string; after: BlockId | null; text: string }
  | { type: 'block.setText'; id: BlockId; text: string }
  | { type: 'block.split'; id: BlockId; at: number }
  | { type: 'block.merge'; id: BlockId }
  | { type: 'block.paste'; id: BlockId; at: number; text: string }
  | { type: 'block.cycleState'; id: BlockId }
  | { type: 'block.stepState'; id: BlockId }
  /** The block's editor closed; `before` is its state when the editor opened. */
  | { type: 'block.settle'; id: BlockId; before: string | null }
  // `keyword` must always be present: omitting it clears the state on the Rust side.
  | { type: 'blocks.setState'; ids: BlockId[]; keyword: string | null }
  | { type: 'blocks.indent'; ids: BlockId[] }
  | { type: 'blocks.outdent'; ids: BlockId[] }
  | { type: 'blocks.moveUp'; ids: BlockId[] }
  | { type: 'blocks.moveDown'; ids: BlockId[] }
  | { type: 'blocks.delete'; ids: BlockId[]; keepOne?: boolean }
  | { type: 'block.delete'; id: BlockId }
  | { type: 'history.undo'; page: string }
  | { type: 'history.redo'; page: string }
  | { type: 'board.get'; index: number }
  /** A drop on a board: card `id` into column `keyword`, above card `before` (null: at the end); sets the state and `priority::`. */
  | { type: 'board.place'; id: BlockId; keyword: string; before: BlockId | null }
  /** Every archived task, for the Archive view; answers in `archive`. */
  | { type: 'archive.list' }
  /** Archives the due finished tasks while `[board] auto_archive` is on; `editing` is left for a later run. */
  | { type: 'archive.auto'; editing: BlockId | null }
  | { type: 'boards.set'; boards: BoardSummary[]; version: number }
  | { type: 'states.usage' }
  | { type: 'graph.get' }
  | { type: 'graph.saveLayout'; positions: NodePosition[] }
  | { type: 'states.set'; states: StateInput[]; renames: StateRename[]; version: number }
  | { type: 'config.setGit'; enabled: boolean; commitDelayMinutes: number; pullIntervalMinutes: number; version: number }
  | { type: 'config.setBoard'; archiveAfterDays: number; autoArchive?: boolean; version: number }
  | { type: 'board.archive'; keyword: string }
  | { type: 'blocks.setArchived'; ids: BlockId[]; archived: boolean }
  | { type: 'journal.append'; text: string }
  | { type: 'pages.table' }
  | { type: 'search.query'; text: string }
  /** The "Go to" line of journal day `key` (`YYYY-MM-DD`), as a typed date gets it; answers in `day`. */
  | { type: 'journal.day'; key: string }
  | { type: 'page.show'; key: string }
  | { type: 'git.status' }
  | { type: 'git.sync' }
  | { type: 'git.init' }
  | { type: 'git.log'; skip: number; limit: number }

export interface Request {
  generation: number
  command: Command
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

/** A piece of a result line: a match (`hit`) or the text around it. */
export interface Segment {
  text: string
  hit: boolean
}

export interface SearchHit {
  id: BlockId
  state: string | null
  segments: Segment[]
}

export interface SearchGroup {
  page: string
  /** The long date for a journal, else the name. */
  title: string
  kind: 'journal' | 'page'
  hits: SearchHit[]
}

export interface DateView {
  key: string
  title: string
  inFeed: boolean
}

/** A page whose key changed because its file was edited outside. */
export interface RenameView {
  from: string
  to: string
}

export type GitState = 'off' | 'noGit' | 'notRepo' | 'ready' | 'working' | 'problem'

export interface ProblemView {
  /** The problem's tag: `conflict`, `identity`, `unreachable`, … */
  kind: string
  red: boolean
  message: string
}

/** The Git state of the notes folder (`git:changed` and `Output.git`). Times are ms since 1970. */
export interface GitView {
  state: GitState
  top: string | null
  remote: string | null
  ahead: number
  lastCommit: number | null
  lastSync: number | null
  head: string | null
  problem: ProblemView | null
}

/** One commit of the Git history view. */
export interface LogEntry {
  hash: string
  /** The first 7 characters of `hash`. */
  short: string
  /** The author date, ms since 1970. */
  timeMs: number
  author: string
  /** The first line of the message. */
  subject: string
  /** False when the remote does not have the commit yet; always true without a remote. */
  pushed: boolean
}

/** The answer to `git.log`: `limit` commits after the newest `skip`, newest first. */
export interface GitLogView {
  entries: LogEntry[]
  /** Whether older commits follow. */
  more: boolean
  skip: number
}

/** The answer to `search.query`. */
export interface SearchView {
  /** The text sent. */
  query: string
  /** The free words as typed, joined by one space. */
  text: string
  /** Whether the text holds a state or a link filter. */
  filtered: boolean
  date: DateView | null
  groups: SearchGroup[]
  /** More blocks matched than are listed. */
  more: boolean
}

/** The shell's `index:changed`: how far the background build of the search index is. */
export interface IndexProgress {
  done: number
  total: number
  /** The folder generation the build belongs to. */
  generation: number
}
