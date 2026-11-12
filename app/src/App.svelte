<script lang="ts">
  import { onMount, tick, untrack } from 'svelte'
  import { SvelteSet } from 'svelte/reactivity'
  import { getCurrentWindow } from '@tauri-apps/api/window'
  import { getCurrentWebview } from '@tauri-apps/api/webview'
  import { openUrl } from '@tauri-apps/plugin-opener'
  import { open as openDialog } from '@tauri-apps/plugin-dialog'
  import {
    invokeRun,
    startupNotices,
    errorMessage,
    errorCode,
    uiState,
    setUiState,
    setTheme,
    setJournalsAt,
    setZoom,
    recentFolders,
    forgetFolder,
    getAppVersion,
    gitInstalled,
    logFolder,
    openLogFolder,
    trayEnabled,
    hiddenColumns,
    setHiddenColumns,
  } from './api'
  import { createClient, flushBeforeClose } from './lib/api'
  import { closeCheck } from './lib/close'
  import { autoHideScrollbar } from './lib/scrollFade'
  import { saveItem } from './lib/saveStatus'
  import { Echoes } from './lib/echo'
  import { InFlight, Refreshes } from './lib/external'
  import { NoticeCenter } from './lib/noticeCenter.svelte'
  import { listenShell } from './lib/shellEvents'
  import { Recovery } from './lib/recovery'
  import { installDom } from './lib/dom'
  import { linkClick } from './lib/links'
  import { extendsTo, route, selectionPageOf } from './lib/route'
  import { Journal } from './lib/journal.svelte'
  import { everyMidnight } from './lib/feed'
  import { editableBlocks, editablePageOf, walkOrder, type EditableView } from './lib/editable'
  import { ancestorsOf, visible } from './lib/tree'
  import { isNewer } from './lib/treeVersion'
  import {
    addedText,
    boardDialogAfterConfig,
    cardFromView,
    cardOf,
    cardRoot,
    defaultColumns,
    moveBoardNamed,
    settingsAfterSet,
    settingsIndexAfterConfig,
    shownAfterDelete,
    withBoard,
    withoutBoard,
  } from './lib/board'
  import { Boards } from './lib/boards.svelte'
  import { HiddenColumns } from './lib/hiddenColumns.svelte'
  import { AutoArchive, archiveShift, hourly } from './lib/autoArchive'
  import { AllPages } from './lib/allPages.svelte'
  import { Archive } from './lib/archive.svelte'
  import { Network } from './lib/network.svelte'
  import { isNewFolder } from './lib/folder'
  import { RefsRefresh, pageChanged, pageOfBlock, patchRefs } from './lib/refs'
  import { clampWidth, loadLayout } from './lib/sidebarLayout'
  import type { JournalsAt } from './lib/treeRows'
  import { applyTheme, storedTheme, type ThemeChoice } from './lib/theme'
  import { PageFlows } from './lib/pageFlows.svelte'
  import type { Row } from './lib/treeRows'
  import { StatusItems } from './lib/status.svelte'
  import { Zoom } from './lib/zoom.svelte'
  import { WheelSteps, zoomItem, zoomKey } from './lib/zoom'
  import { wheelTheme } from './lib/themeWheel'
  import { helpItem, indexItem, themeItem } from './lib/status'
  import { GitStatus } from './lib/git.svelte'
  import { gitClick } from './lib/git'
  import { historyItem, historyStale } from './lib/gitLog'
  import { GitLog } from './lib/gitLog.svelte'
  import { JustRenamed, followRename, removalFor } from './lib/followRename'
  import { Search } from './lib/search.svelte'
  import type { SearchRow } from './lib/search'
  import { isDatePickerKey, isHelpKey, isNewPageKey, isSearchKey, isSettingsKey, navKey } from './lib/keys'
  import { placeHere, topDayOf, type NavPlace } from './lib/nav'
  import { Nav, type NavEntry } from './lib/nav.svelte'
  import { folderOf } from './lib/pageOps'
  import { SettingsScreen, type SettingsSection } from './lib/settings.svelte'
  import { statesSet } from './lib/stateEdit'
  import { configShift, isNewerConfig } from './lib/configChange'
  import { dialogVersion, foreignAfterRefusal, gitCommand, WriteQueue, writeConfig, type WriteEnv } from './lib/configWrite'
  import { missingFolder, pickFolder, recentRows, switchCheck } from './lib/folderSwitch'
  import { watchThemeTokens } from './lib/themeTokens.svelte'
  import type {
    BlockId,
    BoardSummary,
    CardView,
    ConfigView,
    Command,
    DateView,
    GitSettings,
    Notice,
    Output,
    PageView as Page,
    RecentFolder,
    RefsView,
    RenameView,
    StateRename,
    StateView,
    TreeView,
  } from './lib/types'
  import { EditorHost } from './editor/host.svelte'
  import type { MenuView } from './editor/menu'
  import { MultiSelect } from './editor/multiSelect.svelte'
  import Sidebar from './components/Sidebar.svelte'
  import Welcome from './components/Welcome.svelte'
  import PageView from './components/PageView.svelte'
  import JournalFeed from './components/JournalFeed.svelte'
  import Board from './components/Board.svelte'
  import AllPagesView from './components/AllPagesView.svelte'
  import Notices from './components/Notices.svelte'
  import CaretMenu from './components/CaretMenu.svelte'
  import FlowDialog from './components/FlowDialog.svelte'
  import ConfirmDialog from './components/ConfirmDialog.svelte'
  import NameDialog from './components/NameDialog.svelte'
  import BoardSettings from './components/BoardSettings.svelte'
  import StatusBar from './components/StatusBar.svelte'
  import SearchDialog from './components/SearchDialog.svelte'
  import ShortcutsDialog from './components/ShortcutsDialog.svelte'
  import ChangelogDialog from './components/ChangelogDialog.svelte'
  import SettingsView from './components/SettingsView.svelte'
  import NewPageView from './components/NewPageView.svelte'
  import { isMac as mac } from './lib/platform'

  let folder = $state<string | null>(null)
  let page = $state<Page | null>(null)
  /** The linked references to the shown page, editable in place; null until loaded. */
  let refs = $state<RefsView | null>(null)
  /** Blocks focused while editing in the references (Enter at a root's end): shown there until they reload. */
  const madeInRefs = new Set<BlockId>()
  let tree = $state<TreeView | null>(null)
  let sidebarWidth = $state(clampWidth(null))
  let sidebarHidden = $state(false)
  /** The board's column width in px; null lets the columns fill the window. */
  let boardColumn = $state<number | null>(null)
  let ready = $state(false)
  /** Session-only folding: never written to files. */
  const folded = new SvelteSet<number>()
  /** The configured task states, from `config.get` (fetched once per folder). */
  let states = $state.raw<StateView[]>([])
  /** The editor's caret menus while open: the slash menu and link completion (which wins). */
  let slashMenu = $state<MenuView | null>(null)
  let linkMenu = $state<MenuView | null>(null)
  /** `.main`, which scrolls the page or the feed. */
  let scroller = $state<HTMLElement | undefined>()
  /** The configured boards, from `config.get`. */
  let boardList = $state<BoardSummary[]>([])
  /** `[board] archive_after_days`, from `config.get`. */
  let archiveDays = $state(14)
  /** `[board] auto_archive`, from `config.get`. */
  let autoArchiveOn = $state(true)
  /** `ConfigView.version` of the settings shown: the config writes carry it (the core refuses an older one). */
  let configVersion = $state(0)
  /** The running program's version, fetched when Settings first opens; null until then or if that fails. */
  let appVersion = $state<string | null>(null)
  let appVersionAsked = false
  /** The log file's folder (the tooltip of Settings' "Open log folder"), fetched when Settings first opens. */
  let logDir = $state<string | null>(null)
  let logDirAsked = false
  /** The folder of a new, still untitled page (shown instead of the main view); null when none is being made. */
  let newPageFolder = $state<string | null>(null)
  /** Whether the `git` command exists on this computer, checked at startup; null until known. */
  let hasGit = $state<boolean | null>(null)
  /** Whether the app lives in the tray (Windows): the close button hides the window, "Exit" in the tray quits. */
  let inTray = false
  /** A block highlighted briefly after the jump from a card. */
  let flash = $state<BlockId | null>(null)
  /** The board whose settings dialog is open ; null while closed. */
  let settingsFor = $state<number | null>(null)
  /** That board's name: the dialog follows its board by name when the config changes. */
  let settingsForName = ''
  /** The config version the dialog's values come from: its save carries it, so a hand edit meanwhile refuses it. */
  let settingsForVersion = 0
  /** A `boards.set` from the dialog is on its way: its own answer is not a change to follow. */
  let boardSaving = false
  /**
   * The newest config version that came from a hand edit or pull (0: none in this folder). A board dialog opened
   * before it saves with its old version, so the core refuses it (`dialogVersion`); own Settings changes never
   * count, so they do not refuse the dialog.
   */
  let foreignVersion = 0
  /** `[git]` of the open folder, from the config. */
  let gitSettings = $state<GitSettings | null>(null)
  /** The config last applied; null until a folder's first one. */
  let lastConfig: ConfigView | null = null
  /** The theme chosen on this computer. */
  let theme = $state<ThemeChoice>('system')
  /** Where the sidebar lists Journals, chosen on this computer. */
  let journalsAt = $state<JournalsAt>('bottom')
  /** The Settings screen in the main area (§7.12). */
  const settings = new SettingsScreen()
  /** A question from Settings (rename or remove a used state), while open. */
  let question = $state<{ message: string; ok: string; answer: (yes: boolean) => void } | null>(null)
  /** Where the "New board" name dialog was opened from, while it is open. */
  let naming = $state<'sidebar' | 'settings' | null>(null)
  /** The recent folders, newest first; loaded when Settings or the Welcome screen shows and after a switch. */
  let recent = $state.raw<RecentFolder[]>([])

  // ---- the command client -------------------------------------------------

  /** Shell events wait while a command runs: they may be its own echoes, told apart once it is applied. */
  const inFlight = new InFlight()
  /** What our own commands returned: their `page:changed` and `page:removed` echoes carry nothing new. */
  const echoes = new Echoes()

  const client = createClient(inFlight.wrap(invokeRun), {
    onOutput: apply,
    onError: (e, cmd) => host.backgroundFailed(e, cmd),
    onUnsaved: (u) => void (unsavedText = u),
  })

  /** What the editor may touch: the open card on a board, the feed's loaded days, or the page and its references. */
  const editable = (): EditableView => ({ board: boards.index !== null, card: boards.card, feed: journal.feed, page, refs })

  const host = new EditorHost(
    {
      client,
      blocks: () => editableBlocks(editable(), folded),
      order: (id) => walkOrder(editable(), folded, id),
      pageOf: (id) => editablePageOf(editable(), id),
      states: () => states,
      notify: (n) => notify(n),
      showMenu: (which, m) => (which === 'link' ? (linkMenu = m) : (slashMenu = m)),
      pickDate: (onpick) => {
        if (dialogOpen() || search.shown) return
        if (sidebarHidden) toggleSidebar()
        pickerInsert = onpick
        pickerOpen = true
      },
      selectWithNeighbour: (id, dir) => sel.selectWithNeighbour(id, dir),
      quiet: (code, cmd) => recovery.quiet(code, cmd),
    },
    folded,
  )

  const sel = new MultiSelect(
    {
      order: () => {
        const p = selectionPage()
        return p ? visible(p.blocks, folded).map((b) => b.id) : []
      },
      page: selectionPage,
      states: () => states,
      editing: () => host.editingId !== null,
      leave: () => host.leave(),
      run: (cmd) => void host.exec(cmd),
      notify: (message) => notify({ kind: 'refused', message }),
    },
    mac,
  )

  // Short state along the bottom of the window (§7.13).
  const status = new StatusItems()
  /** The zoom of the whole window: the webview's own zoom, kept per computer. */
  const zoom = new Zoom({ apply: (f) => getCurrentWebview().setZoom(f), save: setZoom })
  $effect(() => {
    const item = zoomItem(zoom.percent)
    untrack(() => (item ? status.set(item) : status.clear('zoom')))
  })
  /** Typed text not yet written (§7.13): in the typing pause, or sent and not yet answered. */
  let unsavedText = $state(false)
  /** Git's state; its item sits on the right of the status bar (§7.9). */
  const git = new GitStatus({ now: () => Date.now() })
  $effect(() => {
    const item = git.item
    untrack(() => (item ? status.set(item) : status.clear('git')))
  })
  $effect(() => {
    const item = saveItem({
      folder: folder !== null,
      unsaved: unsavedText,
      failed: new Set(notices.items.flatMap((n) => (n.unsavedPage === undefined ? [] : [n.unsavedPage]))).size,
    })
    untrack(() => (item ? status.set(item) : status.clear('save')))
  })
  /** Whether the "Set up Git" question is open. */
  let settingUpGit = $state(false)

  const notices = new NoticeCenter({
    typingMark: () => host.typingMark(),
    resolveConflict: (block, text, show, since) => void host.resolveConflict(block, text, show, since),
    exec: (cmd) => void exec(cmd),
  })
  /**
   * After an internal error (`session:recovered`): one notice, the notes shown again from disk, and the refusals that
   * error caused stay quiet. Typed text still in the editor is sent first, so text the core did not take is shown to
   * copy.
   */
  const recovery = new Recovery({
    notify: (n) => notices.notify(n),
    leave: () => host.leave(),
    // Nothing that names a block of the old session stays shown: the new session numbers its blocks from 1 again.
    clear: () => {
      search.close()
      sel.clear()
      boards.close() // the open card too; its typed text is pending already (leave)
      archiveView.close()
      journal.close()
      pickerOpen = false // a pick after the reload would name a block of the old session
      page = null
      refs = null
      madeInRefs.clear()
    },
    flush: () => client.flush(),
    reload: async () => {
      await exec({ type: 'folder.status' })
      // No folder open any more: the Welcome screen shows.
      if (folder) await openFolder()
    },
    now: () => Date.now(),
  })
  /** The titles of pages named by Keep mine / Use theirs notices, taken while the page is shown (for a refused switch). */
  const noticeTitles = new Map<string, string>()
  function notify(n: Notice) {
    // Every view's refusals meet here: those an internal error caused say no more than its one notice.
    if (n.kind === 'refused' && recovery.quietMessage(n.message)) return
    if (n.kind === 'conflict' && page?.key === n.page) noticeTitles.set(n.page, page.title)
    notices.notify(n)
  }

  const exec = (cmd: Command) => host.exec(cmd)

  const journal = new Journal({ run: (cmd) => client.run(cmd), notify })
  /** The shown board and its open card. */
  /** Hidden board columns of the open folder, kept on this PC. */
  const hiddenCols = new HiddenColumns({ load: hiddenColumns, save: setHiddenColumns })
  const boards = new Boards({
    run: (cmd) => client.run(cmd),
    notify,
    flush: () => client.flush(),
    home: () => void openJournal(),
  })
  /**
   * Breccia archives finished tasks by itself: once a folder is loaded, every hour and after a change of the
   * setting. The run skips the block being edited and comes after typed text in the command queue.
   */
  const autoArchive = new AutoArchive({
    run: (cmd) => client.run(cmd),
    editing: () => host.editingId,
    enabled: () => folder !== null && autoArchiveOn,
  })
  /** The All pages table; a failed load or reload is a notice (AllPages reports it). */
  const allPages = new AllPages({ run: (cmd) => client.run(cmd), notify })
  /** The Archive view; a failed load or reload is a notice. */
  const archiveView = new Archive({ run: (cmd) => client.run(cmd), notify })
  /** The F1 list of keyboard shortcuts is open. */
  let helpShown = $state(false)
  /** F1 and the ? button open it, a second press closes it; not over another dialog or the search box. */
  function toggleHelp() {
    if (helpShown) helpShown = false
    else if (!dialogOpen() && !search.shown) helpShown = true
  }
  $effect(() => {
    const item = folder ? helpItem(helpShown) : null
    untrack(() => (item ? status.set(item) : status.clear('help')))
  })
  /** The theme button left of "?": its menu offers the Settings > Appearance choices (`chooseTheme`). */
  $effect(() => {
    const item = folder ? themeItem(theme) : null
    untrack(() => (item ? status.set(item) : status.clear('theme')))
  })
  /** The Git history; `git.log` skips the command queue, so a slow log never holds typed text up. */
  const gitLog = new GitLog({
    log: (skip, limit) => invokeRun({ generation: 0, command: { type: 'git.log', skip, limit } }),
  })
  $effect(() => {
    const item = historyItem(git.view, gitLog.shown)
    untrack(() => (item ? status.set(item) : status.clear('gitLog')))
  })
  /** The Graph screen (§7.11); a failed load is a notice. */
  const network = new Network({ run: (cmd) => client.run(cmd), notify })
  /** The quick search box (§7.8). */
  const search = new Search({
    run: (cmd) => client.run(cmd),
    notify,
    choose: (row) => chooseRow(row),
    back: (id) => host.editAtEnd(id), // nothing when the block is gone
  })

  /** The feed's loaded days (null while no feed is shown); a new set only when the feed changes. */
  const days = $derived(journal.loaded())

  // ---- back and forward -------------------------------------------------------

  /** The views shown this session, for Back and Forward; cleared with a new folder. */
  const nav = new Nav()
  /** The place the main area shows; null between two views and for the untitled new page. */
  const here = $derived<NavPlace | null>(
    placeHere({
      newPage: newPageFolder !== null,
      settings: settings.shown,
      graph: network.shown,
      board: boards.index === null ? null : (boardList[boards.index]?.name ?? null),
      gitLog: gitLog.shown,
      archive: archiveView.shown,
      allPages: allPages.shown,
      feed: journal.feed !== null,
      feedDay: journal.at,
      page: page?.key ?? null,
    }),
  )
  // Every new place is a step; the same place again is not.
  $effect(() => {
    const p = here
    untrack(() => nav.arrive(p))
  })

  /** The view shown is about to be left: its scroll position (in the feed, the day at the top) goes into its step. */
  function rememberHere() {
    if (!scroller) return
    let top: string | null = null
    if (journal.feed) {
      const box = scroller.getBoundingClientRect()
      const edge = box.top + (parseFloat(getComputedStyle(scroller).paddingTop) || 0)
      const sections = [...scroller.querySelectorAll<HTMLElement>('[data-testid="day"][data-day]')]
        .map((el) => ({ key: el.dataset.day!, rect: el.getBoundingClientRect() }))
        .sort((a, b) => a.rect.top - b.rect.top)
        .map(({ key, rect }) => ({ key, top: rect.top, bottom: rect.bottom }))
      top = topDayOf(sections, edge)
    }
    nav.remember(scroller.scrollTop, top)
  }

  /**
   * Back or Forward: the edited block's text is sent first, then the step's view is shown again. A step
   * whose page or board is gone is dropped and the next one is tried. Nothing over a dialog, the search box, F1
   * or the date picker, nor while a restore is still loading.
   */
  /** A Back or Forward is under way (from the first await on), so a key repeat waits for nothing. */
  let going = false
  async function go(dir: 'back' | 'forward') {
    if (going || nav.busy || dialogOpen() || search.shown || pickerOpen) return
    going = true
    try {
      await closeCard() // with the card's own text, as any navigation closes it
      host.leave()
      sel.clear()
      // The typed text's answer lands first: while a restore has the main area empty, it would show its page again.
      await client.flush()
      rememberHere()
      const step = () => (dir === 'back' ? nav.back(here) : nav.forward(here))
      let e = step()
      while (e && !(await restore(e))) {
        nav.drop()
        e = step()
      }
    } catch (e) {
      refuse(e)
    } finally {
      nav.settle()
      going = false
    }
  }

  /** Shows step `e` again, at its scroll position; false when its page or board is gone. */
  async function restore(e: NavEntry): Promise<boolean> {
    const p = e.place
    if (p.kind === 'page') {
      await closeCard()
      let gone = false
      await host.exec({ type: 'page.show', key: p.key }, (code) => code === 'unknownPage' && (gone = true))
      if (gone) return false
    } else if (p.kind === 'feed') {
      await leaveMainView('feed')
      const day = e.top ?? p.day
      await (day === null ? journal.open() : journal.openAt(day, p.day))
      return true
    } else if (p.kind === 'board') {
      const i = boardList.findIndex((b) => b.name === p.name)
      if (i < 0) return false
      await leaveMainView('board')
      await boards.open(i)
    } else if (p.kind === 'allPages') {
      await leaveMainView('allPages')
      await allPages.open()
    } else if (p.kind === 'archive') {
      await leaveMainView('archive')
      await archiveView.open()
    } else if (p.kind === 'gitLog') {
      await leaveMainView('gitLog')
      await gitLog.open()
    } else if (p.kind === 'graph') {
      await leaveMainView('graph')
      await network.open()
      return true
    } else {
      await leaveMainView('settings')
      settings.open()
      await exec({ type: 'states.usage' })
    }
    await tick()
    if (scroller) scroller.scrollTop = e.scroll
    return true
  }

  /** Where multi-select works: the shown page, or in the feed the day of the edited or anchored block. */
  function selectionPage(): Page | null {
    return selectionPageOf(journal.feed, page, host.editingId ?? sel.anchor)
  }

  /**
   * The shown page loaded again after another program changed it, through the command
   * queue. A page gone meanwhile is reported by its `page:removed`.
   */
  const reloads = new Refreshes((key) =>
    // A reload queued for the old folder is answered `stale` after a switch: nothing to show.
    host.exec({ type: 'page.get', key }, (code) => code === 'unknownPage' || code === 'stale'),
  )

  /** Whether `id` is a block in the linked references (not the page's own outline). */
  const inRefs = (id: BlockId | null) => id !== null && pageOfBlock(null, refs, id) !== null
  const isGroup = (key: string) => refs?.groups.some((g) => g.page === key) ?? false

  /** Loads the references again, but never under the editor while it is inside them. */
  const refreshRefs = new RefsRefresh({
    key: () => page?.key ?? null,
    busy: () => inRefs(host.editingId),
    // A page removed meanwhile is reported by its page:removed.
    run: (key) =>
      client.run({ type: 'page.refs', key }).catch((e) => {
        if (errorCode(e) !== 'unknownPage') refuse(e)
      }),
  })
  $effect(() => {
    void host.editingId // Once the editor leaves the references, a held refresh runs.
    untrack(() => refreshRefs.pump())
  })

  const flows = new PageFlows({
    run: (cmd) => client.run(cmd),
    tree: () => tree,
    shown: () => page?.key ?? null,
    notify,
    home: openJournal,
  })

  // ---- outputs: the one place an Output is applied --------------------------

  /**
   * The folder's settings: from `config.get`, a Settings change, or a hand edit or Git pull (`config:changed`, then
   * `foreign`: own writes never come that way).
   */
  function applyConfig(c: ConfigView, foreign = false) {
    if (!isNewerConfig(configVersion, c.version)) return // a late event: newer settings are shown already
    if (foreign) foreignVersion = Math.max(foreignVersion, c.version)
    const shift = configShift(lastConfig, c)
    const archiveNow = archiveShift(lastConfig, c)
    lastConfig = c
    states = c.states
    host.setKeywords(states.map((s) => s.keyword))
    // The open board dialog follows its board by name (a hand edit can rename or reorder boards).
    if (settingsFor !== null && !boardSaving) {
      const d = boardDialogAfterConfig({ index: settingsFor, name: settingsForName }, c.boards)
      settingsFor = d.index
      if (d.notice) notify({ kind: 'refused', message: d.notice })
    }
    boardList = c.boards
    archiveDays = c.archiveAfterDays
    autoArchiveOn = c.autoArchive
    gitSettings = c.git
    configVersion = c.version
    // Task states and board columns are computed when a view is built: what is shown loads again.
    if (shift.tasks) refreshTasks()
    if (shift.board && boards.index !== null) boards.refresh()
    // New states are counted at once, so their rows never show a count from before them.
    if (shift.tasks && settings.shown) void exec({ type: 'states.usage' })
    // Right after the setting changed (here or by hand), the due tasks are archived.
    if (archiveNow) void autoArchive.run()
  }

  /** The shown page, its references, the feed's loaded days and All pages load again, so new task states show. */
  function refreshTasks() {
    if (page) {
      reloads.request(page.key)
      refreshRefs.request()
    }
    const loaded = days
    if (loaded?.size) void client.run({ type: 'pages.get', keys: [...loaded] }).catch(refuse)
    if (allPages.shown) allPages.refresh()
  }

  let lastGeneration: number | null = null
  function apply(out: Output, cmd: Command) {
    if (out.folder) {
      // A new notes folder: no old tree while the new one is on its way, no old "show more".
      if (isNewFolder(lastGeneration, out.folder.generation)) {
        tree = null
        boards.newFolder()
        status.clear('index') // the old folder's build; its final emit clears it too
        lastConfig = null // the new folder's first config is not a change of what is shown
        foreignVersion = 0
        // Block ids start again: nothing keyed by the old folder's blocks or pages may carry over.
        host.newFolder()
        nav.clear() // the old folder's pages and boards
        settings.close()
        gitLog.close()
        archiveView.close() // its rows name the old folder's blocks
        network.newFolder()
        search.close()
        folded.clear()
        madeInRefs.clear()
        notices.newFolder() // their actions would run on the old folder's pages
        reloads.clear()
        justRenamed.clear()
        noticeTitles.clear()
      }
      lastGeneration = out.folder.generation
      if (out.folder.path !== folder) void hiddenCols.open(out.folder.path)
      folder = out.folder.path
      client.setGeneration(out.folder.generation)
    }
    if (out.config) applyConfig(out.config)
    if (out.git) {
      // An answer can carry a view newer than the last `git:changed` (the shell stores it before emitting).
      if (gitLog.shown && historyStale(git.view, out.git)) gitLog.refresh()
      git.set(out.git)
    }
    if (out.usage) settings.applyUsage(out.usage, out.usageSkipped ?? 0)
    if (out.graph) network.applyGraph(out.graph)
    if (out.board) boards.applyBoard(out.board, cmd)
    if (out.tree && isNewer(tree, out.tree)) tree = out.tree
    // Before the new notices, so a page that failed again keeps its fresh one.
    if (out.saved.length) notices.saved(out.saved)
    out.notices.forEach(notify)
    // A page that is back (in an output) makes a later removal of it news again.
    echoes.ownRemovals(out.removed, out.page?.key ?? null)
    // The edited block's text in the view about to be replaced (a refresh compares it).
    const before = host.editingId === null ? null : (host.blockOf(host.editingId)?.text ?? null)
    // An applied feed answer is shown: the editor closes if it replaced the page or dropped the edited day.
    const feedShown = out.feed !== null && journal.applyFeed(out.feed)
    if (out.pages.length) journal.applyPages(out.pages)
    const r = route(
      out,
      cmd,
      {
        page: page?.key ?? null,
        days,
        groups: new Set(refs?.groups.map((g) => g.page)),
        editingInRefs: inRefs(host.editingId),
        allPages: allPages.shown,
        settings: settings.shown,
        graph: network.shown,
        gitLog: gitLog.shown,
        archive: archiveView.shown,
        board: boards.index !== null,
        card: boards.card?.key ?? null,
      },
      feedShown,
    )
    // Before anything changes the view: the step being left keeps its scroll position.
    if (r.resetScroll) rememberHere()
    // Steps follow a rename or a move made here; pages that are gone leave the history.
    if ((cmd.type === 'page.rename' || cmd.type === 'page.move') && out.page && out.page.key !== cmd.key) {
      nav.renamed(cmd.key, out.page.key)
    }
    out.removed.forEach((k) => nav.removed(k))
    if (r.leaveBoard) boards.close()
    if (r.leaveAllPages) allPages.close()
    if (r.leaveSettings) settings.close()
    if (r.leaveGraph) network.close()
    if (r.leaveGitLog) gitLog.close()
    if (r.leaveArchive) archiveView.close()
    if (out.table) allPages.applyTable(out.table)
    if (out.archive) archiveView.applyArchive(out.archive)
    if (out.search) search.applySearch(out.search)
    if (out.names) search.applyNames(out.names)
    if (r.leavePage) {
      page = null
      refs = null
    }
    if (r.clearSelection) sel.clear()
    if (r.closeFeed) journal.close()
    if (r.resetScroll && scroller) scroller.scrollTop = scroller.scrollLeft = 0
    if (r.show) page = r.show
    if (r.moved) {
      refs = null
      madeInRefs.clear()
    }
    if (r.days.length) journal.applyPages(r.days)
    if (out.removed.length) journal.removed(out.removed)
    if (r.applyRefs) {
      refs = out.refs
      madeInRefs.clear()
      if (host.editingId !== null) host.reconcile(null).catch((e) => console.error('editor update failed', e))
    }
    if (r.madeInRefs !== null) madeInRefs.add(r.madeInRefs)
    for (const p of r.patch) refs = patchRefs(refs!, p, madeInRefs)
    r.own.forEach((p) => echoes.ownPage(p))
    if (r.refreshRefs) refreshRefs.request()
    // The open card follows its own edits (Boards.changed skips our echoes).
    for (const p of r.cardPages) boards.patchCard(p, out.focus?.id ?? null)
    // Opened first, so the board holds its reload until the new card closes.
    if (r.openAdded && out.page && out.focus && cmd.type === 'journal.append') openAdded(out.page, out.focus.id, cmd.text)
    // "+ Add" answered after the user left the board: the bare block goes again.
    if (r.strayAdded !== null) void exec({ type: 'blocks.delete', ids: [r.strayAdded] })
    if (r.refreshAllPages) allPages.refresh()
    if (r.refreshBoard) {
      if (out.removed.length) boards.removed(out.removed)
      else boards.refresh()
    }
    host.apply(cmd, r.dropFocus ? { ...out, focus: null } : out, r.shown, before)
  }

  /** "+ Add" was answered: its new block opens as a card, the caret after `KEYWORD `. */
  function openAdded(day: Page, id: BlockId, text: string) {
    const card = cardOf(day, id)
    // Another card opened meanwhile stays open; the new block is deleted again.
    if (!card || !boards.openAdded(card, text, text)) return
    // The block's own text below the keyword (its `created::` line) stays.
    const block = day.blocks.find((b) => b.id === id)
    void tick().then(() => host.edit(id, text.length + 1, addedText(block?.text ?? text, text)))
  }

  function refuse(e: unknown) {
    if (recovery.quiet(errorCode(e), null)) return
    notify({ kind: 'refused', message: errorMessage(e) })
  }

  // ---- page actions -----------------------------------------------------------

  /** A click on a rendered block: Shift extends from the edited or selected block, else edit. */
  function clickBlock(id: BlockId, shift: boolean) {
    const from = host.editingId ?? sel.anchor
    // Multi-select stays within the page's own outline, or within one day of the feed.
    if (shift && from !== null && extendsTo(journal.feed, page, from, id)) sel.select(from, id)
    else host.editAtEnd(id)
  }

  function toggle(id: BlockId) {
    if (folded.has(id)) folded.delete(id)
    else folded.add(id)
  }

  function startWriting() {
    if (page) void exec({ type: 'block.insert', page: page.key, after: null, text: '' })
  }

  /**
   * Leaves whatever the main area shows for view `keep`: closes the open card (a bare added card is deleted),
   * leaves the editor, closes every other view, clears the page, refs and selection, and scrolls to the top.
   */
  async function leaveMainView(
    keep: 'feed' | 'board' | 'allPages' | 'archive' | 'settings' | 'graph' | 'gitLog' | 'newPage',
  ): Promise<void> {
    rememberHere() // before the scroll goes to the top
    await closeCard() // a card closing (Esc, a click outside) finishes on the board it belongs to
    host.leave()
    if (keep !== 'board') boards.close()
    if (keep !== 'allPages') allPages.close()
    if (keep !== 'archive') archiveView.close()
    if (keep !== 'feed') journal.close()
    if (keep !== 'settings') settings.close()
    if (keep !== 'graph') network.close()
    if (keep !== 'gitLog') gitLog.close()
    page = null
    refs = null
    sel.clear()
    if (scroller) scroller.scrollTop = scroller.scrollLeft = 0
  }

  /**
   * `Ctrl N` or the "+" by Pages: an untitled page opens in the folder of the page shown. Nothing is created until
   * it has a title (the file itself only appears once the user types, as for any new page).
   */
  async function startNewPage() {
    if (dialogOpen() || search.shown) return
    const inFolder = tree && page ? folderOf(tree, page.key) : ''
    await leaveMainView('newPage')
    newPageFolder = inFolder
  }

  async function createUntitled(name: string) {
    if (newPageFolder === null) return
    try {
      await host.exec({ type: 'page.create', name, folder: newPageFolder })
    } catch (e) {
      refuse(e)
    }
  }

  // Any other view or page shown ends the untitled page.
  $effect(() => {
    const view = boards.index !== null || allPages.shown || archiveView.shown || settings.shown || network.shown || gitLog.shown
    if (page || journal.feed || view) {
      untrack(() => (newPageFolder = null))
    }
  })

  /** The home view: the journal feed, scrolled to today. */
  async function openJournal() {
    await leaveMainView('feed')
    await journal.open()
  }

  /** Jump to a date: a day the feed lists is shown in the feed; any other day opens as its page, created only when the user types. */
  async function goToDay(d: DateView): Promise<void> {
    if (d.inFeed) {
      await leaveMainView('feed')
      await journal.openAt(d.key)
    } else {
      await closeCard()
      await exec({ type: 'page.open', name: d.key })
    }
  }

  // ---- date picker ------------------------------------------------------------

  /** The date picker by the sidebar's Journal row is open. */
  let pickerOpen = $state(false)
  /** Set when the slash menu's "Date…" opened the picker: a pick goes to the editor, not to the journal. */
  let pickerInsert: ((key: string) => void) | null = null

  $effect(() => {
    if (!pickerOpen) pickerInsert = null
  })

  /** `Ctrl Shift D` opens it (a hidden sidebar is shown first), a second press closes it; not over a dialog. */
  function togglePicker() {
    if (pickerOpen) pickerOpen = false
    else if (!dialogOpen() && !search.shown) {
      if (sidebarHidden) toggleSidebar()
      pickerOpen = true
    }
  }

  // A dialog or the search box coming up closes the picker.
  $effect(() => {
    if (dialogOpen() || search.shown) untrack(() => (pickerOpen = false))
  })

  /** A picked day jumps as a typed date does; the edited block's text is sent first. Nothing is written. */
  async function pickDay(key: string) {
    if (pickerInsert) {
      const insert = pickerInsert
      pickerInsert = null
      insert(key)
      return
    }
    host.leave()
    sel.clear()
    try {
      const d = (await client.run({ type: 'journal.day', key })).day
      if (d) await goToDay(d)
    } catch (e) {
      refuse(e)
    }
  }

  // ---- search -----------------------------------------------------------------

  /**
   * `Ctrl K` or the sidebar box: only with a folder open and not over another dialog; the edited block's text is
   * sent first, and Esc edits it again. The card stays open underneath.
   */
  function openSearch() {
    if (dialogOpen()) return
    const editing = host.editingId
    host.leave()
    sel.clear()
    search.show(editing)
  }

  /** A chosen row: the dialog closes, then the day, the page (made in memory) or the block is shown. */
  function chooseRow(row: SearchRow) {
    search.close()
    if (row.kind === 'date') void goToDay(row)
    else if (row.kind === 'page' || row.kind === 'create') void openPage(row.name)
    else if (row.kind === 'hit') void jumpTo(row.page, row.id)
  }

  // ---- boards -----------------------------------------------------------------

  /** The editor's text if it is on the open card's root block (`closeCard` then needs no flush). */
  function cardRootText(): string | undefined {
    const ed = host.editor
    return ed && ed.id === cardRoot(boards.card) ? ed.ed.text() : undefined
  }

  /** Closes the open card; settles once it is closed. */
  function closeCard(): Promise<void> {
    if (!boards.card) return Promise.resolve()
    const rootText = cardRootText() // before `leave` drops the editor
    host.leave()
    return boards.closeCard(rootText)
  }

  async function openBoard(i: number) {
    await leaveMainView('board')
    void boards.open(i)
  }

  // ---- All pages --------------------------------------------------------------

  /** The All pages table in the main area (§7.7); sort and switch stay, the filter empties. */
  async function openAllPages() {
    await leaveMainView('allPages')
    void allPages.open()
  }

  // ---- Archive ----------------------------------------------------------------

  /** Every archived task in the main area; the filter empties. A row jumps to its block (`jumpTo`). */
  async function openArchive() {
    await leaveMainView('archive')
    void archiveView.open()
  }

  // ---- Graph ------------------------------------------------------------------

  /** The Graph screen in the main area (§7.11); the filters stay as they were. */
  async function openGraph() {
    if (dialogOpen() || search.shown) return
    await leaveMainView('graph')
    void network.open()
  }

  // ---- Git history -------------------------------------------------------------

  /** The status bar button opens the history in the main area; a second click is Back. */
  async function toggleGitLog() {
    if (gitLog.shown) return go('back')
    if (dialogOpen() || search.shown) return
    await leaveMainView('gitLog')
    void gitLog.open()
  }

  /** A sidebar row was dragged onto `folder`: the edited block's text goes first, then the move. */
  async function dropRow(row: Row, folder: string) {
    host.leave()
    await client.flush()
    await flows.moveTo(row, folder)
  }

  /** Opens page `name`, closing an open card first. A clicked `link` target `Page#Heading` opens `Page`. */
  async function openPage(name: string, link = false) {
    await closeCard()
    await exec({ type: 'page.open', name, link: link || undefined })
  }

  async function openCard(c: CardView, column: string) {
    await closeCard()
    boards.openCard(cardFromView(c), column)
    await tick()
    host.editAtEnd(c.id)
  }

  /** "+ Add": a new `KEYWORD` block at the end of today's journal; its answer opens it as a card (`openAdded`). */
  async function addCard(column: string) {
    await closeCard()
    await exec({ type: 'journal.append', text: column })
  }

  /** Jump to block `id` of page `key` (a card, a search match): the page shown, the block's ancestors unfolded, the block in the middle of the view and highlighted. */
  async function jumpTo(key: string, id: BlockId): Promise<void> {
    await closeCard()
    await exec({ type: 'page.show', key })
    if (!page?.blocks.some((b) => b.id === id)) return
    for (const a of ancestorsOf(page.blocks, id)) folded.delete(a)
    await tick()
    document.querySelector(`[data-block-id="${id}"]`)?.scrollIntoView({ block: 'center' })
    flash = id
    setTimeout(() => {
      if (flash === id) flash = null
    }, 1500)
  }

  /** Sends a command that writes config.toml; a refusal is a notice. Says whether it was accepted (and applied), else the refusal's code. */
  async function sendConfig(cmd: Command): Promise<{ ok: boolean; code: string | null }> {
    let ok = true
    let refused: string | null = null
    await host.exec(cmd, (code) => {
      ok = false
      refused = code
      // The file changed on disk (a hand edit, a pull): the session read it again; show its settings. No
      // `config:changed` follows for it, so every version from now on counts as foreign, unless the write
      // carried an older version on purpose (a board dialog after a foreign change).
      if (code === 'configChanged') {
        foreignVersion = foreignAfterRefusal(foreignVersion, configVersion, 'version' in cmd ? cmd.version : undefined)
        void exec({ type: 'config.get' })
      }
      return false
    })
    return { ok, code: refused }
  }

  /** Settings writes: typed text first, then the write with the version its values were taken from (`writeConfig`). */
  const writes: WriteEnv = {
    version: () => configVersion,
    leave: () => host.leave(),
    flush: () => client.flush(),
    send: async (cmd) => (await sendConfig(cmd)).ok,
  }

  /** The board's own settings dialog, from its title bar. */
  async function openBoardSettings() {
    await closeCard()
    if (boards.index !== null) editBoard(boards.index)
  }

  /** Hides column `keyword` of the shown board; an open card is closed first, with its text. */
  async function hideColumn(keyword: string) {
    if (boards.card !== null) await closeCard()
    const view = boards.view
    if (view) hiddenCols.hide(view.name, keyword, view.columns.map((c) => c.keyword))
  }

  /** Opens the settings dialog of board `i`; it edits the values of this config version. */
  function editBoard(i: number) {
    settingsFor = i
    settingsForName = boardList[i]?.name ?? ''
    settingsForVersion = configVersion
  }

  /**
   * A `boards.set` from the board dialog, queued after the other Settings writes (typed text is sent first). `edit`
   * makes the list from the boards shown when it is sent and the dialog's board, found again by name (`at`, -1 when
   * gone: nothing is sent). It carries the current version unless a hand edit or pull came since the dialog opened;
   * then the version it opened on, so the core refuses it. An own state rename sent while the dialog was open is
   * not foreign: the dialog's old columns are then saved over it and kept as unknown states (a known limit, accepted).
   */
  function setDialogBoards(edit: (list: BoardSummary[], at: number) => BoardSummary[]) {
    return settingWrites.run(async () => {
      let r: { ok: boolean; code: string | null } = { ok: false, code: null }
      const at = settingsIndexAfterConfig({ index: 0, name: settingsForName }, boardList) ?? -1
      if (at < 0) return { ...r, at }
      boardSaving = true
      try {
        await writeConfig(
          { ...writes, send: async (cmd) => (r = await sendConfig(cmd)).ok },
          (version) => ({ type: 'boards.set', boards: edit(boardList, at), version }),
          dialogVersion(settingsForVersion, configVersion, foreignVersion),
        )
      } finally {
        boardSaving = false
      }
      return { ...r, at }
    })
  }

  /**
   * The saved board is loaded again, so its new name and columns show. After a hand edit since the dialog
   * opened the core refuses it and the dialog closes. Any other refusal keeps the dialog and its edits.
   */
  async function saveBoard(b: BoardSummary) {
    const old = settingsForName
    const r = await setDialogBoards((list, at) => withBoard(list, at, b))
    if (r.at < 0) return
    if (r.ok && old !== b.name) {
      nav.boardRenamed(old, b.name) // the history follows the rename
      hiddenCols.renamed(old, b.name) // its hidden columns go with it
    }
    settingsFor = settingsAfterSet(settingsFor, r.at, r.ok, r.code)
    if (r.ok && boards.index === r.at) void boards.open(r.at)
  }

  /** Deleting the shown board goes to the journal; a board shown after it moves up one. */
  async function deleteBoard() {
    const r = await setDialogBoards((list, at) => withoutBoard(list, at))
    if (r.at < 0) return
    settingsFor = settingsAfterSet(settingsFor, r.at, r.ok, r.code)
    if (!r.ok) return
    const next = shownAfterDelete(boards.index, r.at)
    if (next === 'feed') await openJournal()
    else if (next !== null) void boards.open(next)
  }

  /** A new board with the default columns, shown once the answer is applied (from Settings, Settings stays). */
  async function newBoard(name: string) {
    const stay = naming === 'settings'
    naming = null
    let index = 0
    const ok = await settingWrites.run(() =>
      writeConfig(writes, (version) => {
        index = boardList.length // taken before the answer is applied
        return { type: 'boards.set', boards: [...boardList, { name, columns: defaultColumns(states) }], version }
      }),
    )
    if (ok && !stay) await openBoard(index)
  }

  // ---- Settings (§7.12) ---------------------------------------------------------

  /** Whether no folder is open or a dialog is: then no other dialog or screen opens over it. */
  function dialogOpen(): boolean {
    return (
      !folder ||
      naming !== null ||
      settingsFor !== null ||
      flows.dialog !== null ||
      closing !== null ||
      settingUpGit ||
      question !== null ||
      helpShown ||
      settings.changelog
    )
  }

  /** The Settings screen in the main area, at `section` if given; it counts the states' blocks. */
  async function openSettings(section?: SettingsSection) {
    if (dialogOpen() || search.shown) return
    await leaveMainView('settings')
    settings.open(section)
    if (!appVersionAsked) {
      appVersionAsked = true
      getAppVersion().then(
        (v) => void (appVersion = v),
        () => void (appVersionAsked = false), // the line shows the name alone; asked again when Settings opens next
      )
    }
    if (!logDirAsked) {
      logDirAsked = true
      logFolder().then(
        (dir) => void (logDir = dir),
        () => void (logDirAsked = false), // the button has no tooltip; asked again when Settings opens next
      )
    }
    await exec({ type: 'states.usage' })
  }

  /** Settings' "Open log folder"; a failure becomes a notice. */
  function openLogs() {
    openLogFolder().catch(refuse)
  }

  /** Asks a question from Settings; false when another dialog is open. */
  function confirmSetting(message: string, ok: string): Promise<boolean> {
    if (dialogOpen() || search.shown) return Promise.resolve(false)
    return new Promise((resolve) => {
      question = {
        message,
        ok,
        answer: (yes) => {
          question = null
          resolve(yes)
        },
      }
    })
  }

  /**
   * Settings writes run one at a time (`WriteQueue`): each is made once the previous answer is applied and carries
   * its version, so two quick changes are never refused as "changed on disk".
   */
  const settingWrites = new WriteQueue()

  /** Settles once every Settings write sent before is answered and applied. */
  const settingsReady = () => settingWrites.run(async () => {})

  /** As `settingsReady`, then the states' blocks are counted again (a rename or remove decides on fresh counts). */
  const countUsage = () => settingWrites.run(() => exec({ type: 'states.usage' }))

  /** `list` was made from the states of `version` (taken before any question); the usage is counted again after any answer. */
  function setStates(list: StateView[], renames: StateRename[], version: number) {
    return settingWrites.run(async () => {
      await writeConfig(writes, (v) => statesSet(list, renames, v), version)
      await exec({ type: 'states.usage' })
    })
  }

  /** Only what the user changed changes, over the Git settings shown when it is sent. */
  function setGit(patch: Partial<GitSettings>) {
    return settingWrites.run(async () => {
      const shown = gitSettings
      if (shown !== null) await writeConfig(writes, (version) => gitCommand(gitSettings ?? shown, patch, version))
    })
  }

  /** `[board]`: only what the user changed changes, over the values shown when it is sent. */
  function setBoardSettings(patch: { archiveAfterDays?: number; autoArchive?: boolean }) {
    return settingWrites.run(async () => {
      await writeConfig(writes, (version) => ({
        type: 'config.setBoard',
        archiveAfterDays: patch.archiveAfterDays ?? archiveDays,
        autoArchive: patch.autoArchive ?? autoArchiveOn,
        version,
      }))
    })
  }

  /** ↑ / ↓ on a board: it moves the board with that name in the list shown when it is sent (↑ ↑ moves it twice). */
  function moveBoardTo(i: number, dir: -1 | 1) {
    const name = boardList[i]?.name
    if (name === undefined) return Promise.resolve()
    return settingWrites.run(async () => {
      const list = moveBoardNamed(boardList, name, dir)
      if (list !== null) await writeConfig(writes, (version) => ({ type: 'boards.set', boards: list, version }))
    })
  }

  /** Applies at once; the choice is kept on this computer. */
  function chooseJournalsAt(at: JournalsAt) {
    journalsAt = at
    setJournalsAt(at).catch(refuse)
  }

  /** The wheel over the status bar's theme button: one notch, one theme (as the Ctrl+wheel zoom counts notches). */
  const themeSteps = new WheelSteps()

  function chooseTheme(c: ThemeChoice) {
    theme = c
    applyTheme(c, document.documentElement, (t) => getCurrentWindow().setTheme(t))
    setTheme(storedTheme(c)).catch(refuse)
  }

  /** Another program removed page `key`; our own commands' removals are handled where they run. */
  function pageRemoved(key: string) {
    nav.removed(key) // skipped from now on
    if (echoes.isOwnRemoval(key)) return
    allPages.refresh()
    archiveView.refresh()
    journal.removed([key])
    if (boards.index !== null) boards.removed([key])
    if (isGroup(key)) refreshRefs.request()
    // The shown page renamed a moment ago is on its way to its new key.
    if (!page || removalFor(page.key, key, justRenamed) !== 'removed') return
    notify({ kind: 'refused', message: `“${page.title}” was removed on disk.` })
    void openJournal()
  }

  /** Keys of pages another program renamed a moment ago; their removal is not news for the shown page. */
  const justRenamed = new JustRenamed(() => Date.now())

  /** Another program renamed page `r.from`: the shown page follows it, at the same scroll position. */
  async function pageRenamed(r: RenameView) {
    // Still on its way to an earlier rename's key (A→B→C fast): the chain is followed.
    nav.renamed(r.from, r.to) // the history follows the rename
    const to = followRename(page?.key ?? null, r, justRenamed)
    justRenamed.add(r.from, r.to)
    if (to === null) return
    const top = scroller?.scrollTop ?? 0
    // Renamed again meanwhile: that rename's own events follow it.
    await host.exec({ type: 'page.show', key: to }, (code) => code === 'unknownPage')
    if (page?.key === to && scroller) scroller.scrollTop = top
  }

  // ---- Git ----------------------------------------------------------------------

  /** Typed text goes first (§2), then Git commits and syncs at once. */
  async function syncGit() {
    host.leave()
    await client.flush()
    await client.run({ type: 'git.sync' }).catch(refuse)
  }

  /** A click on the Git status: sync, offer set-up, or explain a problem and try again. */
  async function clickGit() {
    const v = git.view
    if (!v) return
    switch (gitClick(v)) {
      case 'sync':
        return syncGit()
      case 'init':
        // Not over another dialog, as with the search box.
        if (dialogOpen() || search.shown) return
        settingUpGit = true
        return
      case 'explain':
        notify({
          kind: 'refused',
          message: v.problem?.message ?? 'Breccia uses the installed git command. Install Git, then restart Breccia.',
        })
        if (v.state === 'problem') return syncGit()
    }
  }

  /** The first commit holds text typed a moment before (§2). */
  async function setUpGit() {
    settingUpGit = false
    host.leave()
    await client.flush()
    await client.run({ type: 'git.init' }).catch(refuse)
  }

  /** The question asked before closing with unsaved pages, while it is open. */
  let closing = $state<string | null>(null)

  /** "Exit" in the tray menu: the normal close, with its question about unsaved pages shown in the window. */
  async function exitFromTray() {
    host.leave()
    const message = await closeCheck(client, () => notices.unsent())
    if (message === null) return closeAnyway()
    const w = getCurrentWindow()
    await w.show().catch(() => {})
    await w.unminimize().catch(() => {})
    await w.setFocus().catch(() => {})
    closing = message
  }

  function closeAnyway() {
    closing = null
    getCurrentWindow()
      .destroy()
      .catch((e) => console.error('could not close the window', e))
  }

  function saveLayout() {
    setUiState({ sidebarWidth, sidebarHidden, boardColumnWidth: boardColumn }).catch(refuse)
  }

  function toggleSidebar() {
    sidebarHidden = !sidebarHidden
    saveLayout()
  }

  /** A switch is on its way: a second click waits for nothing and does nothing. */
  let switching = false

  /**
   * Opens or creates the notes folder at `path`. With a folder open, typed text is sent first and the
   * switch is refused while anything is unsaved; the core refuses it too (`unsaved`, shown as its notice).
   */
  async function switchFolder(type: 'folder.open' | 'folder.create', path: string) {
    if (switching) return
    switching = true
    try {
      if (folder) {
        await closeCard()
        host.leave()
        const message = await switchCheck(client, () => ({
          unsent: notices.unsent(),
          unresolved: notices.unresolved().map(pageTitle),
        }))
        if (message !== null) {
          notify({ kind: 'refused', message })
          return
        }
      }
      let ok = true
      await host.exec({ type, path }, () => ((ok = false), false))
      if (ok && folder) await openFolder()
    } finally {
      switching = false
      void loadRecent()
    }
  }

  /** A page's name for a message: its title when known, else its key (a journal day's key is its date). */
  function pageTitle(key: string): string {
    return page?.key === key ? page.title : (noticeTitles.get(key) ?? key)
  }

  /** "Open folder…" or "New folder…": the system dialog, then the switch. */
  async function pickAndSwitch(type: 'folder.open' | 'folder.create') {
    const path = await pickFolder(() => openDialog({ directory: true, multiple: false }), (m) =>
      notify({ kind: 'refused', message: m }),
    )
    if (path !== null) await switchFolder(type, path)
  }

  function loadRecent(): Promise<void> {
    return recentFolders().then((l) => void (recent = l), refuse)
  }

  /** Remove: the entry leaves the list; the folder itself is never touched. */
  async function forgetRecent(path: string) {
    await forgetFolder(path).catch(refuse)
    await loadRecent()
  }

  /** A click on a folder that no longer exists explains it; Breccia never removes it by itself. */
  function recentMissing(path: string) {
    notify({ kind: 'refused', message: missingFolder(path) })
  }

  // The list is read again whenever the Notes folder section or the Welcome screen comes into view.
  $effect(() => {
    if (ready && (settings.shown || !folder)) untrack(() => void loadRecent())
  })

  async function openFolder() {
    await exec({ type: 'config.get' })
    await openJournal()
    await exec({ type: 'folder.tree' })
    // Once the folder is loaded, the tasks due are archived (the first run may archive many).
    void autoArchive.run()
  }

  const folderName = $derived(folder ? (folder.split(/[\\/]/).filter(Boolean).pop() ?? folder) : '')

  // ---- DOM events -----------------------------------------------------------

  /** Every anchor click is ours: the webview itself never navigates. */
  function onAnchorClick(e: MouseEvent) {
    // A click on a task's label (TODO, DOING, …) in a page or the journal steps to the next state.
    const label = (e.target as Element | null)?.closest?.('.block .content .st')
    if (label) {
      const id = Number(label.closest('[data-block-id]')?.getAttribute('data-block-id'))
      e.preventDefault()
      e.stopPropagation()
      if (e.type === 'click' && e.button === 0 && Number.isFinite(id)) void exec({ type: 'block.stepState', id })
      return
    }
    const a = (e.target as Element | null)?.closest?.('a')
    if (!a) return
    e.preventDefault()
    e.stopPropagation()
    if (e.type !== 'click' || e.button !== 0) return
    const what = linkClick({
      className: a.className,
      dataPage: a.getAttribute('data-page'),
      dataName: a.getAttribute('data-name'),
      href: a.getAttribute('href'),
      mod: e.ctrlKey || e.metaKey,
    })
    if (what.kind === 'page') void openPage(what.name, what.link)
    else if (what.kind === 'external') openUrl(what.url).catch(refuse)
  }

  /**
   * A press outside the editor leaves the block; one on another block switches to it.
   * A plain press clears a selection; a Shift press on a block extends it (on click).
   */
  function onPointerDown(e: MouseEvent) {
    const t = e.target as Element | null
    // The search dialog and its backdrop sit over the main area: a press there, even one that dismisses
    // the search, is not a press outside the card or the editor. bits-ui closes it on the click, after this.
    // The date picker too: a press on it leaves the edited block alone, so Esc can go back to it. The theme menu
    // likewise: a pick gives the focus back to the edited block.
    if (search.shown || helpShown || !t?.closest || t.closest('.slash-menu') || t.closest('[data-date-picker]') || t.closest('[data-theme-menu]')) return
    // The ? button opens the list, and the theme button its menu, without taking the focus (or the editing) from
    // the block.
    if (t.closest('[data-testid="status-item"]:is([data-id="help"], [data-id="theme"])')) {
      e.preventDefault()
      return
    }
    // A press outside the open card closes it.
    if (boards.card && !t.closest('[data-card-open]')) {
      void closeCard()
      return
    }
    const onBlock = t.closest('.block .content') !== null
    if (e.shiftKey && onBlock && (host.editingId !== null || sel.ids.length)) {
      // No DOM text selection: the click selects blocks.
      e.preventDefault()
      return
    }
    if (sel.ids.length && !e.shiftKey) sel.clear()
    if (host.editingId === null) return
    if (t.closest('.editor-slot') || onBlock) return
    host.leave()
  }

  onMount(() => {
    const stopThemeTokens = watchThemeTokens(document.documentElement)
    const removeDom = installDom({
      click: onAnchorClick,
      pointerDown: onPointerDown,
      key: (e) => sel.onKey(e),
      keyCapture: (e) => {
        const k = { key: e.key, shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey, meta: e.metaKey }
        if (isHelpKey(k)) {
          // Before the editor and before WebView2's own F1 (its help page).
          e.preventDefault()
          e.stopPropagation()
          if (!e.repeat) toggleHelp()
          return
        }
        if (isDatePickerKey(k, mac)) {
          // Before the editor, so it works while a block is edited.
          e.preventDefault()
          e.stopPropagation()
          if (!e.repeat) togglePicker()
          return
        }
        const n = navKey(k, mac)
        if (n) {
          // Before the editor (its Alt ← moves by syntax unit), so it works while a block is edited.
          e.preventDefault()
          e.stopPropagation()
          void go(n)
          return
        }
        const z = zoomKey(k, mac)
        if (z) {
          e.preventDefault()
          e.stopPropagation()
          if (z === 'reset') void zoom.reset()
          else void zoom.step(z === 'in' ? 1 : -1)
          return
        }
        const searchKey = isSearchKey(k, mac)
        const newPageKey = isNewPageKey(k, mac)
        if (!searchKey && !newPageKey && !isSettingsKey(k, mac)) return
        e.preventDefault()
        e.stopPropagation()
        if (searchKey) openSearch()
        else if (newPageKey) void startNewPage()
        else void openSettings()
      },
      scroll: () => host.closeMenu(),
    })
    // Ctrl and the wheel zoom the window; the graph and the page never see it.
    const wheel = new WheelSteps()
    const onWheel = (e: WheelEvent) => {
      if (!(mac ? e.metaKey : e.ctrlKey)) return
      e.preventDefault()
      e.stopPropagation()
      // deltaY is in CSS px, so a notch is smaller the more the window is zoomed in.
      const dir = wheel.add(Math.round((e.deltaY * zoom.percent) / 100))
      if (dir) void zoom.step(dir)
    }
    document.addEventListener('wheel', onWheel, { capture: true, passive: false })
    // Other views and programs change pages too (§9). Our own commands' echoes are skipped.
    const shell = listenShell({
      pageChanged: (p) =>
        inFlight.idle.run(() => {
          search.refresh() // an open search box asks again
          journal.changed(p)
          // The table reloads for another program's change (§6); our own echoes it has already.
          if (allPages.changed(echoes.isOwnPage(p))) return
          // The Archive view too: an automatic archive or another program's change shows.
          if (archiveView.changed(echoes.isOwnPage(p))) return
          // The graph reloads the same way (§6).
          if (network.changed(echoes.isOwnPage(p))) return
          if (boards.index !== null) {
            // The board reloads (held while a card is open); the open card follows its page.
            if (boards.changed(p, echoes.isOwnPage(p))) {
              host.reconcile(null).catch((err) => console.error('editor update failed', err))
            }
            return
          }
          pageChanged(
            {
              shows: (key) => key === page?.key || (days?.has(key) ?? false),
              active: () => page !== null || journal.feed !== null,
              own: (q) => echoes.isOwnPage(q),
              isGroup,
              reload: (key) => reloads.request(key),
              patch: (q) => (refs = patchRefs(refs!, q, madeInRefs)),
              refresh: () => refreshRefs.request(),
              reconcile: () => host.reconcile(null).catch((err) => console.error('editor update failed', err)),
            },
            p,
          )
        }),
      treeChanged: (t) => {
        if (isNewer(tree, t)) tree = t
        search.refresh()
        search.refreshNames()
        allPages.refresh() // a page added, moved or removed on disk
        network.refresh()
      },
      pageRemoved: (key) =>
        inFlight.idle.run(() => {
          search.refresh()
          network.refresh()
          pageRemoved(key)
        }),
      notices: (ns) => ns.forEach(notify),
      // Pages a Git retry saved after a failed save: their "could not be saved" notice goes.
      pagesSaved: (keys) => {
        if (keys.length) notices.saved(keys)
      },
      // Held like the page events, so a command's answer never overwrites a newer view.
      gitChanged: (v) =>
        inFlight.idle.run(() => {
          const moved = git.headChanged(v)
          // A new commit or a push shows in the open history.
          if (gitLog.shown && historyStale(git.view, v)) gitLog.refresh()
          git.set(v)
          if (moved && allPages.shown) allPages.refresh() // created dates from Git
        }),
      // In event order with `page:removed`, which follows it for the old key.
      pageRenamed: (r) =>
        inFlight.idle.run(() => {
          network.refresh()
          void pageRenamed(r)
        }),
      configChanged: (c) => inFlight.idle.run(() => applyConfig(c, true)),
      // The shell ends every build with `{done: t, total: t}`, so the item always goes away.
      indexChanged: (p) => {
        const item = indexItem(p, lastGeneration)
        if (item === 'ignore') return
        if (item) status.set(item)
        else status.clear('index')
      },
      // Text typed in the last moment before closing is still in the typing pause;
      // pages that still could not be saved, and text shown in unsent notices, are named before closing.
      trayExit: () => void exitFromTray(),
      recovered: (e) => void recovery.recovered(e).catch(refuse),
      closeRequested: async (event) => {
        if (inTray) {
          // The close button only hides the window; the text typed a moment ago is saved first.
          event.preventDefault()
          host.leave()
          await flushBeforeClose(client)
          await getCurrentWindow().hide().catch((e) => console.error('could not hide the window', e))
          return
        }
        // The editor closes first, so a state typed by hand gets its lines before the queue is flushed.
        host.leave()
        const message = await closeCheck(client, () => notices.unsent())
        if (message === null) return
        event.preventDefault()
        closing = message
      },
    })
    // At local midnight the feed reloads, so the new day is at the top.
    const stopMidnight = everyMidnight(() => journal.refresh())
    // "Saved to Git 2 min ago" moves on.
    const gitClock = setInterval(() => git.tick(), 30_000)
    // Once an hour, so a new day is noticed while the app runs.
    const stopArchive = hourly(() => void autoArchive.run())
    ;(async () => {
      try {
        // A layout that cannot be read is the default one; the folder still opens.
        const layout = await loadLayout(uiState)
        sidebarWidth = layout.width
        sidebarHidden = layout.hidden
        boardColumn = layout.boardColumn
        zoom.restore(layout.zoom)
        theme = layout.theme
        journalsAt = layout.journalsAt
        applyTheme(layout.theme, document.documentElement, (t) => getCurrentWindow().setTheme(t))
        gitInstalled().then((ok) => void (hasGit = ok), () => {})
        inTray = await trayEnabled().catch(() => false)
        await shell.ready
        await exec({ type: 'folder.status' })
        // After `shell.ready`: every later change arrives as `git:changed`.
        await exec({ type: 'git.status' })
        if (folder) await openFolder()
        ;(await startupNotices()).forEach(notify)
      } catch (e) {
        refuse(e)
      }
      ready = true
    })()
    return () => {
      stopThemeTokens()
      stopMidnight()
      clearInterval(gitClock)
      stopArchive()
      removeDom()
      document.removeEventListener('wheel', onWheel, true)
      shell.stop()
      host.close()
    }
  })
</script>

{#if ready}
  <div class="shell">
    <Notices items={notices.items} ondismiss={(id) => notices.dismiss(id)} />
    {#if linkMenu}
      <CaretMenu menu={linkMenu} testid="link-menu" onchoose={(i) => host.chooseMenu('link', i)} />
    {:else if slashMenu}
      <CaretMenu menu={slashMenu} testid="slash-menu" onchoose={(i) => host.chooseMenu('slash', i)} />
    {/if}
    <FlowDialog {flows} />
    {#if settingUpGit}
      <ConfirmDialog
        message="Keep this notes folder in Git? Breccia runs git init here and adds a .gitignore and a .gitattributes file."
        ok="Set up Git"
        onok={() => void setUpGit()}
        oncancel={() => (settingUpGit = false)}
      />
    {/if}
    {#if closing}
      <ConfirmDialog message={closing} ok="Close anyway" onok={closeAnyway} oncancel={() => (closing = null)} />
    {/if}
    {#if question}
      {@const q = question}
      <ConfirmDialog message={q.message} ok={q.ok} onok={() => q.answer(true)} oncancel={() => q.answer(false)} />
    {/if}
    {#if settingsFor !== null && boardList[settingsFor]}
      {@const i = settingsFor}
      <BoardSettings
        board={boardList[i]}
        {states}
        onsave={(b) => void saveBoard(b)}
        ondelete={() => void deleteBoard()}
        oncancel={() => (settingsFor = null)}
      />
    {/if}
    {#if search.shown}
      <SearchDialog {search} {states} onchoose={chooseRow} />
    {/if}
    {#if helpShown}
      <ShortcutsDialog {mac} onclose={() => (helpShown = false)} />
    {/if}
    {#if settings.changelog}
      <ChangelogDialog version={appVersion} onclose={() => settings.hideChangelog()} />
    {/if}
    {#if naming !== null}
      <NameDialog title="New board" initial="" onok={(name) => void newBoard(name)} oncancel={() => (naming = null)} />
    {/if}
    {#if folder}
      <div class="body">
        {#if !sidebarHidden}
          <Sidebar
            {folder}
            {folderName}
            {tree}
            {journalsAt}
            shown={page?.key ?? null}
            journalShown={journal.feed !== null}
            allPagesShown={allPages.shown}
            onallpages={() => void openAllPages()}
            settingsShown={settings.shown}
            onsettings={() => void openSettings()}
            graphShown={network.shown}
            ongraph={() => void openGraph()}
            onfolder={() => void openSettings('folder')}
            onsearch={openSearch}
            width={sidebarWidth}
            onopen={(name) => void openPage(name)}
            onjournal={() => void openJournal()}
            boards={boardList}
            boardShown={boards.index}
            archiveShown={archiveView.shown}
            onarchive={() => void openArchive()}
            onboard={(i) => void openBoard(i)}
            onnewboard={() => (naming = 'sidebar')}
            onop={(op, row) => flows.start(op, row)}
            ondrop={dropRow}
            onnewpage={() => void startNewPage()}
            onresize={(w) => (sidebarWidth = w)}
            onresized={saveLayout}
            bind:pickerOpen
            onpickday={(key) => void pickDay(key)}
          />
        {/if}
        <div class="main-wrap">
          <button class="toggle-side" aria-label="Toggle sidebar" onclick={toggleSidebar}>☰</button>
          <div class="nav-btns">
            <button
              class="nav-btn"
              data-testid="nav-back"
              aria-label="Back"
              title={mac ? 'Back (Cmd+[)' : 'Back (Alt+←)'}
              disabled={!nav.canBackFrom(here)}
              onclick={() => void go('back')}>←</button
            >
            <button
              class="nav-btn"
              data-testid="nav-forward"
              aria-label="Forward"
              title={mac ? 'Forward (Cmd+])' : 'Forward (Alt+→)'}
              disabled={!nav.canForward}
              onclick={() => void go('forward')}>→</button
            >
          </div>
          <div class="main" use:autoHideScrollbar bind:this={scroller}>
            {#if newPageFolder !== null}
              <NewPageView onsubmit={(name) => void createUntitled(name)} oncancel={() => void openJournal()} />
            {:else if settings.shown}
              <SettingsView
                {folder}
                recent={recentRows(recent, folder)}
                section={settings.section}
                {states}
                usage={settings.usage}
                skipped={settings.skipped}
                boards={boardList}
                {archiveDays}
                autoArchive={autoArchiveOn}
                git={gitSettings}
                {theme}
                {mac}
                version={configVersion}
                {appVersion}
                {hasGit}
                logFolder={logDir}
                onstates={setStates}
                onconfirm={confirmSetting}
                onready={settingsReady}
                onusage={countUsage}
                onboard={editBoard}
                onmoveboard={(i, dir) => void moveBoardTo(i, dir)}
                onnewboard={() => (naming = 'settings')}
                onarchivedays={(archiveAfterDays) => setBoardSettings({ archiveAfterDays })}
                onautoarchive={(on) => setBoardSettings({ autoArchive: on })}
                ongit={setGit}
                onhelp={toggleHelp}
                ontheme={chooseTheme}
                {journalsAt}
                onjournalsat={chooseJournalsAt}
                onpickfolder={(type) => void pickAndSwitch(type)}
                onopenfolder={(path) => void switchFolder('folder.open', path)}
                onforgetfolder={(path) => void forgetRecent(path)}
                onmissingfolder={recentMissing}
                onopenlogs={openLogs}
                onchangelog={() => settings.showChangelog()}
              />
            {:else if network.shown}
              <!-- Loaded the first time the graph opens: the main bundle stays small. -->
              {#await import('./components/NetworkView.svelte') then { default: NetworkView }}
                <NetworkView {network} onopen={(name) => void openPage(name)} />
              {/await}
            {:else if boards.index !== null}
              {#if boards.view}
                <Board
                  board={boards.view}
                  card={boards.card}
                  cardColumn={boards.cardColumn}
                  {folded}
                  editingId={host.editingId}
                  {flash}
                  expanded={boards.expanded}
                  onmore={(id) => boards.expand(id)}
                  onopencard={(c, column) => void openCard(c, column)}
                  onedit={clickBlock}
                  ontoggle={toggle}
                  onjump={(c) => void jumpTo(c.page, c.id)}
                  onadd={(column) => void addCard(column)}
                  onclosecard={() => void closeCard()}
                  {archiveDays}
                  oncommand={(cmd) =>
                    // A drop refused because the column changed since it was shown: the notice says so, the board reloads.
                    void host.exec(cmd, (code) => {
                      if (code === 'boardChanged') boards.refresh()
                      return false
                    })}
                  onsettings={() => void openBoardSettings()}
                  hidden={hiddenCols.of(boards.view.name, boards.view.columns.map((c) => c.keyword))}
                  peek={hiddenCols.peek}
                  onhide={(k) => void hideColumn(k)}
                  onshow={(k) => boards.view && hiddenCols.show(boards.view.name, k)}
                  onpeek={(k) => hiddenCols.peekOpen(k)}
                  onpeekend={() => hiddenCols.endPeek()}
                  columnWidth={boardColumn}
                  oncolumnwidth={(w, final) => {
                    boardColumn = w
                    if (final) saveLayout()
                  }}
                />
              {/if}
            {:else if gitLog.shown}
              <!-- Loaded the first time the history opens, like the graph: the main bundle stays small. -->
              {#await import('./components/GitLogView.svelte') then { default: GitLogView }}
                <GitLogView log={gitLog} />
              {/await}
            {:else if archiveView.shown}
              <!-- Loaded the first time the Archive opens, like the Git history: the main bundle stays small. -->
              {#await import('./components/ArchiveView.svelte') then { default: ArchiveView }}
                <ArchiveView archive={archiveView} onopen={(r) => void jumpTo(r.page, r.id)} />
              {/await}
            {:else if allPages.shown && scroller}
              <AllPagesView
                pages={allPages}
                {scroller}
                onopen={(r) =>
                  void exec(r.linkedOnly ? { type: 'page.open', name: r.name } : { type: 'page.show', key: r.key })}
              />
            {:else if journal.feed && scroller}
              <JournalFeed
                feed={journal.feed}
                {scroller}
                {folded}
                editingId={host.editingId}
                selected={sel.ids}
                onedit={clickBlock}
                ontoggle={toggle}
                onrange={(from, to) => journal.want(from, to)}
                target={journal.target}
                ontarget={() => journal.targetReached()}
                onopen={(key) => void exec({ type: 'page.open', name: key })}
                onstart={(key) => void exec({ type: 'block.insert', page: key, after: null, text: '' })}
                onsetcolor={(key, color) => void exec({ type: 'page.setColor', key, color })}
              />
            {:else if page}
              <PageView
                {page}
                {refs}
                {folded}
                editingId={host.editingId}
                selected={sel.ids}
                onedit={clickBlock}
                ontoggle={toggle}
                onstart={startWriting}
                {flash}
                onrename={(name) => void flows.rename(page!.key, page!.name, name)}
                onopen={(name) => void exec({ type: 'page.open', name })}
                onsetcolor={(color) => void exec({ type: 'page.setColor', key: page!.key, color })}
                onlinkcolor={(key, color) => void exec({ type: 'page.setColor', key, color })}
                onhistory={(redo) => void exec({ type: redo ? 'history.redo' : 'history.undo', page: page!.key })}
              />
            {/if}
          </div>
        </div>
      </div>
    {:else}
      <Welcome
        {recent}
        onpick={(type) => void pickAndSwitch(type)}
        onopen={(path) => void switchFolder('folder.open', path)}
        onforget={(path) => void forgetRecent(path)}
        onmissing={recentMissing}
      />
    {/if}
    <StatusBar left={status.left} right={status.right} onitem={(id) => (id === 'git' ? void clickGit() : id === 'gitLog' ? void toggleGitLog() : id === 'zoom' ? void zoom.reset() : id === 'help' && toggleHelp())} {theme}
      ontheme={chooseTheme}
      onthemewheel={(dy) => {
        const c = wheelTheme(theme, themeSteps, dy, zoom.percent)
        if (c !== null) chooseTheme(c)
      }} />
  </div>
{/if}
