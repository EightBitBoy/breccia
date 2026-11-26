<script lang="ts">
  import { onMount, tick, untrack } from 'svelte'
  import { getCurrentWindow } from '@tauri-apps/api/window'
  import { getCurrentWebview } from '@tauri-apps/api/webview'
  import { openUrl } from '@tauri-apps/plugin-opener'
  import { open as openDialog } from '@tauri-apps/plugin-dialog'
  import {
    invokeRun,
    startupNotices,
    startupOpen,
    uiState,
    setUiState,
    setTheme,
    setJournalsAt,
    setLinkDisplay,
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
  import { answerOf } from './lib/answer'
  import { flushBeforeClose } from './lib/api'
  import { AppController, type KeptView } from './lib/app.svelte'
  import { closeCheck } from './lib/close'
  import { openingText, startupSequence } from './lib/startup'
  import { autoHideScrollbar } from './lib/scrollFade'
  import { listenShell } from './lib/shellEvents'
  import { installDom } from './lib/dom'
  import { headingBlock, linkClick, linkHeading } from './lib/links'
  import { extendsTo } from './lib/route'
  import { linkDisplay } from './lib/linkDisplay.svelte'
  import type { LinkDisplay } from './lib/linkDisplay'
  import { everyMidnight } from './lib/feed'
  import { today } from './lib/today.svelte'
  import { editablePageOf } from './lib/editable'
  import { watchLinkDrops } from './lib/dnd'
  import { linkDrop, type LinkSpot } from './lib/linkDrop'
  import { ancestorsOf } from './lib/tree'
  import { cardFromView, shownAfterDelete } from './lib/board'
  import { hourly } from './lib/autoArchive'
  import { clampWidth, loadLayout } from './lib/sidebarLayout'
  import type { JournalsAt } from './lib/treeRows'
  import { applyTheme, storedTheme, type ThemeChoice } from './lib/theme'
  import type { Row } from './lib/treeRows'
  import { WheelSteps, zoomKey } from './lib/zoom'
  import { wheelTheme } from './lib/themeWheel'
  import { statusAction, themeItem } from './lib/status'
  import { gitClick } from './lib/git'
  import type { SearchRow } from './lib/search'
  import { historyKey, isDatePickerKey, isHelpKey, isNewPageKey, isSearchKey, isSettingsKey, navKey } from './lib/keys'
  import { topDayOf, type NavFocus } from './lib/nav'
  import type { NavEntry } from './lib/nav.svelte'
  import { folderOf } from './lib/pageOps'
  import type { SettingsSection } from './lib/settings.svelte'
  import { missingFolder, pickFolder, recentRows, switchCheck } from './lib/folderSwitch'
  import { watchThemeTokens } from './lib/themeTokens.svelte'
  import type { BlockId, BoardSummary, CardView, Command, DateView, Notice, RecentFolder } from './lib/types'
  import { mountEditor } from './editor/blockEditor'
  import Sidebar from './components/Sidebar.svelte'
  import Welcome from './components/Welcome.svelte'
  import PageView from './components/PageView.svelte'
  import JournalFeed from './components/JournalFeed.svelte'
  import Board from './components/Board.svelte'
  import AllPagesView from './components/AllPagesView.svelte'
  import DailiesView from './components/DailiesView.svelte'
  import Notices from './components/Notices.svelte'
  import DuePicker from './components/DuePicker.svelte'
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

  let sidebarWidth = $state(clampWidth(null))
  let sidebarHidden = $state(false)
  /** The board's column width in px; null lets the columns fill the window. */
  let boardColumn = $state<number | null>(null)
  let ready = $state(false)
  /** The folder the shell opens at startup, while the window waits for it ("Opening ‹folder›…"); null otherwise. */
  let opening = $state<string | null>(null)
  /** `.main`, which scrolls the page or the feed. */
  let scroller = $state<HTMLElement | undefined>()
  /** The running program's version, fetched when Settings first opens; null until then or if that fails. */
  let appVersion = $state<string | null>(null)
  let appVersionAsked = false
  /** The log file's folder (the tooltip of Settings' "Open log folder"), fetched when Settings first opens. */
  let logDir = $state<string | null>(null)
  let logDirAsked = false
  /** Whether the `git` command exists on this computer, checked at startup; null until known. */
  let hasGit = $state<boolean | null>(null)
  /** Whether the app lives in the tray (Windows): the close button hides the window, "Exit" in the tray quits. */
  let inTray = false
  /** The theme chosen on this computer. */
  let theme = $state<ThemeChoice>('system')
  /** Where the sidebar lists Journals, chosen on this computer. */
  let journalsAt = $state<JournalsAt>('bottom')
  /** The recent folders, newest first; loaded when Settings or the Welcome screen shows and after a switch. */
  let recent = $state.raw<RecentFolder[]>([])

  /** The window's state, its answers and the changes made outside it (`lib/app.svelte.ts`), over Tauri and the DOM. */
  const app = new AppController({
    invoke: invokeRun,
    mountEditor,
    dom: {
      scroller: () => scroller,
      topDay: () => {
        if (!scroller) return null
        const box = scroller.getBoundingClientRect()
        const edge = box.top + (parseFloat(getComputedStyle(scroller).paddingTop) || 0)
        const sections = [...scroller.querySelectorAll<HTMLElement>('[data-testid="day"][data-day]')]
          .map((el) => ({ key: el.dataset.day!, rect: el.getBoundingClientRect() }))
          .sort((a, b) => a.rect.top - b.rect.top)
          .map(({ key, rect }) => ({ key, top: rect.top, bottom: rect.bottom }))
        return topDayOf(sections, edge)
      },
      scrollToBlock: (id) => document.querySelector(`[data-block-id="${id}"]`)?.scrollIntoView({ block: 'center' }),
      tick,
      // For the e2e test (`settled`): whether any save is pending or queued. Not shown to the user.
      setBusy: (b) => void (document.documentElement.dataset.busy = String(b)),
      slot: (id) => document.querySelector<HTMLElement>(`[data-block-id="${id}"] .editor-slot`),
    },
    // Bound: WebView2 refuses the window's timer functions called as methods of another object.
    timers: {
      setTimeout: window.setTimeout.bind(window),
      clearTimeout: window.clearTimeout.bind(window),
      setInterval: window.setInterval.bind(window),
      clearInterval: window.clearInterval.bind(window),
    },
    now: () => Date.now(),
    shell: { webviewZoom: (f) => getCurrentWebview().setZoom(f), setZoom, hiddenColumns, setHiddenColumns },
    ui: {
      chooseRow: (row) => chooseRow(row),
      showSidebar: () => {
        if (sidebarHidden) toggleSidebar()
      },
    },
  })
  const { host, sel, client, overlays, config, nav, notices, search, journal, boards, allPages, archiveView } = app
  const { dailies, network, gitLog, git, zoom, status, settings, flows, hiddenCols, viewUndo, autoArchive } = app
  const mainArea = app.area
  const notify = (n: Notice) => app.notify(n)
  const refuse = (e: unknown) => app.refuse(e)
  const exec = (cmd: Command) => app.exec(cmd)
  const closeCard = () => app.closeCard()
  const openJournal = () => app.openJournal()
  const leaveMainView = (keep: KeptView) => app.leaveMainView(keep)

  /** The F1 list of keyboard shortcuts: F1 and the ? button open it, a second press closes it; not over another dialog or the search box. */
  function toggleHelp() {
    if (overlays.is('help')) overlays.close('help')
    else if (overlays.may('toggleHelp')) overlays.open({ kind: 'help' })
  }
  /** The theme button left of "?": its menu offers the Settings > Themes choices (`chooseTheme`). */
  status.bind('theme', () => (app.folder ? themeItem(theme) : null))

  /**
   * `Ctrl Z` / `Ctrl Shift Z` (`Ctrl Y`) with no block edited or selected: on a page its last change, on a board or in
   * the journal the last change made there (spec §7.2). Never in a text field, a dialog, a menu or the search box.
   */
  function viewHistoryKey(e: KeyboardEvent) {
    if (e.defaultPrevented || e.isComposing || host.editingId !== null || sel.ids.length) return
    const a = historyKey({ key: e.key, shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey, meta: e.metaKey }, mac)
    if (a === null || !overlays.may('historyKey') || app.slashMenu || app.linkMenu) return
    const t = e.target instanceof Element ? e.target : null
    if (t?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="alertdialog"], [role="menu"]')) return
    if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]')) return
    const view = app.undoView()
    if (view === null) return
    e.preventDefault()
    const type = a === 'undo' ? 'history.undo' : 'history.redo'
    const cmds: Command[] = view.startsWith('page:') ? [{ type, page: app.page!.key }] : viewUndo.step(view, a)
    for (const cmd of cmds) void exec(cmd)
  }

  // ---- back and forward -------------------------------------------------------

  /** A Back or Forward is under way (from the first await on), so a key repeat waits for nothing. */
  let going = false
  /**
   * Back or Forward: the edited block's text is sent first, then the step's view is shown again. A step
   * whose page or board is gone is dropped and the next one is tried. Nothing over a dialog, the search box, F1
   * or the date picker, nor while a restore is still loading.
   */
  async function go(dir: 'back' | 'forward') {
    if (going || nav.busy || !overlays.may('go') || app.pickerOpen) return
    going = true
    try {
      const focus = app.focusHere() // before the editor and the selection close
      await closeCard() // with the card's own text, as any navigation closes it
      host.leave()
      sel.clear()
      // The typed text's answer lands first: while a restore has the main area empty, it would show its page again.
      await client.flush()
      app.rememberHere(focus)
      const step = () => (dir === 'back' ? nav.back(app.here) : nav.forward(app.here))
      let e = step()
      while (e && !(await restore(e))) {
        nav.drop()
        e = step()
      }
      if (e?.focus) await refocus(e.focus)
    } catch (e) {
      refuse(e)
    } finally {
      nav.settle()
      going = false
    }
  }

  /** The block edited or selected when the step was left, again; nothing when it is no longer shown. */
  async function refocus(f: NavFocus) {
    await tick()
    if (f.kind === 'select') return sel.restore(f.anchor, f.head)
    const b = host.blockOf(f.id)
    if (b) await host.edit(f.id, Math.min(f.at, b.text.length))
  }

  /** Shows step `e` again, at its scroll position; false when its page or board is gone. */
  async function restore(e: NavEntry): Promise<boolean> {
    const p = e.place
    switch (p.kind) {
      case 'page': {
        await closeCard()
        let gone = false
        await host.exec({ type: 'page.show', key: p.key }, (code) => code === 'unknownPage' && (gone = true))
        if (gone) return false
        break
      }
      case 'feed': {
        await leaveMainView('feed')
        const day = e.top ?? p.day
        await (day === null ? journal.open() : journal.openAt(day, p.day))
        return true
      }
      case 'board': {
        const i = config.boards.findIndex((b) => b.name === p.name)
        if (i < 0) return false
        await leaveMainView('board')
        await boards.open(i)
        break
      }
      case 'allPages':
        await leaveMainView('allPages')
        await allPages.open()
        break
      case 'archive':
        await leaveMainView('archive')
        await archiveView.open()
        break
      case 'dailies':
        await leaveMainView('dailies')
        await dailies.open()
        break
      case 'gitLog':
        await leaveMainView('gitLog')
        await gitLog.open()
        break
      case 'graph':
        await leaveMainView('graph')
        await network.open()
        return true
      case 'settings':
        await leaveMainView('settings')
        settings.open()
        await exec({ type: 'states.usage' })
        break
    }
    await tick()
    if (scroller) scroller.scrollTop = e.scroll
    return true
  }

  // ---- page actions -----------------------------------------------------------

  /** A click on a rendered block: Shift extends from the edited or selected block, else edit. */
  function clickBlock(id: BlockId, shift: boolean) {
    const from = host.editingId ?? sel.anchor
    // Multi-select stays within the page's own outline, or within one day of the feed.
    if (shift && from !== null && extendsTo(journal.feed, app.page, from, id)) sel.select(from, id)
    else host.editAtEnd(id)
  }

  /** A page dragged from the sidebar was dropped on a block or an empty page: its link goes in (spec §7.2). */
  function dropLink(link: string, spot: LinkSpot, x: number, y: number) {
    const d = linkDrop(spot, link, host.editingId, (id) => editablePageOf(app.editable(), id))
    if (d?.kind === 'caret') host.dropText(x, y, d.text)
    else if (d?.kind === 'command') void exec(d.cmd)
  }

  function toggle(id: BlockId) {
    if (app.folded.has(id)) app.folded.delete(id)
    else app.folded.add(id)
  }

  function startWriting() {
    if (app.page) void exec({ type: 'block.insert', page: app.page.key, after: null, text: '' })
  }

  /**
   * `Ctrl N` or the "+" by Pages: an untitled page opens in the folder of the page shown. Nothing is created until
   * it has a title (the file itself only appears once the user types, as for any new page).
   */
  async function startNewPage() {
    if (!overlays.may('startNewPage')) return
    const inFolder = app.tree && app.page ? folderOf(app.tree, app.page.key) : ''
    await leaveMainView('newPage')
    mainArea.show({ kind: 'newPage', folder: inFolder })
  }

  async function createUntitled(name: string) {
    const v = mainArea.view
    if (v.kind !== 'newPage') return
    try {
      await host.exec({ type: 'page.create', name, folder: v.folder })
    } catch (e) {
      refuse(e)
    }
  }

  /** Jump to a date: a day the feed lists is shown in the feed; any other day opens as its page, created only when the user types. */
  async function goToDay(d: DateView): Promise<void> {
    if (d.inFeed) {
      await leaveMainView('feed')
      await journal.openAt(d.key)
    } else {
      await openPage(d.key)
    }
  }

  // ---- date picker ------------------------------------------------------------

  /** `Ctrl Shift D` opens it (a hidden sidebar is shown first), a second press closes it; not over a dialog. */
  function togglePicker() {
    if (app.pickerOpen) app.pickerOpen = false
    else if (overlays.may('togglePicker')) {
      if (sidebarHidden) toggleSidebar()
      app.pickerOpen = true
    }
  }

  /** A picked day jumps as a typed date does; the edited block's text is sent first. Nothing is written. */
  async function pickDay(key: string) {
    if (app.pickerInsert) {
      const insert = app.pickerInsert
      app.pickerInsert = null
      insert(key)
      return
    }
    host.leave()
    sel.clear()
    try {
      const d = answerOf(await client.run({ type: 'journal.day', key }), 'day')
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
    if (!overlays.may('openSearch')) return
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

  // ---- Dailies -----------------------------------------------------------------

  /** The Dailies view in the main area; the list is asked again. */
  async function openDailies() {
    await leaveMainView('dailies')
    void dailies.open()
  }

  // ---- Graph ------------------------------------------------------------------

  /** The Graph screen in the main area (§7.11); the filters stay as they were. */
  async function openGraph() {
    if (!overlays.may('openGraph')) return
    await leaveMainView('graph')
    void network.open()
  }

  // ---- Git history -------------------------------------------------------------

  /** The status bar button opens the history in the main area; a second click is Back. */
  async function toggleGitLog() {
    if (gitLog.shown) return go('back')
    if (!overlays.may('toggleGitLog')) return
    await leaveMainView('gitLog')
    void gitLog.open()
  }

  /** A sidebar row was dragged onto `folder`: the edited block's text goes first, then the move. */
  async function dropRow(row: Row, folder: string) {
    host.leave()
    await client.flush()
    await flows.moveTo(row, folder)
  }

  /**
   * Opens page `name`, closing an open card first. A clicked `link` target `Page#Heading` opens `Page` and jumps to
   * its block with that heading (`reveal`); with no such heading the page opens at the top.
   */
  async function openPage(name: string, link = false) {
    await closeCard()
    await exec({ type: 'page.open', name, link: link || undefined })
    const heading = link ? linkHeading(name) : null
    if (heading === null || !app.page) return
    const id = headingBlock(app.page.blocks, heading)
    if (id !== null) await reveal(id)
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
    if (!app.page?.blocks.some((b) => b.id === id)) return
    await reveal(id)
  }

  /** Block `id` of the shown page: its ancestors unfolded, the block in the middle of the view and highlighted. */
  async function reveal(id: BlockId): Promise<void> {
    if (!app.page) return
    for (const a of ancestorsOf(app.page.blocks, id)) app.folded.delete(a)
    await tick()
    document.querySelector(`[data-block-id="${id}"]`)?.scrollIntoView({ block: 'center' })
    app.flash = id
    setTimeout(() => {
      if (app.flash === id) app.flash = null
    }, 1500)
  }

  /** The board's own settings dialog, from its title bar. */
  async function openBoardSettings() {
    await closeCard()
    if (boards.index !== null) config.editBoard(boards.index)
  }

  /** Hides column `keyword` of the shown board; an open card is closed first, with its text. */
  async function hideColumn(keyword: string) {
    if (boards.card !== null) await closeCard()
    const view = boards.view
    if (view) hiddenCols.hide(view.name, keyword, view.columns.map((c) => c.keyword))
  }

  /** The saved board is loaded again, so its new name and columns show; a rename carries the history and hidden columns along. */
  async function saveBoard(b: BoardSummary) {
    const r = await config.saveBoard(b)
    if (r.renamedFrom !== null) {
      nav.boardRenamed(r.renamedFrom, b.name) // the history follows the rename
      hiddenCols.renamed(r.renamedFrom, b.name) // its hidden columns go with it
    }
    if (r.ok && boards.index === r.at) void boards.open(r.at)
  }

  /** Deleting the shown board goes to the journal; a board shown after it moves up one. */
  async function deleteBoard() {
    const r = await config.deleteBoard()
    if (!r.ok) return
    const next = shownAfterDelete(boards.index, r.at)
    if (next === 'feed') await openJournal()
    else if (next !== null) void boards.open(next)
  }

  /** A new board with the default columns, shown once the answer is applied (from Settings, Settings stays). */
  async function newBoard(name: string) {
    const o = overlays.current
    const stay = o?.kind === 'newBoard' && o.from === 'settings'
    overlays.close('newBoard')
    const index = await config.newBoard(name)
    if (index !== null && !stay) await openBoard(index)
  }

  // ---- Settings (§7.12) ---------------------------------------------------------

  /** The Settings screen in the main area, at `section` if given; it counts the states' blocks. */
  async function openSettings(section?: SettingsSection) {
    if (!overlays.may('openSettings')) return
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

  /** Asks a question (from Settings, or before deleting a daily); false when another dialog is open. */
  function confirmAsk(message: string, ok: string): Promise<boolean> {
    if (!overlays.may('confirmAsk')) return Promise.resolve(false)
    return new Promise((resolve) => overlays.open({ kind: 'confirm', message, ok, answer: resolve }))
  }

  /** Applies at once; the choice is kept on this computer. */
  function chooseJournalsAt(at: JournalsAt) {
    journalsAt = at
    setJournalsAt(at).catch(refuse)
  }

  /** Applies at once; the choices are kept on this computer. */
  function chooseLinkDisplay(d: LinkDisplay) {
    linkDisplay.hideScheme = d.hideScheme
    linkDisplay.shorten = d.shorten
    linkDisplay.trimSlash = d.trimSlash
    setLinkDisplay(d).catch(refuse)
  }

  /** The wheel over the status bar's theme button: one notch, one theme (as the Ctrl+wheel zoom counts notches). */
  const themeSteps = new WheelSteps()

  function chooseTheme(c: ThemeChoice) {
    theme = c
    applyTheme(c, document.documentElement, (t) => getCurrentWindow().setTheme(t))
    setTheme(storedTheme(c)).catch(refuse)
  }

  // ---- Git ----------------------------------------------------------------------

  /** Typed text goes first (§2), then Git commits and syncs at once. */
  async function syncGit() {
    host.leave()
    await client.flush()
    await client.run({ type: 'git.sync' }).catch(refuse)
  }

  /** What a click on a status bar item does (`statusAction` says which, and when a folder is still opening). */
  const statusClicks = {
    git: () => void clickGit(),
    gitLog: () => void toggleGitLog(),
    dailies: () => void openDailies(),
    zoom: () => void zoom.reset(),
    help: () => toggleHelp(),
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
        if (!overlays.may('gitSetUp')) return
        overlays.open({
          kind: 'confirm',
          message: 'Keep this notes folder in Git? Breccia runs git init here and adds a .gitignore and a .gitattributes file.',
          ok: 'Set up Git',
          answer: (yes) => void (yes && setUpGit()),
        })
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
    host.leave()
    await client.flush()
    await client.run({ type: 'git.init' }).catch(refuse)
  }

  /** "Exit" in the tray menu: the normal close, with its question about unsaved pages shown in the window. */
  async function exitFromTray() {
    host.leave()
    const message = await closeCheck(client, () => notices.unsent())
    if (message === null) return closeAnyway()
    const w = getCurrentWindow()
    await w.show().catch(() => {})
    await w.unminimize().catch(() => {})
    await w.setFocus().catch(() => {})
    app.closing = message
  }

  function closeAnyway() {
    app.closing = null
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
      if (app.folder) {
        await closeCard()
        host.leave()
        const message = await switchCheck(client, () => ({
          unsent: notices.unsent(),
          unresolved: notices.unresolved().map((key) => app.pageTitle(key)),
        }))
        if (message !== null) {
          notify({ kind: 'refused', message })
          return
        }
      }
      let ok = true
      await host.exec({ type, path }, () => ((ok = false), false))
      if (ok && app.folder) await app.openFolder()
    } finally {
      switching = false
      void loadRecent()
    }
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
    if (ready && (settings.shown || !app.folder)) untrack(() => void loadRecent())
  })

  const folderName = $derived(app.folder ? (app.folder.split(/[\\/]/).filter(Boolean).pop() ?? app.folder) : '')

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
    app.pressFocus = null
    const t = e.target as Element | null
    // The search dialog and its backdrop sit over the main area: a press there, even one that dismisses
    // the search, is not a press outside the card or the editor. bits-ui closes it on the click, after this.
    // The date picker too: a press on it leaves the edited block alone, so Esc can go back to it. The theme menu
    // likewise: a pick gives the focus back to the edited block. The task menu too: the due date calendar it opens
    // gives the focus back to the edited block, and a press on it leaves a multi-block selection as it is.
    if (search.shown || overlays.is('help') || !t?.closest || t.closest('.slash-menu') || t.closest('[data-date-picker]') || t.closest('[data-due-picker]') || t.closest('[data-theme-menu]') || t.closest('[data-task-menu]')) return
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
    app.pressFocus = app.focusHere() // for Back to this page, should the press open another
    if (sel.ids.length && !e.shiftKey) sel.clear()
    if (host.editingId === null) return
    if (t.closest('.editor-slot') || onBlock) return
    // A press on a sidebar row may start a drag of its link into the edited block (spec §7.2): the block is left when
    // the press ends without a drag (a drag ends in pointercancel, with no pointerup).
    if (t.closest('[data-testid="sidebar"] [data-row]')) {
      const stop = () => {
        window.removeEventListener('pointerup', up, true)
        window.removeEventListener('pointercancel', stop, true)
        window.removeEventListener('dragstart', stop, true)
      }
      const up = () => {
        stop()
        host.leave()
      }
      window.addEventListener('pointerup', up, true)
      window.addEventListener('pointercancel', stop, true)
      window.addEventListener('dragstart', stop, true)
      return
    }
    host.leave()
  }

  onMount(() => {
    const stopThemeTokens = watchThemeTokens(document.documentElement)
    const stopLinkDrops = watchLinkDrops(dropLink)
    const removeDom = installDom({
      click: onAnchorClick,
      pointerDown: onPointerDown,
      key: (e) => {
        sel.onKey(e)
        viewHistoryKey(e)
      },
      keyCapture: (e) => {
        app.pressFocus = null
        const k = { key: e.key, shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey, meta: e.metaKey }
        if (isHelpKey(k)) {
          // Before the editor and before WebView2's own F1 (its help page).
          e.preventDefault()
          e.stopPropagation()
          if (!e.repeat) toggleHelp()
          return
        }
        // While the startup folder opens, only the help and the zoom keys work: there is nothing to open yet.
        if (opening !== null && !zoomKey(k, mac)) return
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
    // Other programs and Git change pages too (§9); the window's own commands send no events.
    const shell = listenShell({
      ...app.shellHandlers(),
      // Text typed in the last moment before closing is still in the typing pause;
      // pages that still could not be saved, and text shown in unsent notices, are named before closing.
      trayExit: () => void exitFromTray(),
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
        app.closing = message
      },
    })
    // At local midnight the feed reloads, so the new day is at the top.
    const stopMidnight = everyMidnight(() => journal.refresh())
    // Due chips follow the day: after midnight and when the window wakes.
    const stopToday = today.start()
    // "Saved to Git 2 min ago" moves on.
    const gitClock = setInterval(() => git.tick(), 30_000)
    // Once an hour, so a new day is noticed while the app runs.
    const stopArchive = hourly(() => void autoArchive.run())
    // The day's dailies start afresh at the reset; a PC waking from sleep or a changed clock is noticed here too.
    const stopDailies = dailies.start()
    const wakeDailies = () => dailies.wake()
    window.addEventListener('focus', wakeDailies)
    document.addEventListener('visibilitychange', wakeDailies)
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
        uiState().then((ui) => linkDisplay.restore(ui), () => {})
        applyTheme(layout.theme, document.documentElement, (t) => getCurrentWindow().setTheme(t))
        gitInstalled().then((ok) => void (hasGit = ok), () => {})
        inTray = await trayEnabled().catch(() => false)
        await shell.ready
        await startupSequence({
          ...startupOpen(),
          show: (path) => (opening = path),
          folderStatus: async () => {
            await exec({ type: 'folder.status' })
            return app.folder !== null
          },
          gitStatus: async () => void (await exec({ type: 'git.status' })),
          openFolder: () => app.openFolder(),
          notices: startupNotices,
          notify,
        })
      } catch (e) {
        refuse(e)
      }
      opening = null
      ready = true
    })()
    return () => {
      stopThemeTokens()
      stopLinkDrops()
      stopMidnight()
      stopToday()
      clearInterval(gitClock)
      stopArchive()
      stopDailies()
      window.removeEventListener('focus', wakeDailies)
      document.removeEventListener('visibilitychange', wakeDailies)
      removeDom()
      document.removeEventListener('wheel', onWheel, true)
      shell.stop()
      host.close()
    }
  })
</script>

{#if ready || opening !== null}
  <div class="shell">
    <Notices items={notices.items} ondismiss={(id) => notices.dismiss(id)} />
    <DuePicker />
    {#if app.linkMenu}
      <CaretMenu menu={app.linkMenu} testid="link-menu" onchoose={(i) => host.chooseMenu('link', i)} />
    {:else if app.slashMenu}
      <CaretMenu menu={app.slashMenu} testid="slash-menu" onchoose={(i) => host.chooseMenu('slash', i)} />
    {/if}
    <FlowDialog {flows} />
    {#if overlays.current?.kind === 'confirm'}
      {@const q = overlays.current}
      <ConfirmDialog message={q.message} ok={q.ok} onok={() => overlays.answer(true)} oncancel={() => overlays.answer(false)} />
    {/if}
    {#if config.dialog !== null && config.boards[config.dialog.index]}
      {@const i = config.dialog.index}
      <BoardSettings
        board={config.boards[i]}
        states={config.states}
        onsave={(b) => void saveBoard(b)}
        ondelete={() => void deleteBoard()}
        oncancel={() => config.closeBoardDialog()}
      />
    {/if}
    {#if search.shown}
      <SearchDialog {search} states={config.states} onchoose={chooseRow} />
    {/if}
    {#if overlays.is('help')}
      <ShortcutsDialog {mac} states={config.states.map((s) => s.keyword)} onclose={() => overlays.close('help')} />
    {/if}
    {#if overlays.is('changelog')}
      <ChangelogDialog version={appVersion} onclose={() => overlays.close('changelog')} />
    {/if}
    {#if overlays.is('newBoard')}
      <NameDialog title="New board" initial="" onok={(name) => void newBoard(name)} oncancel={() => overlays.close('newBoard')} />
    {/if}
    <!-- The close question: its own layer above every dialog (mounted last, so on top); Cancel gives the dialog back. -->
    {#if app.closing}
      <ConfirmDialog message={app.closing} ok="Close anyway" onok={closeAnyway} oncancel={() => (app.closing = null)} />
    {/if}
    {#if opening !== null}
      <!-- The folder opens in the shell: nothing to click yet but the status bar's theme and help. -->
      <div class="body">
        {#if !sidebarHidden}
          <aside class="side" style:width="{sidebarWidth}px"></aside>
        {/if}
        <div class="main-wrap">
          <div class="opening" data-testid="opening">{openingText(opening)}</div>
        </div>
      </div>
    {:else if app.folder}
      <div class="body">
        {#if !sidebarHidden}
          <Sidebar
            folder={app.folder}
            {folderName}
            tree={app.tree}
            {journalsAt}
            shown={app.page?.key ?? null}
            journalShown={mainArea.is('feed')}
            dailiesShown={dailies.shown}
            ondailies={() => void openDailies()}
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
            boards={config.boards}
            boardShown={boards.index}
            archiveShown={archiveView.shown}
            onarchive={() => void openArchive()}
            onboard={(i) => void openBoard(i)}
            onnewboard={() => overlays.open({ kind: 'newBoard', from: 'sidebar' })}
            onop={(op, row) => flows.start(op, row)}
            ondrop={dropRow}
            onnewpage={() => void startNewPage()}
            onresize={(w) => (sidebarWidth = w)}
            onresized={saveLayout}
            bind:pickerOpen={app.pickerOpen}
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
              disabled={!nav.canBackFrom(app.here)}
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
            {#if mainArea.view.kind === 'newPage'}
              <NewPageView onsubmit={(name) => void createUntitled(name)} oncancel={() => void openJournal()} />
            {:else if mainArea.view.kind === 'settings'}
              <SettingsView
                folder={app.folder}
                recent={recentRows(recent, app.folder)}
                section={settings.section}
                states={config.states}
                usage={settings.usage}
                skipped={settings.skipped}
                boards={config.boards}
                archiveDays={config.archiveDays}
                archiveInvalid={config.numbersInvalid.archive}
                autoArchive={config.autoArchive}
                git={config.git}
                delayInvalid={config.numbersInvalid.delay}
                intervalInvalid={config.numbersInvalid.interval}
                {theme}
                {mac}
                version={config.version}
                {appVersion}
                {hasGit}
                logFolder={logDir}
                onstates={(list, renames, version) => config.setStates(list, renames, version)}
                onconfirm={confirmAsk}
                onready={() => config.ready()}
                onusage={() => config.countUsage()}
                onboard={(i) => config.editBoard(i)}
                onmoveboard={(i, dir) => void config.moveBoard(i, dir)}
                onnewboard={() => overlays.open({ kind: 'newBoard', from: 'settings' })}
                onarchivedays={(archiveAfterDays) => config.setBoardSettings({ archiveAfterDays })}
                onautoarchive={(on) => config.setBoardSettings({ autoArchive: on })}
                ongit={(patch) => config.setGit(patch)}
                dailiesReset={dailies.reset}
                dailiesResetInvalid={config.dailiesResetInvalid}
                ondailiesreset={(reset) => config.setDailiesReset(reset)}
                onhelp={toggleHelp}
                ontheme={chooseTheme}
                {journalsAt}
                onjournalsat={chooseJournalsAt}
                onlinkdisplay={chooseLinkDisplay}
                onpickfolder={(type) => void pickAndSwitch(type)}
                onopenfolder={(path) => void switchFolder('folder.open', path)}
                onforgetfolder={(path) => void forgetRecent(path)}
                onmissingfolder={recentMissing}
                onopenlogs={openLogs}
                onchangelog={() => settings.showChangelog()}
              />
            {:else if mainArea.view.kind === 'graph'}
              <!-- Loaded the first time the graph opens: the main bundle stays small. -->
              {#await import('./components/NetworkView.svelte') then { default: NetworkView }}
                <NetworkView {network} onopen={(name) => void openPage(name)} />
              {/await}
            {:else if mainArea.view.kind === 'board'}
              {#if boards.view}
                <Board
                  board={boards.view}
                  card={boards.card}
                  cardColumn={boards.cardColumn}
                  folded={app.folded}
                  editingId={host.editingId}
                  flash={app.flash}
                  expanded={boards.expanded}
                  onmore={(id) => boards.expand(id)}
                  onopencard={(c, column) => void openCard(c, column)}
                  onedit={clickBlock}
                  ontoggle={toggle}
                  onjump={(c) => void jumpTo(c.page, c.id)}
                  onadd={(column) => void addCard(column)}
                  onclosecard={() => void closeCard()}
                  archiveDays={config.archiveDays}
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
            {:else if mainArea.view.kind === 'gitLog' && scroller}
              <!-- Loaded the first time the history opens, like the graph: the main bundle stays small. -->
              {#await import('./components/GitLogView.svelte') then { default: GitLogView }}
                <GitLogView log={gitLog} {scroller} />
              {/await}
            {:else if mainArea.view.kind === 'archive' && scroller}
              <!-- Loaded the first time the Archive opens, like the Git history: the main bundle stays small. -->
              {#await import('./components/ArchiveView.svelte') then { default: ArchiveView }}
                <ArchiveView archive={archiveView} {scroller} onopen={(r) => void jumpTo(r.page, r.id)} />
              {/await}
            {:else if mainArea.view.kind === 'dailies'}
              <DailiesView {dailies} onconfirm={confirmAsk} />
            {:else if mainArea.view.kind === 'allPages' && scroller}
              <AllPagesView
                pages={allPages}
                {scroller}
                onopen={(r) =>
                  void exec(r.linkedOnly ? { type: 'page.open', name: r.name } : { type: 'page.show', key: r.key })}
              />
            {:else if mainArea.view.kind === 'feed' && journal.feed && scroller}
              <JournalFeed
                feed={journal.feed}
                {scroller}
                folded={app.folded}
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
                onsetdue={(id, due) => void exec({ type: 'block.setDue', id, due })}
              />
            {:else if mainArea.view.kind === 'page' && app.page}
              <PageView
                page={app.page}
                refs={app.refs}
                folded={app.folded}
                editingId={host.editingId}
                selected={sel.ids}
                onedit={clickBlock}
                ontoggle={toggle}
                onstart={startWriting}
                flash={app.flash}
                onrename={(name) => void flows.rename(app.page!.key, app.page!.name, name)}
                onopen={(name) => void exec({ type: 'page.open', name })}
                onsetcolor={(color) => void exec({ type: 'page.setColor', key: app.page!.key, color })}
                onlinkcolor={(key, color) => void exec({ type: 'page.setColor', key, color })}
                onsetdue={(id, due) => void exec({ type: 'block.setDue', id, due })}
                onhistory={(redo) => void exec({ type: redo ? 'history.redo' : 'history.undo', page: app.page!.key })}
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
    <StatusBar left={status.left} right={status.right} onitem={(id) => {
      const action = statusAction(id, opening !== null)
      if (action) statusClicks[action]()
    }} {theme}
      ontheme={chooseTheme}
      onthemewheel={(dy) => {
        const c = wheelTheme(theme, themeSteps, dy, zoom.percent)
        if (c !== null) chooseTheme(c)
      }} />
  </div>
{/if}
