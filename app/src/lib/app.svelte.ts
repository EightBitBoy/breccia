// The window's controller: its state, the one place a command's answer is applied (`apply`), and what a change made
// outside the window does (`shellHandlers`). App.svelte builds its `AppEnv` from Tauri and the DOM and renders it.
import { untrack } from 'svelte'
import { SvelteSet } from 'svelte/reactivity'
import type { Window } from '@tauri-apps/api/window'
import type * as Api from '../api'
import { errorCode, errorMessage } from '../api'
import type { mountEditor } from '../editor/blockEditor'
import { EditorHost } from '../editor/host.svelte'
import type { MenuView } from '../editor/menu'
import { MultiSelect } from '../editor/multiSelect.svelte'
import { AllPages } from './allPages.svelte'
import { answerOf } from './answer'
import { createClient, flushBeforeClose, type Client } from './api'
import { Archive } from './archive.svelte'
import { AutoArchive } from './autoArchive'
import { addedText, cardBlocks, cardFromView, cardOf, cardRoot, shownAfterDelete } from './board'
import { Boards } from './boards.svelte'
import { closeCheck } from './close'
import { ConfigStore } from './config.svelte'
import { Dailies } from './dailies.svelte'
import { NOT_A_TASK } from './due'
import { dueKeyAction } from './dueKey'
import { duePick } from './duePick.svelte'
import { editableBlocks, editablePageOf, walkOrder, type EditableView } from './editable'
import { InFlight, Refreshes } from './external'
import { isNewFolder } from './folder'
import { missingFolder, pickFolder, switchCheck } from './folderSwitch'
import { JustRenamed, followRename, removalFor } from './followRename'
import { gitClick } from './git'
import { GitStatus } from './git.svelte'
import { historyItem, historyStale } from './gitLog'
import { GitLog } from './gitLog.svelte'
import { HiddenColumns } from './hiddenColumns.svelte'
import { Journal } from './journal.svelte'
import { historyKey, isDatePickerKey, isHelpKey, isNewPageKey, isSearchKey, isSettingsKey, navKey } from './keys'
import type { LinkDisplay } from './linkDisplay'
import { linkDisplay } from './linkDisplay.svelte'
import { linkDrop, type LinkSpot } from './linkDrop'
import { headingBlock, linkClick, linkHeading } from './links'
import { MainArea } from './mainArea.svelte'
import { placeOfView, type NavFocus, type NavPlace } from './nav'
import { Nav, type NavEntry } from './nav.svelte'
import { Network } from './network.svelte'
import { NoticeCenter } from './noticeCenter.svelte'
import { Overlays } from './overlay.svelte'
import { PageFlows } from './pageFlows.svelte'
import { folderOf } from './pageOps'
import { isMac } from './platform'
import { Recovery } from './recovery'
import { RefsRefresh, pageChanged, pageOfBlock, patchRefs } from './refs'
import { extendsTo, route, selectionPageOf, type Route } from './route'
import { saveItem } from './saveStatus'
import type { SearchRow } from './search'
import { Search } from './search.svelte'
import { SettingsScreen, type SettingsSection } from './settings.svelte'
import type { ShellHandlers } from './shellEvents'
import { helpItem, indexItem, statusAction, themeItem, type StatusAction } from './status'
import { clampWidth, loadLayout } from './sidebarLayout'
import { startupSequence } from './startup'
import { StatusItems } from './status.svelte'
import { applyTheme, storedTheme, type ThemeChoice } from './theme'
import { wheelTheme } from './themeWheel'
import { ancestorsOf, visible } from './tree'
import type { JournalsAt, Row } from './treeRows'
import { isNewer } from './treeVersion'
import type { BlockId, BoardSummary, CardView, Command, ConfigView, DateView, Notice, Output } from './types'
import type { PageView, RecentFolder, RefsView, RenameView, Request, TreeView } from './types'
import { ViewUndo } from './viewUndo'
import { WheelSteps, zoomItem, zoomKey } from './zoom'
import { Zoom } from './zoom.svelte'

/** The machine-settings and shell calls of `app/src/api.ts` the controller makes. */
type ShellCalls = Pick<
  typeof Api,
  | 'setZoom'
  | 'hiddenColumns'
  | 'setHiddenColumns'
  | 'uiState'
  | 'setUiState'
  | 'setTheme'
  | 'setJournalsAt'
  | 'setLinkDisplay'
  | 'recentFolders'
  | 'forgetFolder'
  | 'getAppVersion'
  | 'logFolder'
  | 'openLogFolder'
  | 'gitInstalled'
  | 'trayEnabled'
  | 'startupOpen'
  | 'startupNotices'
>

/** What the controller takes from the window: Tauri, the DOM and the timers, injected so tests run without them. */
export interface AppEnv {
  /** `invokeRun`: one request to the core. */
  invoke(req: Request): Promise<Output>
  /** The editor host's mount (`mountEditor`), injected for tests. */
  mountEditor: typeof mountEditor
  dom: {
    /** `.main`, which scrolls the page or the feed; undefined while it is not rendered. */
    scroller(): HTMLElement | undefined
    /** The feed's day at the top of the main area (`topDayOf` over the rendered days). */
    topDay(): string | null
    /** Block `id` scrolled into the middle of the view, when it is rendered. */
    scrollToBlock(id: BlockId): void
    /** Svelte's `tick`: the DOM has caught up with the state. */
    tick(): Promise<void>
    /** `data-busy` on the document, for the e2e test (`settled`). Not shown to the user. */
    setBusy(busy: boolean): void
    /** The editor's slot in block `id` (`[data-block-id="…"] .editor-slot`). */
    slot(id: BlockId): HTMLElement | null
    /** `<html>`: its `data-theme` is the theme shown. */
    root(): { dataset: DOMStringMap }
    /** Key `e` belongs to a text field, a dialog or a menu (it has the key, or one is shown): not to the view. */
    keyTaken(e: KeyboardEvent): boolean
  }
  /** Bound: WebView2 refuses the window's timer functions called as methods of another object. */
  timers: {
    setTimeout: typeof setTimeout
    clearTimeout: typeof clearTimeout
    setInterval: typeof setInterval
    clearInterval: typeof clearInterval
  }
  /** The time in ms (`Date.now`). */
  now(): number
  /** The shell's calls (`app/src/api.ts`), and the webview's own zoom factor (1 is 100 %). */
  shell: ShellCalls & { webviewZoom(factor: number): Promise<void> }
  /** The window itself (`getCurrentWindow()`). */
  window: Pick<Window, 'show' | 'unminimize' | 'setFocus' | 'hide' | 'destroy' | 'setTheme'>
  /** The system's folder dialog; null when cancelled. */
  pickFolder(): Promise<string | null>
  /** Opens a web address in the browser. */
  openUrl(url: string): Promise<void>
}

/** The views `leaveMainView` leaves the main area for. */
export type KeptView = 'feed' | 'board' | 'allPages' | 'archive' | 'dailies' | 'settings' | 'graph' | 'gitLog' | 'newPage'

export class AppController {
  folder = $state<string | null>(null)
  page = $state<PageView | null>(null)
  /** The linked references to the shown page, editable in place; null until loaded. */
  refs = $state<RefsView | null>(null)
  /** Blocks focused while editing in the references (Enter at a root's end): shown there until they reload. */
  readonly madeInRefs = new Set<BlockId>()
  tree = $state<TreeView | null>(null)
  /** Session-only folding: never written to files. */
  readonly folded = new SvelteSet<number>()
  /** The question asked before closing with unsaved pages, while it is open. */
  closing = $state<string | null>(null)
  /** The editor's caret menus while open: the slash menu and link completion (which wins). */
  slashMenu = $state<MenuView | null>(null)
  linkMenu = $state<MenuView | null>(null)
  /** A block highlighted briefly after the jump from a card. */
  flash = $state<BlockId | null>(null)
  /** Typed text not yet written (§7.13): in the typing pause, or sent and not yet answered. */
  unsavedText = $state(false)
  /** The date picker by the sidebar's Journal row is open. */
  pickerOpen = $state(false)
  /** Set when the slash menu's "Date…" opened the picker: a pick goes to the editor, not to the journal. */
  pickerInsert: ((key: string) => void) | null = null
  /**
   * The edited block or the selection a pointer press just left (a press on a sidebar row leaves it before the page
   * it opens is shown); null again at the next press or key.
   */
  pressFocus: NavFocus | null = null
  /** The generation of the folder the last `folder` answer named; null before the first. */
  lastGeneration: number | null = null
  /** The sidebar's width in px, and whether it is hidden; kept on this computer with the board's column width. */
  sidebarWidth = $state(clampWidth(null))
  sidebarHidden = $state(false)
  /** The board's column width in px; null lets the columns fill the window. */
  boardColumn = $state<number | null>(null)
  /** The startup sequence is over (`start`). */
  ready = $state(false)
  /** The folder the shell opens at startup, while the window waits for it ("Opening ‹folder›…"); null otherwise. */
  opening = $state<string | null>(null)
  /** The notes reload after an internal error (`Recovery`): the window is greyed out and takes no input but the zoom. */
  reloading = $state(false)
  /** The running program's version, fetched when Settings first opens; null until then or if that fails. */
  appVersion = $state<string | null>(null)
  private appVersionAsked = false
  /** The log file's folder (the tooltip of Settings' "Open log folder"), fetched when Settings first opens. */
  logDir = $state<string | null>(null)
  private logDirAsked = false
  /** Whether the `git` command exists on this computer, checked at startup; null until known. */
  hasGit = $state<boolean | null>(null)
  /** Whether the app lives in the tray (Windows): the close button hides the window, "Exit" in the tray quits. */
  private inTray = false
  /** The theme chosen on this computer. */
  theme = $state<ThemeChoice>('system')
  /** Where the sidebar lists Journals, chosen on this computer. */
  journalsAt = $state<JournalsAt>('bottom')
  /** The recent folders, newest first; loaded when Settings or the Welcome screen shows and after a switch. */
  recent = $state.raw<RecentFolder[]>([])
  /** A Back or Forward is under way (from the first await on), so a key repeat waits for nothing. */
  private going = false
  /** A folder switch is on its way: a second click waits for nothing and does nothing. */
  private switching = false
  /** The wheel over the status bar's theme button: one notch, one theme (as the Ctrl+wheel zoom counts notches). */
  private readonly themeSteps = new WheelSteps()

  /**
   * The dialog open over the window (the search box too); nothing opens without a folder or under the close question,
   * which is its own layer above every dialog.
   */
  readonly overlays: Overlays
  /** The folder's settings (`config.toml`) and the rules of their writes. */
  readonly config: ConfigStore
  /** Which screen the main area shows; the page, the feed, the board and the six screens register with it. */
  readonly area: MainArea
  /** The Settings screen in the main area (§7.12). */
  readonly settings: SettingsScreen
  /** Shell events of outside changes wait while a command runs, so its answer never overwrites a newer view. */
  readonly inFlight: InFlight
  readonly client: Client
  readonly host: EditorHost
  readonly sel: MultiSelect
  /** Short state along the bottom of the window (§7.13). */
  readonly status: StatusItems
  /** The zoom of the whole window: the webview's own zoom, kept per computer. */
  readonly zoom: Zoom
  /** Git's state; its item sits on the right of the status bar (§7.9). */
  readonly git: GitStatus
  readonly notices: NoticeCenter
  /**
   * After an internal error (`session:recovered`): one notice, the notes shown again from disk, and the refusals that
   * error caused stay quiet. Typed text still in the editor is sent first, so text the core did not take is shown to
   * copy.
   */
  readonly recovery: Recovery
  /** The titles of pages named by Keep mine / Use theirs notices, taken while the page is shown (for a refused switch). */
  readonly noticeTitles = new Map<string, string>()
  /** The board's and the journal's own changes, for `Ctrl Z` while no block is edited (spec §7.2). */
  readonly viewUndo = new ViewUndo()
  readonly journal: Journal
  /** Hidden board columns of the open folder, kept on this PC. */
  readonly hiddenCols: HiddenColumns
  /** The shown board and its open card. */
  readonly boards: Boards
  /**
   * Breccia archives finished tasks by itself: once a folder is loaded, every hour and after a change of the
   * setting. The run skips the block being edited and comes after typed text in the command queue.
   */
  readonly autoArchive: AutoArchive
  /** The All pages table; a failed load or reload is a notice (AllPages reports it). */
  readonly allPages: AllPages
  /** The Archive view; a failed load or reload is a notice. */
  readonly archiveView: Archive
  /** The Dailies: the list (for the view and the status bar) and the timers that start each day afresh. */
  readonly dailies: Dailies
  /** The Git history; `git.log` skips the command queue, so a slow log never holds typed text up. */
  readonly gitLog: GitLog
  /** The Graph screen (§7.11); a failed load is a notice. */
  readonly network: Network
  /** The quick search box (§7.8). */
  readonly search: Search
  /** The views shown this session, for Back and Forward; cleared with a new folder. */
  readonly nav = new Nav()
  /**
   * The shown page loaded again after another program changed it, through the command
   * queue. A page gone meanwhile is reported by its `page:removed`.
   */
  readonly reloads: Refreshes
  /** Loads the references again, but never under the editor while it is inside them. */
  readonly refreshRefs: RefsRefresh
  readonly flows: PageFlows
  /** Keys of pages another program renamed a moment ago; their removal is not news for the shown page. */
  readonly justRenamed: JustRenamed

  /** The feed's loaded days (null while no feed is shown); a new set only when the feed changes. */
  readonly days = $derived.by(() => this.journal.loaded())
  /** The place the main area shows; null between two views and for the untitled new page. */
  readonly here = $derived.by(() => this.place())
  /** The open folder's name, for the sidebar. */
  readonly folderName = $derived(this.folder ? (this.folder.split(/[\\/]/).filter(Boolean).pop() ?? this.folder) : '')

  constructor(private env: AppEnv) {
    const run = (cmd: Command) => this.client.run(cmd)
    const notify = (n: Notice) => this.notify(n)
    this.overlays = new Overlays(() => !this.folder || this.closing !== null)
    this.config = new ConfigStore({
      overlays: this.overlays,
      exec: (cmd, refused) => this.host.exec(cmd, refused),
      leave: () => this.host.leave(),
      flush: () => this.client.flush(),
      notify,
    })
    this.area = new MainArea()
    // The page's part: leaving it drops the page and its references.
    this.area.register('page', {
      left: () => {
        this.page = null
        this.refs = null
        this.madeInRefs.clear()
      },
    })
    this.settings = new SettingsScreen({ area: this.area, overlays: this.overlays })

    this.inFlight = new InFlight((f) => void env.timers.setTimeout(f, 0))
    this.client = createClient(this.inFlight.wrap((req) => env.invoke(req)), {
      onOutput: (out, cmd) => this.apply(out, cmd),
      onError: (e, cmd) => this.host.backgroundFailed(e, cmd),
      onUnsaved: (u) => void (this.unsavedText = u),
      onBusy: (b) => env.dom.setBusy(b),
    })
    env.dom.setBusy(false)

    this.host = new EditorHost(
      {
        client: this.client,
        blocks: () => editableBlocks(this.editable(), this.folded),
        order: (id) => walkOrder(this.editable(), this.folded, id),
        pageOf: (id) => editablePageOf(this.editable(), id),
        states: () => this.config.states,
        tags: () => (this.tree?.tags ?? []).map((t) => ({ key: t.key, name: t.name, exists: !t.linkedOnly })),
        notify,
        showMenu: (which, m) => (which === 'link' ? (this.linkMenu = m) : (this.slashMenu = m)),
        pickDate: (onpick) => {
          if (!this.overlays.may('pickDate')) return
          if (this.sidebarHidden) this.toggleSidebar() // the picker sits in the sidebar
          this.pickerInsert = onpick
          this.pickerOpen = true
        },
        // Ctrl D: the due calendar at the caret, on a task only (a plain block gets the note and keeps editing); nothing
        // while the search or a dialog is open, as Ctrl Shift D (`dueKeyAction`). Esc writes nothing and the calendar
        // gives the focus back to the editor, the caret where it was; a click outside leaves the focus to that click.
        pickDue: (id, caret) => {
          const act = dueKeyAction(this.host.blockOf(id), !this.overlays.may('pickDue'))
          if (act.kind === 'refuse') this.notify({ kind: 'refused', message: NOT_A_TASK })
          else if (act.kind === 'open') duePick.show(act.due, caret, (due) => void this.host.setDue(id, due))
        },
        selectWithNeighbour: (id, dir) => this.sel.selectWithNeighbour(id, dir),
        card: () => (this.area.is('board') ? cardBlocks(this.boards.card) : null),
        quiet: (code, cmd) => this.recovery.message(code, cmd, '') === null,
        mount: env.mountEditor,
        slot: (id) => env.dom.slot(id),
      },
      this.folded,
    )

    this.sel = new MultiSelect(
      {
        order: () => {
          const p = this.selectionPage()
          return p ? visible(p.blocks, this.folded).map((b) => b.id) : []
        },
        page: () => this.selectionPage(),
        states: () => this.config.states,
        editing: () => this.host.editingId !== null,
        leave: () => this.host.leave(),
        run: (cmd) => void this.host.exec(cmd),
        notify: (message) => this.notify({ kind: 'refused', message }),
      },
      isMac,
    )

    this.status = new StatusItems()
    this.zoom = new Zoom({ apply: (f) => env.shell.webviewZoom(f), save: (p) => env.shell.setZoom(p) })
    this.status.bind('zoom', () => zoomItem(this.zoom.percent))
    this.git = new GitStatus({ now: () => env.now() })
    this.status.bind('git', () => this.git.item)
    this.status.bind('save', () =>
      saveItem({
        folder: this.folder !== null,
        unsaved: this.unsavedText,
        failed: new Set(this.notices.items.flatMap((n) => (n.unsavedPage === undefined ? [] : [n.unsavedPage]))).size,
      }),
    )

    this.notices = new NoticeCenter({
      typingMark: () => this.host.typingMark(),
      resolveConflict: (block, text, show, since) => void this.host.resolveConflict(block, text, show, since),
      exec: (cmd) => void this.exec(cmd),
    })
    this.recovery = new Recovery({
      notify: (n) => this.notices.notify(n),
      leave: () => this.host.leave(),
      // Nothing that names a block of the old session stays shown: the new session numbers its blocks from 1 again.
      clear: () => {
        this.search.close()
        this.sel.clear()
        this.boards.close() // the open card too; its typed text is pending already (leave)
        this.archiveView.close()
        this.dailies.close()
        this.dailies.forget() // its ids are the old session's; the reload lists them again
        this.journal.close()
        this.pickerOpen = false // a pick after the reload would name a block of the old session
        duePick.close() // likewise
        this.area.leave('page')
        // A card just added with "+ Add" (its bare keyword only) is not deleted when it closes here, as it would be
        // when closed by hand: the line stays in today's journal (owner, plan 19 Q5). Finding it again after the
        // reload means matching its text, which could hit a line the user wrote (spec §2).
      },
      flush: () => this.client.flush(),
      reload: async () => {
        let refused = false
        await this.host.exec({ type: 'folder.status' }, () => (refused = true))
        if (refused) throw new Error('folder.status was refused')
        // No folder open any more: the Welcome screen shows.
        if (this.folder) await this.openFolder()
      },
      now: () => env.now(),
      reloading: (on) => void (this.reloading = on),
      unanswered: () => this.client.unanswered(),
      setTimeout: (f, ms) => env.timers.setTimeout(f, ms),
      clearTimeout: (t) => env.timers.clearTimeout(t as ReturnType<typeof setTimeout>),
    })

    this.journal = new Journal({ area: this.area, run, notify })
    this.hiddenCols = new HiddenColumns({
      load: (f) => env.shell.hiddenColumns(f),
      save: (f, b) => env.shell.setHiddenColumns(f, b),
    })
    this.boards = new Boards({
      area: this.area,
      run,
      notify,
      flush: () => this.client.flush(),
      home: () => void this.openJournal(),
    })
    this.autoArchive = new AutoArchive({
      run,
      editing: () => this.host.editingId,
      enabled: () => this.folder !== null && this.config.autoArchive,
    })
    this.allPages = new AllPages({ area: this.area, run, notify })
    this.archiveView = new Archive({ area: this.area, run, notify })
    this.dailies = new Dailies({
      area: this.area,
      run,
      notify,
      now: () => new Date(env.now()),
      setTimeout: env.timers.setTimeout,
      clearTimeout: env.timers.clearTimeout,
      setInterval: env.timers.setInterval,
      clearInterval: env.timers.clearInterval,
    })
    /** "Dailies 2 open" or "Dailies ✓" in the status bar; none without dailies. A click opens the view. */
    this.status.bind('dailies', () => (this.folder ? this.dailies.item : null))
    this.status.bind('help', () => (this.folder ? helpItem(this.overlays.is('help')) : null))
    this.gitLog = new GitLog({
      area: this.area,
      log: (skip, limit) => env.invoke({ generation: 0, command: { type: 'git.log', skip, limit } }),
    })
    this.status.bind('gitLog', () => historyItem(this.git.view, this.gitLog.shown))
    this.network = new Network({ area: this.area, run, notify })
    this.search = new Search({
      overlays: this.overlays,
      run,
      notify,
      choose: (row) => this.chooseRow(row),
      back: (id) => this.host.editAtEnd(id), // nothing when the block is gone
    })

    // Every new place is a step; the same place again is not.
    $effect(() => {
      const p = this.here
      untrack(() => this.nav.arrive(p))
    })

    this.reloads = new Refreshes((key) =>
      // A reload queued for the old folder is answered `stale` after a switch: nothing to show.
      this.host.exec({ type: 'page.get', key }, (code) => code === 'unknownPage' || code === 'stale'),
    )
    this.refreshRefs = new RefsRefresh({
      key: () => this.page?.key ?? null,
      busy: () => this.inRefs(this.host.editingId),
      // A page removed meanwhile is reported by its page:removed.
      run: (key) =>
        this.client.run({ type: 'page.refs', key }).catch((e) => {
          if (errorCode(e) !== 'unknownPage') this.refuse(e)
        }),
    })
    $effect(() => {
      void this.host.editingId // Once the editor leaves the references, a held refresh runs.
      untrack(() => this.refreshRefs.pump())
    })

    this.flows = new PageFlows({
      overlays: this.overlays,
      run,
      tree: () => this.tree,
      shown: () => this.page?.key ?? null,
      notify,
      home: () => this.openJournal(),
    })
    this.justRenamed = new JustRenamed(() => env.now())

    $effect(() => {
      if (!this.pickerOpen) this.pickerInsert = null
    })
    // A dialog or the search box coming up closes the picker; so do the close question and no folder.
    this.overlays.onOpen(() => (this.pickerOpen = false))
    $effect(() => {
      if (!this.folder || this.closing !== null) untrack(() => (this.pickerOpen = false))
    })
    // The list is read again whenever the Notes folder section or the Welcome screen comes into view.
    $effect(() => {
      if (this.ready && (this.settings.shown || !this.folder)) untrack(() => void this.loadRecent())
    })
    /** The theme button left of "?": its menu offers the Settings > Themes choices (`chooseTheme`). */
    this.status.bind('theme', () => (this.folder ? themeItem(this.theme) : null))
  }

  private place(): NavPlace | null {
    return placeOfView(this.area.view, {
      board: this.boards.index === null ? null : (this.config.boards[this.boards.index]?.name ?? null),
      feedDay: this.journal.at,
      page: this.page?.key ?? null,
    })
  }

  /** What the editor may touch: the open card on a board, the feed's loaded days, or the page and its references. */
  editable(): EditableView {
    return { board: this.area.is('board'), card: this.boards.card, feed: this.journal.feed, page: this.page, refs: this.refs }
  }

  notify(n: Notice): void {
    // Every view's refusals meet here: those an internal error caused say no more than its one notice.
    if (n.kind === 'refused') {
      const message = this.recovery.message(null, null, n.message)
      if (message === null) return
      n = { ...n, message }
    }
    if (n.kind === 'conflict' && this.page?.key === n.page) this.noticeTitles.set(n.page, this.page.title)
    this.notices.notify(n)
  }

  refuse(e: unknown): void {
    const message = this.recovery.message(errorCode(e), null, errorMessage(e))
    if (message !== null) this.notify({ kind: 'refused', message })
  }

  exec(cmd: Command): Promise<void> {
    return this.host.exec(cmd)
  }

  /** The view `Ctrl Z` and `Ctrl Shift Z` step while no block is edited: a board, the journal or a page; none elsewhere. */
  undoView(): string | null {
    switch (this.area.view.kind) {
      case 'board':
        return this.boards.index === null ? null : `board:${this.boards.index}`
      case 'feed':
        return 'journal'
      case 'page':
        return this.page ? `page:${this.page.key}` : null
      default:
        return null
    }
  }

  /** The edited block with its caret, else the selection; null when neither. */
  focusHere(): NavFocus | null {
    const host = this.host
    const id = host.editingId
    if (id !== null) {
      const at = host.editor?.id === id ? host.editor.ed.cursor16() : (host.blockOf(id)?.text.length ?? 0)
      return { kind: 'edit', id, at }
    }
    const { anchor, head } = this.sel
    return this.sel.ids.length && anchor !== null && head !== null ? { kind: 'select', anchor, head } : null
  }

  /**
   * The view shown is about to be left: its scroll position (in the feed, the day at the top) and its edited or
   * selected block (`focus`, read before the editor or the selection closes) go into its step.
   */
  rememberHere(focus: NavFocus | null = this.focusHere() ?? this.pressFocus): void {
    const scroller = this.env.dom.scroller()
    if (!scroller) return
    const top = this.journal.feed ? this.env.dom.topDay() : null
    this.nav.remember(scroller.scrollTop, top, focus)
  }

  /** Where multi-select works: the shown page, or in the feed the day of the edited or anchored block. */
  selectionPage(): PageView | null {
    return selectionPageOf(this.journal.feed, this.page, this.host.editingId ?? this.sel.anchor)
  }

  /** Whether `id` is a block in the linked references (not the page's own outline). */
  inRefs(id: BlockId | null): boolean {
    return id !== null && pageOfBlock(null, this.refs, id) !== null
  }

  isGroup(key: string): boolean {
    return this.refs?.groups.some((g) => g.page === key) ?? false
  }

  /** Brings the open editor in line with the shown text again. */
  reconcileShown(): void {
    this.host.reconcile(null).catch((e) => console.error('editor update failed', e))
  }

  /** The editor's text if it is on the open card's root block (`closeCard` then needs no flush). */
  private cardRootText(): string | undefined {
    const ed = this.host.editor
    return ed && ed.id === cardRoot(this.boards.card) ? ed.ed.text() : undefined
  }

  /** Closes the open card; settles once it is closed. */
  closeCard(): Promise<void> {
    if (!this.boards.card) return Promise.resolve()
    const rootText = this.cardRootText() // before `leave` drops the editor
    this.host.leave()
    return this.boards.closeCard(rootText)
  }

  /**
   * Leaves whatever the main area shows for view `keep`: closes the open card (a bare added card is deleted),
   * leaves the editor, leaves the shown view unless it is `keep`, clears the selection, and scrolls to the top.
   */
  async leaveMainView(keep: KeptView): Promise<void> {
    this.rememberHere() // before the scroll goes to the top
    await this.closeCard() // a card closing (Esc, a click outside) finishes on the board it belongs to
    this.host.leave()
    this.area.leaveFor(keep)
    // The feed shows only with its answer: one asked for and not yet answered is not wanted any more.
    if (keep !== 'feed') this.journal.close()
    this.sel.clear()
    const scroller = this.env.dom.scroller()
    if (scroller) scroller.scrollTop = scroller.scrollLeft = 0
  }

  /** The home view: the journal feed, scrolled to today. */
  async openJournal(): Promise<void> {
    await this.leaveMainView('feed')
    await this.journal.open()
  }

  /** The open folder's views: its settings, the dailies, the journal, the sidebar's tree, then the due archive. */
  async openFolder(): Promise<void> {
    await this.exec({ type: 'config.get' })
    // For the status bar too, so it is there before the view is opened.
    void this.dailies.load()
    await this.openJournal()
    await this.exec({ type: 'folder.tree' })
    // Once the folder is loaded, the tasks due are archived (the first run may archive many).
    void this.autoArchive.run()
  }

  // ---- keys -------------------------------------------------------------------

  /** The bubble phase's keys: the multi-select's, then `Ctrl Z` for the view (`viewHistoryKey`). */
  key(e: KeyboardEvent): void {
    if (this.reloading && !this.closing) return // `keyCapture` took it already
    this.sel.onKey(e)
    this.viewHistoryKey(e)
  }

  /**
   * `Ctrl Z` / `Ctrl Shift Z` (`Ctrl Y`) with no block edited or selected: on a page its last change, on a board or in
   * the journal the last change made there (spec §7.2). Never in a text field, a dialog, a menu or the search box.
   */
  private viewHistoryKey(e: KeyboardEvent): void {
    if (e.defaultPrevented || e.isComposing || this.host.editingId !== null || this.sel.ids.length) return
    const a = historyKey({ key: e.key, shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey, meta: e.metaKey }, isMac)
    if (a === null || !this.overlays.may('historyKey') || this.slashMenu || this.linkMenu) return
    if (this.env.dom.keyTaken(e)) return
    const view = this.undoView()
    if (view === null) return
    e.preventDefault()
    const type = a === 'undo' ? 'history.undo' : 'history.redo'
    const cmds: Command[] = view.startsWith('page:') ? [{ type, page: this.page!.key }] : this.viewUndo.step(view, a)
    for (const cmd of cmds) void this.exec(cmd)
  }

  /** Keys before anyone else (the editor included) sees them: the app-wide shortcuts. */
  keyCapture(e: KeyboardEvent): void {
    this.pressFocus = null
    const k = { key: e.key, shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey, meta: e.metaKey }
    const take = () => {
      e.preventDefault()
      e.stopPropagation()
    }
    // While the notes reload only the zoom works: the views are greyed out, and the help would open under the layer.
    // The close question takes its keys; Alt F4 still closes the window.
    if (this.reloading && !this.closing && !zoomKey(k, isMac) && !(k.alt && k.key === 'F4')) return take()
    if (isHelpKey(k)) {
      // Before the editor and before WebView2's own F1 (its help page).
      take()
      if (!e.repeat) this.toggleHelp()
      return
    }
    // While the startup folder opens, only the help and the zoom keys work: there is nothing to open yet.
    if (this.opening !== null && !zoomKey(k, isMac)) return
    if (isDatePickerKey(k, isMac)) {
      // Before the editor, so it works while a block is edited.
      take()
      if (!e.repeat) this.togglePicker()
      return
    }
    const n = navKey(k, isMac)
    if (n) {
      // Before the editor (its Alt ← moves by syntax unit), so it works while a block is edited.
      take()
      void this.go(n)
      return
    }
    const z = zoomKey(k, isMac)
    if (z) {
      take()
      if (z === 'reset') void this.zoom.reset()
      else void this.zoom.step(z === 'in' ? 1 : -1)
      return
    }
    const searchKey = isSearchKey(k, isMac)
    const newPageKey = isNewPageKey(k, isMac)
    if (!searchKey && !newPageKey && !isSettingsKey(k, isMac)) return
    take()
    if (searchKey) this.openSearch()
    else if (newPageKey) void this.startNewPage()
    else void this.openSettings()
  }

  /** The F1 list of keyboard shortcuts: F1 and the ? button open it, a second press closes it; not over another dialog or the search box. */
  toggleHelp(): void {
    if (this.overlays.is('help')) this.overlays.close('help')
    else if (this.overlays.may('toggleHelp')) this.overlays.open({ kind: 'help' })
  }

  /** A click on a status bar item (`statusAction` says which, and when a folder is still opening). */
  clickStatus(id: string): void {
    const action = statusAction(id, this.opening !== null)
    if (action) this.statusClicks[action]()
  }

  /** What a click on each status bar item with an action does. */
  private readonly statusClicks: Record<StatusAction, () => void> = {
    git: () => void this.clickGit(),
    gitLog: () => void this.toggleGitLog(),
    dailies: () => void this.openDailies(),
    zoom: () => void this.zoom.reset(),
    help: () => this.toggleHelp(),
  }

  // ---- back and forward -------------------------------------------------------

  /**
   * Back or Forward: the edited block's text is sent first, then the step's view is shown again. A step
   * whose page or board is gone is dropped and the next one is tried. Nothing over a dialog, the search box, F1
   * or the date picker, nor while a restore is still loading.
   */
  async go(dir: 'back' | 'forward'): Promise<void> {
    if (this.going || this.nav.busy || !this.overlays.may('go') || this.pickerOpen) return
    this.going = true
    try {
      const focus = this.focusHere() // before the editor and the selection close
      await this.closeCard() // with the card's own text, as any navigation closes it
      this.host.leave()
      this.sel.clear()
      // The typed text's answer lands first: while a restore has the main area empty, it would show its page again.
      await this.client.flush()
      this.rememberHere(focus)
      const step = () => (dir === 'back' ? this.nav.back(this.here) : this.nav.forward(this.here))
      let e = step()
      while (e && !(await this.restore(e))) {
        this.nav.drop()
        e = step()
      }
      if (e?.focus) await this.refocus(e.focus)
    } catch (e) {
      this.refuse(e)
    } finally {
      this.nav.settle()
      this.going = false
    }
  }

  /** The block edited or selected when the step was left, again; nothing when it is no longer shown. */
  private async refocus(f: NavFocus): Promise<void> {
    await this.env.dom.tick()
    if (f.kind === 'select') return this.sel.restore(f.anchor, f.head)
    const b = this.host.blockOf(f.id)
    if (b) await this.host.edit(f.id, Math.min(f.at, b.text.length))
  }

  /** Shows step `e` again, at its scroll position; false when its page or board is gone. */
  async restore(e: NavEntry): Promise<boolean> {
    const p = e.place
    switch (p.kind) {
      case 'page': {
        await this.closeCard()
        let gone = false
        await this.host.exec({ type: 'page.show', key: p.key }, (code) => code === 'unknownPage' && (gone = true))
        if (gone) return false
        break
      }
      case 'feed': {
        await this.leaveMainView('feed')
        const day = e.top ?? p.day
        await (day === null ? this.journal.open() : this.journal.openAt(day, p.day))
        return true
      }
      case 'board': {
        const i = this.config.boards.findIndex((b) => b.name === p.name)
        if (i < 0) return false
        await this.leaveMainView('board')
        await this.boards.open(i)
        break
      }
      case 'allPages':
        await this.leaveMainView('allPages')
        await this.allPages.open()
        break
      case 'archive':
        await this.leaveMainView('archive')
        await this.archiveView.open()
        break
      case 'dailies':
        await this.leaveMainView('dailies')
        await this.dailies.open()
        break
      case 'gitLog':
        await this.leaveMainView('gitLog')
        await this.gitLog.open()
        break
      case 'graph':
        await this.leaveMainView('graph')
        await this.network.open()
        return true
      case 'settings':
        await this.leaveMainView('settings')
        this.settings.open()
        await this.exec({ type: 'states.usage' })
        break
    }
    await this.env.dom.tick()
    const scroller = this.env.dom.scroller()
    if (scroller) scroller.scrollTop = e.scroll
    return true
  }

  // ---- page actions -----------------------------------------------------------

  /** A click on a rendered block: Shift extends from the edited or selected block, else edit. */
  clickBlock(id: BlockId, shift: boolean): void {
    const from = this.host.editingId ?? this.sel.anchor
    // Multi-select stays within the page's own outline, or within one day of the feed.
    if (shift && from !== null && extendsTo(this.journal.feed, this.page, from, id)) this.sel.select(from, id)
    else this.host.editAtEnd(id)
  }

  /** A page dragged from the sidebar was dropped on a block or an empty page: its link goes in (spec §7.2). */
  dropLink(link: string, spot: LinkSpot, x: number, y: number): void {
    const d = linkDrop(spot, link, this.host.editingId, (id) => editablePageOf(this.editable(), id))
    if (d?.kind === 'caret') this.host.dropText(x, y, d.text)
    else if (d?.kind === 'command') void this.exec(d.cmd)
  }

  /** Folds or unfolds block `id` (for this session only). */
  toggleFold(id: BlockId): void {
    if (this.folded.has(id)) this.folded.delete(id)
    else this.folded.add(id)
  }

  /** The first block of the shown empty page. */
  startWriting(): void {
    if (this.page) void this.exec({ type: 'block.insert', page: this.page.key, after: null, text: '' })
  }

  /**
   * `Ctrl N` or the "+" by Pages: an untitled page opens in the folder of the page shown. Nothing is created until
   * it has a title (the file itself only appears once the user types, as for any new page).
   */
  async startNewPage(): Promise<void> {
    if (!this.overlays.may('startNewPage')) return
    const inFolder = this.tree && this.page ? folderOf(this.tree, this.page.key) : ''
    await this.leaveMainView('newPage')
    this.area.show({ kind: 'newPage', folder: inFolder })
  }

  async createUntitled(name: string): Promise<void> {
    const v = this.area.view
    if (v.kind !== 'newPage') return
    try {
      await this.host.exec({ type: 'page.create', name, folder: v.folder })
    } catch (e) {
      this.refuse(e)
    }
  }

  /** Jump to a date: a day the feed lists is shown in the feed; any other day opens as its page, created only when the user types. */
  async goToDay(d: DateView): Promise<void> {
    if (d.inFeed) {
      await this.leaveMainView('feed')
      await this.journal.openAt(d.key)
    } else {
      await this.openPage(d.key)
    }
  }

  /**
   * `Ctrl Shift D` opens the date picker (a hidden sidebar is shown first), a second press closes it; not over a
   * dialog.
   */
  togglePicker(): void {
    if (this.pickerOpen) this.pickerOpen = false
    else if (this.overlays.may('togglePicker')) {
      if (this.sidebarHidden) this.toggleSidebar()
      this.pickerOpen = true
    }
  }

  /** A picked day jumps as a typed date does; the edited block's text is sent first. Nothing is written. */
  async pickDay(key: string): Promise<void> {
    if (this.pickerInsert) {
      const insert = this.pickerInsert
      this.pickerInsert = null
      insert(key)
      return
    }
    this.host.leave()
    this.sel.clear()
    try {
      const d = answerOf(await this.client.run({ type: 'journal.day', key }), 'day')
      if (d) await this.goToDay(d)
    } catch (e) {
      this.refuse(e)
    }
  }

  /**
   * `Ctrl K` or the sidebar box: only with a folder open and not over another dialog; the edited block's text is
   * sent first, and Esc edits it again. The card stays open underneath.
   */
  openSearch(): void {
    if (!this.overlays.may('openSearch')) return
    const editing = this.host.editingId
    this.host.leave()
    this.sel.clear()
    this.search.show(editing)
  }

  /** A chosen row: the dialog closes, then the day, the page (made in memory) or the block is shown. */
  chooseRow(row: SearchRow): void {
    this.search.close()
    if (row.kind === 'date') void this.goToDay(row)
    else if (row.kind === 'page' || row.kind === 'create') void this.openPage(row.name)
    else if (row.kind === 'hit') void this.jumpTo(row.page, row.id)
  }

  async openBoard(i: number): Promise<void> {
    await this.leaveMainView('board')
    void this.boards.open(i)
  }

  /** The All pages table in the main area (§7.7); sort and switch stay, the filter empties. */
  async openAllPages(): Promise<void> {
    await this.leaveMainView('allPages')
    void this.allPages.open()
  }

  /** Every archived task in the main area; the filter empties. A row jumps to its block (`jumpTo`). */
  async openArchive(): Promise<void> {
    await this.leaveMainView('archive')
    void this.archiveView.open()
  }

  /** The Dailies view in the main area; the list is asked again. */
  async openDailies(): Promise<void> {
    await this.leaveMainView('dailies')
    void this.dailies.open()
  }

  /** The Graph screen in the main area (§7.11); the filters stay as they were. */
  async openGraph(): Promise<void> {
    if (!this.overlays.may('openGraph')) return
    await this.leaveMainView('graph')
    void this.network.open()
  }

  /** The status bar button opens the Git history in the main area; a second click is Back. */
  async toggleGitLog(): Promise<void> {
    if (this.gitLog.shown) return this.go('back')
    if (!this.overlays.may('toggleGitLog')) return
    await this.leaveMainView('gitLog')
    void this.gitLog.open()
  }

  /** A sidebar row was dragged onto `folder`: the edited block's text goes first, then the move. */
  async dropRow(row: Row, folder: string): Promise<void> {
    this.host.leave()
    await this.client.flush()
    await this.flows.moveTo(row, folder)
  }

  /**
   * Opens page `name`, closing an open card first. A clicked `link` target `Page#Heading` opens `Page` and jumps to
   * its block with that heading (`reveal`); with no such heading the page opens at the top.
   */
  async openPage(name: string, link = false): Promise<void> {
    await this.closeCard()
    await this.exec({ type: 'page.open', name, link: link || undefined })
    const heading = link ? linkHeading(name) : null
    if (heading === null || !this.page) return
    const id = headingBlock(this.page.blocks, heading)
    if (id !== null) await this.reveal(id)
  }

  /** A link clicked in a block: a page opens here, a web address in the browser. */
  followLink(what: ReturnType<typeof linkClick>): void {
    if (what.kind === 'page') void this.openPage(what.name, what.link)
    else if (what.kind === 'external') this.env.openUrl(what.url).catch((e) => this.refuse(e))
  }

  async openCard(c: CardView, column: string): Promise<void> {
    await this.closeCard()
    this.boards.openCard(cardFromView(c), column)
    await this.env.dom.tick()
    this.host.editAtEnd(c.id)
  }

  /** "+ Add": a new `KEYWORD` block at the end of today's journal; its answer opens it as a card (`openAdded`). */
  async addCard(column: string): Promise<void> {
    await this.closeCard()
    await this.exec({ type: 'journal.append', text: column })
  }

  /** Jump to block `id` of page `key` (a card, a search match): the page shown, the block's ancestors unfolded, the block in the middle of the view and highlighted. */
  async jumpTo(key: string, id: BlockId): Promise<void> {
    await this.closeCard()
    await this.exec({ type: 'page.show', key })
    if (!this.page?.blocks.some((b) => b.id === id)) return
    await this.reveal(id)
  }

  /** Block `id` of the shown page: its ancestors unfolded, the block in the middle of the view and highlighted. */
  async reveal(id: BlockId): Promise<void> {
    if (!this.page) return
    for (const a of ancestorsOf(this.page.blocks, id)) this.folded.delete(a)
    await this.env.dom.tick()
    this.env.dom.scrollToBlock(id)
    this.flash = id
    this.env.timers.setTimeout(() => {
      if (this.flash === id) this.flash = null
    }, 1500)
  }

  // ---- boards -----------------------------------------------------------------

  /** The board's own settings dialog, from its title bar. */
  async openBoardSettings(): Promise<void> {
    await this.closeCard()
    if (this.boards.index !== null) this.config.editBoard(this.boards.index)
  }

  /** Hides column `keyword` of the shown board; an open card is closed first, with its text. */
  async hideColumn(keyword: string): Promise<void> {
    if (this.boards.card !== null) await this.closeCard()
    const view = this.boards.view
    if (view) this.hiddenCols.hide(view.name, keyword, view.columns.map((c) => c.keyword))
  }

  /** The saved board is loaded again, so its new name and columns show; a rename carries the history and hidden columns along. */
  async saveBoard(b: BoardSummary): Promise<void> {
    const r = await this.config.saveBoard(b)
    if (r.renamedFrom !== null) {
      this.nav.boardRenamed(r.renamedFrom, b.name) // the history follows the rename
      this.hiddenCols.renamed(r.renamedFrom, b.name) // its hidden columns go with it
    }
    if (r.ok && this.boards.index === r.at) void this.boards.open(r.at)
  }

  /** Deleting the shown board goes to the journal; a board shown after it moves up one. */
  async deleteBoard(): Promise<void> {
    const r = await this.config.deleteBoard()
    if (!r.ok) return
    const next = shownAfterDelete(this.boards.index, r.at)
    if (next === 'feed') await this.openJournal()
    else if (next !== null) void this.boards.open(next)
  }

  /** A new board with the default columns, shown once the answer is applied (from Settings, Settings stays). */
  async newBoard(name: string): Promise<void> {
    const o = this.overlays.current
    const stay = o?.kind === 'newBoard' && o.from === 'settings'
    this.overlays.close('newBoard')
    const index = await this.config.newBoard(name)
    if (index !== null && !stay) await this.openBoard(index)
  }

  // ---- Settings (§7.12) and the choices kept on this computer ------------------

  /** The Settings screen in the main area, at `section` if given; it counts the states' blocks. */
  async openSettings(section?: SettingsSection): Promise<void> {
    if (!this.overlays.may('openSettings')) return
    await this.leaveMainView('settings')
    this.settings.open(section)
    const shell = this.env.shell
    if (!this.appVersionAsked) {
      this.appVersionAsked = true
      shell.getAppVersion().then(
        (v) => void (this.appVersion = v),
        () => void (this.appVersionAsked = false), // the line shows the name alone; asked again when Settings opens next
      )
    }
    if (!this.logDirAsked) {
      this.logDirAsked = true
      shell.logFolder().then(
        (dir) => void (this.logDir = dir),
        () => void (this.logDirAsked = false), // the button has no tooltip; asked again when Settings opens next
      )
    }
    await this.exec({ type: 'states.usage' })
  }

  /** Settings' "Open log folder"; a failure becomes a notice. */
  openLogs(): void {
    this.env.shell.openLogFolder().catch((e) => this.refuse(e))
  }

  /** Asks a question (from Settings, or before deleting a daily); false when another dialog is open. */
  confirmAsk(message: string, ok: string): Promise<boolean> {
    if (!this.overlays.may('confirmAsk')) return Promise.resolve(false)
    return new Promise((resolve) => this.overlays.open({ kind: 'confirm', message, ok, answer: resolve }))
  }

  /** Applies at once; the choice is kept on this computer. */
  chooseJournalsAt(at: JournalsAt): void {
    this.journalsAt = at
    this.env.shell.setJournalsAt(at).catch((e) => this.refuse(e))
  }

  /** Applies at once; the choices are kept on this computer. */
  chooseLinkDisplay(d: LinkDisplay): void {
    linkDisplay.hideScheme = d.hideScheme
    linkDisplay.shorten = d.shorten
    linkDisplay.trimSlash = d.trimSlash
    this.env.shell.setLinkDisplay(d).catch((e) => this.refuse(e))
  }

  chooseTheme(c: ThemeChoice): void {
    this.theme = c
    applyTheme(c, this.env.dom.root(), (t) => this.env.window.setTheme(t))
    this.env.shell.setTheme(storedTheme(c)).catch((e) => this.refuse(e))
  }

  /** The wheel over the status bar's theme button: one notch, one theme. */
  themeWheel(dy: number): void {
    const c = wheelTheme(this.theme, this.themeSteps, dy, this.zoom.percent)
    if (c !== null) this.chooseTheme(c)
  }

  saveLayout(): void {
    const { sidebarWidth, sidebarHidden, boardColumn: boardColumnWidth } = this
    this.env.shell.setUiState({ sidebarWidth, sidebarHidden, boardColumnWidth }).catch((e) => this.refuse(e))
  }

  toggleSidebar(): void {
    this.sidebarHidden = !this.sidebarHidden
    this.saveLayout()
  }

  // ---- Git ----------------------------------------------------------------------

  /** Typed text goes first (§2), then Git commits and syncs at once. */
  async syncGit(): Promise<void> {
    this.host.leave()
    await this.client.flush()
    await this.client.run({ type: 'git.sync' }).catch((e) => this.refuse(e))
  }

  /** A click on the Git status: sync, offer set-up, or explain a problem and try again. */
  async clickGit(): Promise<void> {
    const v = this.git.view
    if (!v) return
    switch (gitClick(v)) {
      case 'sync':
        return this.syncGit()
      case 'init':
        // Not over another dialog, as with the search box.
        if (!this.overlays.may('gitSetUp')) return
        this.overlays.open({
          kind: 'confirm',
          message: 'Keep this notes folder in Git? Breccia runs git init here and adds a .gitignore and a .gitattributes file.',
          ok: 'Set up Git',
          answer: (yes) => void (yes && this.setUpGit()),
        })
        return
      case 'explain':
        this.notify({
          kind: 'refused',
          message: v.problem?.message ?? 'Breccia uses the installed git command. Install Git, then restart Breccia.',
        })
        if (v.state === 'problem') return this.syncGit()
    }
  }

  /** The first commit holds text typed a moment before (§2). */
  async setUpGit(): Promise<void> {
    this.host.leave()
    await this.client.flush()
    await this.client.run({ type: 'git.init' }).catch((e) => this.refuse(e))
  }

  // ---- closing ------------------------------------------------------------------

  /** "Exit" in the tray menu: the normal close, with its question about unsaved pages shown in the window. */
  async exitFromTray(): Promise<void> {
    this.host.leave()
    const message = await closeCheck(this.client, () => this.notices.unsent())
    if (message === null) return this.closeAnyway()
    const w = this.env.window
    await w.show().catch(() => {})
    await w.unminimize().catch(() => {})
    await w.setFocus().catch(() => {})
    this.closing = message
  }

  /**
   * The window's close button. Text typed in the last moment before closing is still in the typing pause; pages that
   * still could not be saved, and text shown in unsent notices, are named before closing. In the tray it only hides.
   */
  async closeRequested(event: { preventDefault(): void }): Promise<void> {
    if (this.inTray) {
      // The close button only hides the window; the text typed a moment ago is saved first.
      event.preventDefault()
      this.host.leave()
      await flushBeforeClose(this.client)
      await this.env.window.hide().catch((e) => console.error('could not hide the window', e))
      return
    }
    // The editor closes first, so a state typed by hand gets its lines before the queue is flushed.
    this.host.leave()
    const message = await closeCheck(this.client, () => this.notices.unsent())
    if (message === null) return
    event.preventDefault()
    this.closing = message
  }

  closeAnyway(): void {
    this.closing = null
    this.env.window.destroy().catch((e) => console.error('could not close the window', e))
  }

  /** Cancel in the close question: the window stays, any dialog under it as it was. */
  cancelClose(): void {
    this.closing = null
  }

  // ---- folders ------------------------------------------------------------------

  /**
   * Opens or creates the notes folder at `path`. With a folder open, typed text is sent first and the
   * switch is refused while anything is unsaved; the core refuses it too (`unsaved`, shown as its notice).
   */
  async switchFolder(type: 'folder.open' | 'folder.create', path: string): Promise<void> {
    if (this.switching) return
    this.switching = true
    try {
      if (this.folder) {
        await this.closeCard()
        this.host.leave()
        const message = await switchCheck(this.client, () => ({
          unsent: this.notices.unsent(),
          unresolved: this.notices.unresolved().map((key) => this.pageTitle(key)),
        }))
        if (message !== null) {
          this.notify({ kind: 'refused', message })
          return
        }
      }
      let ok = true
      await this.host.exec({ type, path }, () => ((ok = false), false))
      if (ok && this.folder) await this.openFolder()
    } finally {
      this.switching = false
      void this.loadRecent()
    }
  }

  /** "Open folder…" or "New folder…": the system dialog, then the switch. */
  async pickAndSwitch(type: 'folder.open' | 'folder.create'): Promise<void> {
    const path = await pickFolder(
      () => this.env.pickFolder(),
      (m) => this.notify({ kind: 'refused', message: m }),
    )
    if (path !== null) await this.switchFolder(type, path)
  }

  loadRecent(): Promise<void> {
    return this.env.shell.recentFolders().then(
      (l) => void (this.recent = l),
      (e) => this.refuse(e),
    )
  }

  /** Remove: the entry leaves the list; the folder itself is never touched. */
  async forgetRecent(path: string): Promise<void> {
    await this.env.shell.forgetFolder(path).catch((e) => this.refuse(e))
    await this.loadRecent()
  }

  /** A click on a folder that no longer exists explains it; Breccia never removes it by itself. */
  recentMissing(path: string): void {
    this.notify({ kind: 'refused', message: missingFolder(path) })
  }

  // ---- startup ------------------------------------------------------------------

  /**
   * The window's start: the layout and the choices kept on this computer, then (once the shell's listeners are
   * registered, `shellReady`) the startup open and the folder's views.
   */
  async start(shellReady: Promise<void>): Promise<void> {
    const shell = this.env.shell
    try {
      // A layout that cannot be read is the default one; the folder still opens.
      const layout = await loadLayout(() => shell.uiState())
      this.sidebarWidth = layout.width
      this.sidebarHidden = layout.hidden
      this.boardColumn = layout.boardColumn
      this.zoom.restore(layout.zoom)
      this.theme = layout.theme
      this.journalsAt = layout.journalsAt
      shell.uiState().then(
        (ui) => linkDisplay.restore(ui),
        () => {},
      )
      applyTheme(layout.theme, this.env.dom.root(), (t) => this.env.window.setTheme(t))
      shell.gitInstalled().then(
        (ok) => void (this.hasGit = ok),
        () => {},
      )
      this.inTray = await shell.trayEnabled().catch(() => false)
      await shellReady
      await startupSequence({
        ...shell.startupOpen(),
        show: (path) => (this.opening = path),
        folderStatus: async () => {
          await this.exec({ type: 'folder.status' })
          return this.folder !== null
        },
        gitStatus: async () => void (await this.exec({ type: 'git.status' })),
        openFolder: () => this.openFolder(),
        notices: () => shell.startupNotices(),
        notify: (n) => this.notify(n),
      })
    } catch (e) {
      this.refuse(e)
    }
    this.opening = null
    this.ready = true
  }

  // ---- outputs: the one place an Output is applied --------------------------

  /**
   * The folder's settings: from `config.get`, a Settings change, or a hand edit or Git pull (`config:changed`, then
   * `foreign`: own writes never come that way).
   */
  applyConfig(c: ConfigView, foreign = false): void {
    const shift = this.config.apply(c, foreign)
    if (shift === null) return // a late event: newer settings are shown already
    this.host.setKeywords(this.config.states.map((s) => s.keyword))
    this.dailies.setReset(this.config.dailiesReset)
    // Task states and board columns are computed when a view is built: what is shown loads again.
    if (shift.tasks) this.refreshTasks()
    if (shift.board && this.area.is('board')) this.boards.refresh()
    // New states are counted at once, so their rows never show a count from before them.
    if (shift.tasks && this.settings.shown) void this.exec({ type: 'states.usage' })
    // Right after the setting changed (here or by hand), the due tasks are archived.
    if (shift.archiveNow) void this.autoArchive.run()
  }

  /** The shown page, its references, the feed's loaded days and All pages load again, so new task states show. */
  private refreshTasks(): void {
    if (this.page) {
      this.reloads.request(this.page.key)
      this.refreshRefs.request()
    }
    const loaded = this.days
    if (loaded?.size) void this.client.run({ type: 'pages.get', keys: [...loaded] }).catch((e) => this.refuse(e))
    if (this.allPages.shown) this.allPages.refresh()
  }

  apply(out: Output, cmd: Command): void {
    // The route, once known: the refreshes it asks for run even when applying the answer fails after it (R4).
    let r: Route | null = null
    try {
      const { host, journal, boards, area } = this
      this.viewUndo.record(this.undoView(), cmd, out)
      const folderAnswer = answerOf(out, 'folder')
      if (folderAnswer) {
        // A new notes folder: no old tree while the new one is on its way, no old "show more".
        if (isNewFolder(this.lastGeneration, folderAnswer.generation)) {
          this.tree = null
          boards.newFolder()
          this.status.clear('index') // the old folder's build; its final emit clears it too
          this.config.newFolder() // its first config is not a change of what is shown
          // Block ids start again: nothing keyed by the old folder's blocks or pages may carry over.
          host.newFolder()
          this.nav.clear() // the old folder's pages and boards
          area.show({ kind: 'none' }) // whatever it shows names the old folder's pages and blocks
          this.dailies.forget() // the old folder's dailies; `openFolder` lists the new ones
          this.network.newFolder()
          this.search.close()
          this.overlays.closeAll() // a dialog open on the old folder's pages or boards; a question answers no
          this.folded.clear()
          this.viewUndo.clear()
          this.madeInRefs.clear()
          this.notices.newFolder() // their actions would run on the old folder's pages
          this.reloads.clear()
          this.justRenamed.clear()
          this.noticeTitles.clear()
        }
        this.lastGeneration = folderAnswer.generation
        if (folderAnswer.path !== this.folder) void this.hiddenCols.open(folderAnswer.path)
        this.folder = folderAnswer.path
        this.client.setGeneration(folderAnswer.generation)
      }
      if (out.config) this.applyConfig(out.config)
      const gitView = answerOf(out, 'git')
      if (gitView) {
        // An answer can carry a view newer than the last `git:changed` (the shell stores it before emitting).
        if (this.gitLog.shown && historyStale(this.git.view, gitView)) this.gitLog.refresh()
        this.git.set(gitView)
      }
      const usage = answerOf(out, 'usage')
      if (usage) this.settings.applyUsage(usage.states, usage.skipped)
      const graph = answerOf(out, 'graph')
      if (graph) this.network.applyGraph(graph)
      const board = answerOf(out, 'board')
      if (board) boards.applyBoard(board, cmd)
      if (out.tree && isNewer(this.tree, out.tree)) this.tree = out.tree
      // Before the new notices, so a page that failed again keeps its fresh one.
      if (out.saved.length) this.notices.saved(out.saved)
      out.notices.forEach((n) => this.notify(n))
      // The edited block's text in the view about to be replaced (a refresh compares it).
      const before = host.editingId === null ? null : (host.blockOf(host.editingId)?.text ?? null)
      // What the route reads of the page, taken before an applied feed answer shows the feed (and the page leaves).
      const shownPage = this.page?.key ?? null
      const groups = new Set(this.refs?.groups.map((g) => g.page))
      const editingInRefs = this.inRefs(host.editingId)
      // An applied feed answer is shown: the editor closes if it replaced the page or dropped the edited day.
      const feed = answerOf(out, 'feed')
      const feedShown = feed !== null && journal.applyFeed(feed)
      const asked = answerOf(out, 'pages')
      if (asked?.length) journal.applyPages(asked)
      r = route(
        out,
        cmd,
        {
          page: shownPage,
          days: this.days,
          groups,
          editingInRefs,
          main: area.view.kind,
          card: boards.card?.key ?? null,
        },
        feedShown,
      )
      // Before anything changes the view: the step being left keeps its scroll position.
      if (r.resetScroll) this.rememberHere()
      // Steps follow a rename or a move made here; pages that are gone leave the history.
      if ((cmd.type === 'page.rename' || cmd.type === 'page.move') && out.page && out.page.key !== cmd.key) {
        this.nav.renamed(cmd.key, out.page.key)
      }
      out.removed.forEach((k) => this.nav.removed(k))
      if (r.leave) area.leave(area.view.kind)
      const table = answerOf(out, 'table')
      if (table) this.allPages.applyTable(table)
      const archived = answerOf(out, 'archive')
      if (archived) this.archiveView.applyArchive(archived)
      if (out.dailies) this.dailies.apply(out.dailies)
      const found = answerOf(out, 'search')
      if (found) this.search.applySearch(found)
      const names = answerOf(out, 'names')
      if (names) this.search.applyNames(names)
      if (r.leavePage) area.leave('page')
      if (r.clearSelection) this.sel.clear()
      if (r.closeFeed) journal.close()
      const scroller = this.env.dom.scroller()
      if (r.resetScroll && scroller) scroller.scrollTop = scroller.scrollLeft = 0
      if (r.show) {
        area.show({ kind: 'page' }) // first: the view it replaces leaves before the page is set
        this.page = r.show
      }
      if (r.moved) {
        this.refs = null
        this.madeInRefs.clear()
      }
      if (r.days.length) journal.applyPages(r.days)
      if (out.removed.length) journal.removed(out.removed)
      if (r.applyRefs) {
        this.refs = answerOf(out, 'refs')
        this.madeInRefs.clear()
        if (host.editingId !== null) this.reconcileShown()
      }
      if (r.madeInRefs !== null) this.madeInRefs.add(r.madeInRefs)
      for (const p of r.patch) this.refs = patchRefs(this.refs!, p, this.madeInRefs)
      if (r.refreshRefs) this.refreshRefs.request()
      // The open card follows its own edits.
      for (const p of r.cardPages) boards.patchCard(p, out.focus?.id ?? null)
      // Opened first, so the board holds its reload until the new card closes.
      if (r.openAdded && out.page && out.focus && cmd.type === 'journal.append') {
        this.openAdded(out.page, out.focus.id, cmd.text)
      }
      // "+ Add" answered after the user left the board: the bare block goes again.
      if (r.strayAdded !== null) void this.exec({ type: 'blocks.delete', ids: [r.strayAdded] })
      if (r.refreshAllPages) this.allPages.refresh()
      if (r.refreshBoard) {
        if (out.removed.length) boards.removed(out.removed)
        else boards.refresh()
      }
      host.apply(cmd, r.dropFocus ? { ...out, focus: null } : out, r.shown, before)
    } finally {
      // What the shell's events do for a change made outside the window, done from the answer (as their handlers in
      // `shellHandlers` do), even when a view failed to take the answer part-way.
      if (r?.refreshSearch) this.search.refresh() // an open search box asks again
      if (r?.refreshNames) this.search.refreshNames()
      if (r?.refreshGraph) this.network.refresh()
    }
    r.journalChanged.forEach((p) => this.journal.changed(p))
    // A page changed beside what was applied (an archived block, a rewritten link) is news for the views.
    r.others.forEach((p) => this.viewsTake(p))
  }

  /** "+ Add" was answered: its new block opens as a card, the caret after `KEYWORD `. */
  private openAdded(day: PageView, id: BlockId, text: string): void {
    const card = cardOf(day, id)
    // Another card opened meanwhile stays open; the new block is deleted again.
    if (!card || !this.boards.openAdded(card, text, text)) return
    // The block's own text below the keyword (its `created::` line) stays.
    const block = day.blocks.find((b) => b.id === id)
    void this.env.dom.tick().then(() => this.host.edit(id, text.length + 1, addedText(block?.text ?? text, text)))
  }

  /**
   * Page `p` changed outside the window, or beside what a command applied (`Route.others`): the shown view takes it.
   */
  viewsTake(p: PageView): void {
    switch (this.area.view.kind) {
      // The table reloads for another program's change (§6).
      case 'allPages':
        this.allPages.changed()
        return
      // The Archive view too: an automatic archive or another program's change shows.
      case 'archive':
        this.archiveView.changed()
        return
      // The graph reloads the same way (§6).
      case 'graph':
        this.network.changed()
        return
      // The board reloads (held while a card is open); the open card follows its page.
      case 'board':
        if (this.boards.changed(p)) this.reconcileShown()
        return
    }
    pageChanged(
      {
        shows: (key) => key === this.page?.key || (this.days?.has(key) ?? false),
        active: () => this.area.is('page') || this.area.is('feed'),
        isGroup: (key) => this.isGroup(key),
        reload: (key) => this.reloads.request(key),
        patch: (q) => (this.refs = patchRefs(this.refs!, q, this.madeInRefs)),
        refresh: () => this.refreshRefs.request(),
        reconcile: () => this.reconcileShown(),
      },
      p,
    )
  }

  /** Another program removed page `key`; the window's own removals are handled where its commands are applied. */
  private pageRemoved(key: string): void {
    this.nav.removed(key) // skipped from now on
    this.allPages.refresh()
    this.archiveView.refresh()
    this.journal.removed([key])
    if (this.area.is('board')) this.boards.removed([key])
    if (this.isGroup(key)) this.refreshRefs.request()
    // The shown page renamed a moment ago is on its way to its new key.
    const page = this.page
    if (!page || removalFor(page.key, key, this.justRenamed) !== 'removed') return
    this.notify({ kind: 'refused', message: `“${page.title}” was removed on disk.` })
    void this.openJournal()
  }

  /** Another program renamed page `r.from`: the shown page follows it, at the same scroll position. */
  private async pageRenamed(r: RenameView): Promise<void> {
    // Still on its way to an earlier rename's key (A→B→C fast): the chain is followed.
    this.nav.renamed(r.from, r.to) // the history follows the rename
    const to = followRename(this.page?.key ?? null, r, this.justRenamed)
    this.justRenamed.add(r.from, r.to)
    if (to === null) return
    const top = this.env.dom.scroller()?.scrollTop ?? 0
    // Renamed again meanwhile: that rename's own events follow it.
    await this.host.exec({ type: 'page.show', key: to }, (code) => code === 'unknownPage')
    const scroller = this.env.dom.scroller()
    if (this.page?.key === to && scroller) scroller.scrollTop = top
  }

  /** A page's name for a message: its title when known, else its key (a journal day's key is its date). */
  pageTitle(key: string): string {
    return this.page?.key === key ? this.page.title : (this.noticeTitles.get(key) ?? key)
  }

  /** The handlers `listenShell` takes (`lib/shellEvents.ts`). */
  shellHandlers(): ShellHandlers {
    const idle = this.inFlight.idle
    return {
      // Other programs and Git change pages too (§9); the window's own commands send no events.
      pageChanged: (p) =>
        idle.run(() => {
          this.search.refresh() // an open search box asks again
          // An alias may have come or gone, which changes no file name: the open name lists load again.
          this.search.refreshNames()
          this.host.reloadNames()
          this.journal.changed(p)
          this.viewsTake(p)
        }),
      treeChanged: (t) => {
        if (isNewer(this.tree, t)) this.tree = t
        this.search.refresh()
        this.search.refreshNames()
        this.host.reloadNames()
        this.allPages.refresh() // a page added, moved or removed on disk
        this.network.refresh()
      },
      pageRemoved: (key) =>
        idle.run(() => {
          this.search.refresh()
          this.network.refresh()
          this.pageRemoved(key)
        }),
      notices: (ns) => ns.forEach((n) => this.notify(n)),
      // Pages a Git retry saved after a failed save: their "could not be saved" notice goes.
      pagesSaved: (keys) => {
        if (keys.length) this.notices.saved(keys)
      },
      // Held like the page events, so a command's answer never overwrites a newer view.
      gitChanged: (v) =>
        idle.run(() => {
          const moved = this.git.headChanged(v)
          // A new commit or a push shows in the open history.
          if (this.gitLog.shown && historyStale(this.git.view, v)) this.gitLog.refresh()
          this.git.set(v)
          if (moved && this.allPages.shown) this.allPages.refresh() // created dates from Git
        }),
      // In event order with `page:removed`, which follows it for the old key.
      pageRenamed: (r) =>
        idle.run(() => {
          this.network.refresh()
          void this.pageRenamed(r)
        }),
      configChanged: (c) => idle.run(() => this.applyConfig(c, true)),
      // Held like the page events, so a command's answer never overwrites a newer list.
      dailiesChanged: (list) => idle.run(() => this.dailies.apply(list)),
      // The shell ends every build with `{done: t, total: t}`, so the item always goes away.
      indexChanged: (p) => {
        const item = indexItem(p, this.lastGeneration)
        if (item === 'ignore') return
        if (item) this.status.set(item)
        else this.status.clear('index')
      },
      recovered: (e) => void this.recovery.recovered(e).catch((err) => this.refuse(err)),
      trayExit: () => void this.exitFromTray(),
      closeRequested: (e) => this.closeRequested(e),
    }
  }
}
