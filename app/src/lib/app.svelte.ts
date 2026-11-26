// The window's controller: its state, the one place a command's answer is applied (`apply`), and what a change made
// outside the window does (`shellHandlers`). App.svelte builds its `AppEnv` from Tauri and the DOM and renders it.
import { untrack } from 'svelte'
import { SvelteSet } from 'svelte/reactivity'
import { errorCode, errorMessage, type hiddenColumns, type setHiddenColumns, type setZoom } from '../api'
import type { mountEditor } from '../editor/blockEditor'
import { EditorHost } from '../editor/host.svelte'
import type { MenuView } from '../editor/menu'
import { MultiSelect } from '../editor/multiSelect.svelte'
import { AllPages } from './allPages.svelte'
import { answerOf } from './answer'
import { createClient, type Client } from './api'
import { Archive } from './archive.svelte'
import { AutoArchive } from './autoArchive'
import { addedText, cardBlocks, cardOf, cardRoot } from './board'
import { Boards } from './boards.svelte'
import { ConfigStore } from './config.svelte'
import { Dailies } from './dailies.svelte'
import { NOT_A_TASK } from './due'
import { dueKeyAction } from './dueKey'
import { duePick } from './duePick.svelte'
import { editableBlocks, editablePageOf, walkOrder, type EditableView } from './editable'
import { InFlight, Refreshes } from './external'
import { isNewFolder } from './folder'
import { JustRenamed, followRename, removalFor } from './followRename'
import { GitStatus } from './git.svelte'
import { historyItem, historyStale } from './gitLog'
import { GitLog } from './gitLog.svelte'
import { HiddenColumns } from './hiddenColumns.svelte'
import { Journal } from './journal.svelte'
import { MainArea } from './mainArea.svelte'
import { placeOfView, type NavFocus, type NavPlace } from './nav'
import { Nav } from './nav.svelte'
import { Network } from './network.svelte'
import { NoticeCenter } from './noticeCenter.svelte'
import { Overlays } from './overlay.svelte'
import { PageFlows } from './pageFlows.svelte'
import { isMac } from './platform'
import { Recovery } from './recovery'
import { RefsRefresh, pageChanged, pageOfBlock, patchRefs } from './refs'
import { route, selectionPageOf, type Route } from './route'
import { saveItem } from './saveStatus'
import type { SearchRow } from './search'
import { Search } from './search.svelte'
import { SettingsScreen } from './settings.svelte'
import type { ShellHandlers } from './shellEvents'
import { helpItem, indexItem } from './status'
import { StatusItems } from './status.svelte'
import { visible } from './tree'
import { isNewer } from './treeVersion'
import type { BlockId, Command, ConfigView, Notice, Output, PageView, RefsView, RenameView, Request, TreeView } from './types'
import { ViewUndo } from './viewUndo'
import { zoomItem } from './zoom'
import { Zoom } from './zoom.svelte'

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
    scrollToBlock(id: BlockId): void
    /** Svelte's `tick`: the DOM has caught up with the state. */
    tick(): Promise<void>
    /** `data-busy` on the document, for the e2e test (`settled`). Not shown to the user. */
    setBusy(busy: boolean): void
    /** The editor's slot in block `id` (`[data-block-id="…"] .editor-slot`). */
    slot(id: BlockId): HTMLElement | null
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
  /** The shell's calls the controller's classes make (`app/src/api.ts`). */
  shell: {
    /** The webview's own zoom factor (1 is 100 %). */
    webviewZoom(factor: number): Promise<void>
    setZoom: typeof setZoom
    hiddenColumns: typeof hiddenColumns
    setHiddenColumns: typeof setHiddenColumns
  }
  /** Flows of the window that are not in the controller yet: the search box's chosen row, and showing the sidebar. */
  ui: {
    chooseRow(row: SearchRow): void
    /** The date picker sits in the sidebar: a hidden sidebar is shown first. */
    showSidebar(): void
  }
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
          env.ui.showSidebar()
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
        quiet: (code, cmd) => this.recovery.quiet(code, cmd),
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
      },
      flush: () => this.client.flush(),
      reload: async () => {
        await this.exec({ type: 'folder.status' })
        // No folder open any more: the Welcome screen shows.
        if (this.folder) await this.openFolder()
      },
      now: () => env.now(),
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
      choose: (row) => env.ui.chooseRow(row),
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
    if (n.kind === 'refused' && this.recovery.quietMessage(n.message)) return
    if (n.kind === 'conflict' && this.page?.key === n.page) this.noticeTitles.set(n.page, this.page.title)
    this.notices.notify(n)
  }

  refuse(e: unknown): void {
    if (this.recovery.quiet(errorCode(e), null)) return
    this.notify({ kind: 'refused', message: errorMessage(e) })
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

  /** The handlers `listenShell` takes (`lib/shellEvents.ts`); the trayExit and the close button stay the window's. */
  shellHandlers(): Omit<ShellHandlers, 'trayExit' | 'closeRequested'> {
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
    }
  }
}
