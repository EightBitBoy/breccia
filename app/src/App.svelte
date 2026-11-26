<script lang="ts">
  import { onMount, tick } from 'svelte'
  import { getCurrentWindow } from '@tauri-apps/api/window'
  import { getCurrentWebview } from '@tauri-apps/api/webview'
  import { openUrl } from '@tauri-apps/plugin-opener'
  import { open as openDialog } from '@tauri-apps/plugin-dialog'
  import * as shellCalls from './api'
  import { AppController } from './lib/app.svelte'
  import { openingText } from './lib/startup'
  import { autoHideScrollbar } from './lib/scrollFade'
  import { listenShell } from './lib/shellEvents'
  import { installDom } from './lib/dom'
  import { linkClick } from './lib/links'
  import { everyMidnight } from './lib/feed'
  import { today } from './lib/today.svelte'
  import { watchLinkDrops } from './lib/dnd'
  import { hourly } from './lib/autoArchive'
  import { WheelSteps } from './lib/zoom'
  import { topDayOf } from './lib/nav'
  import { recentRows } from './lib/folderSwitch'
  import { watchThemeTokens } from './lib/themeTokens.svelte'
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

  /** `.main`, which scrolls the page or the feed. */
  let scroller = $state<HTMLElement | undefined>()

  /** The window (`lib/app.svelte.ts`) over Tauri and the DOM. */
  const app = new AppController({
    invoke: shellCalls.invokeRun,
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
      root: () => document.documentElement,
      keyTaken: (e) => {
        const shown = '[role="dialog"], [role="alertdialog"], [role="menu"]'
        const fields = `input, textarea, select, [contenteditable="true"], ${shown}`
        if (e.target instanceof Element && e.target.closest(fields)) return true
        return document.querySelector(shown) !== null
      },
    },
    // Bound: WebView2 refuses the window's timer functions called as methods of another object.
    timers: {
      setTimeout: window.setTimeout.bind(window),
      clearTimeout: window.clearTimeout.bind(window),
      setInterval: window.setInterval.bind(window),
      clearInterval: window.clearInterval.bind(window),
    },
    now: () => Date.now(),
    shell: { ...shellCalls, webviewZoom: (f) => getCurrentWebview().setZoom(f) },
    window: {
      show: () => getCurrentWindow().show(),
      unminimize: () => getCurrentWindow().unminimize(),
      setFocus: () => getCurrentWindow().setFocus(),
      hide: () => getCurrentWindow().hide(),
      destroy: () => getCurrentWindow().destroy(),
      setTheme: (t) => getCurrentWindow().setTheme(t),
    },
    pickFolder: () => openDialog({ directory: true, multiple: false }),
    openUrl: (url) => openUrl(url),
  })
  const { host, sel, overlays, config, nav, notices, search, journal, boards, allPages, archiveView } = app
  const { dailies, network, gitLog, settings, flows, hiddenCols } = app
  const mainArea = app.area

  // ---- DOM events -----------------------------------------------------------

  /** Every anchor click is ours: the webview itself never navigates. */
  function onAnchorClick(e: MouseEvent) {
    // A click on a task's label (TODO, DOING, …) in a page or the journal steps to the next state.
    const label = (e.target as Element | null)?.closest?.('.block .content .st')
    if (label) {
      const id = Number(label.closest('[data-block-id]')?.getAttribute('data-block-id'))
      e.preventDefault()
      e.stopPropagation()
      if (e.type === 'click' && e.button === 0 && Number.isFinite(id)) void app.exec({ type: 'block.stepState', id })
      return
    }
    const a = (e.target as Element | null)?.closest?.('a')
    if (!a) return
    e.preventDefault()
    e.stopPropagation()
    if (e.type !== 'click' || e.button !== 0) return
    app.followLink(
      linkClick({
        className: a.className,
        dataPage: a.getAttribute('data-page'),
        dataName: a.getAttribute('data-name'),
        href: a.getAttribute('href'),
        mod: e.ctrlKey || e.metaKey,
      }),
    )
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
      void app.closeCard()
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
    const stopLinkDrops = watchLinkDrops((link, spot, x, y) => app.dropLink(link, spot, x, y))
    const removeDom = installDom({
      click: onAnchorClick,
      pointerDown: onPointerDown,
      key: (e) => app.key(e),
      keyCapture: (e) => app.keyCapture(e),
      scroll: () => host.closeMenu(),
    })
    // Ctrl and the wheel zoom the window; the graph and the page never see it.
    const wheel = new WheelSteps()
    const onWheel = (e: WheelEvent) => {
      if (!(mac ? e.metaKey : e.ctrlKey)) return
      e.preventDefault()
      e.stopPropagation()
      // deltaY is in CSS px, so a notch is smaller the more the window is zoomed in.
      const dir = wheel.add(Math.round((e.deltaY * app.zoom.percent) / 100))
      if (dir) void app.zoom.step(dir)
    }
    document.addEventListener('wheel', onWheel, { capture: true, passive: false })
    // Other programs and Git change pages too (§9); the window's own commands send no events.
    const shell = listenShell(app.shellHandlers())
    // At local midnight the feed reloads, so the new day is at the top.
    const stopMidnight = everyMidnight(() => journal.refresh())
    // Due chips follow the day: after midnight and when the window wakes.
    const stopToday = today.start()
    // "Saved to Git 2 min ago" moves on.
    const gitClock = setInterval(() => app.git.tick(), 30_000)
    // Once an hour, so a new day is noticed while the app runs.
    const stopArchive = hourly(() => void app.autoArchive.run())
    // The day's dailies start afresh at the reset; a PC waking from sleep or a changed clock is noticed here too.
    const stopDailies = dailies.start()
    const wakeDailies = () => dailies.wake()
    window.addEventListener('focus', wakeDailies)
    document.addEventListener('visibilitychange', wakeDailies)
    void app.start(shell.ready)
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


{#if app.ready || app.opening !== null}
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
        onsave={(b) => void app.saveBoard(b)}
        ondelete={() => void app.deleteBoard()}
        oncancel={() => config.closeBoardDialog()}
      />
    {/if}
    {#if search.shown}
      <SearchDialog {search} states={config.states} onchoose={(row) => app.chooseRow(row)} />
    {/if}
    {#if overlays.is('help')}
      <ShortcutsDialog {mac} states={config.states.map((s) => s.keyword)} onclose={() => overlays.close('help')} />
    {/if}
    {#if overlays.is('changelog')}
      <ChangelogDialog version={app.appVersion} onclose={() => overlays.close('changelog')} />
    {/if}
    {#if overlays.is('newBoard')}
      <NameDialog title="New board" initial="" onok={(name) => void app.newBoard(name)} oncancel={() => overlays.close('newBoard')} />
    {/if}
    <!-- The close question: its own layer above every dialog (mounted last, so on top); Cancel gives the dialog back. -->
    {#if app.closing}
      <ConfirmDialog message={app.closing} ok="Close anyway" onok={() => app.closeAnyway()} oncancel={() => app.cancelClose()} />
    {/if}
    {#if app.opening !== null}
      <!-- The folder opens in the shell: nothing to click yet but the status bar's theme and help. -->
      <div class="body">
        {#if !app.sidebarHidden}
          <aside class="side" style:width="{app.sidebarWidth}px"></aside>
        {/if}
        <div class="main-wrap">
          <div class="opening" data-testid="opening">{openingText(app.opening)}</div>
        </div>
      </div>
    {:else if app.folder}
      <div class="body">
        {#if !app.sidebarHidden}
          <Sidebar
            folder={app.folder}
            folderName={app.folderName}
            tree={app.tree}
            journalsAt={app.journalsAt}
            shown={app.page?.key ?? null}
            journalShown={mainArea.is('feed')}
            dailiesShown={dailies.shown}
            ondailies={() => void app.openDailies()}
            allPagesShown={allPages.shown}
            onallpages={() => void app.openAllPages()}
            settingsShown={settings.shown}
            onsettings={() => void app.openSettings()}
            graphShown={network.shown}
            ongraph={() => void app.openGraph()}
            onfolder={() => void app.openSettings('folder')}
            onsearch={() => app.openSearch()}
            width={app.sidebarWidth}
            onopen={(name) => void app.openPage(name)}
            onjournal={() => void app.openJournal()}
            boards={config.boards}
            boardShown={boards.index}
            archiveShown={archiveView.shown}
            onarchive={() => void app.openArchive()}
            onboard={(i) => void app.openBoard(i)}
            onnewboard={() => overlays.open({ kind: 'newBoard', from: 'sidebar' })}
            onop={(op, row) => flows.start(op, row)}
            ondrop={(row, folder) => app.dropRow(row, folder)}
            onnewpage={() => void app.startNewPage()}
            onresize={(w) => (app.sidebarWidth = w)}
            onresized={() => app.saveLayout()}
            bind:pickerOpen={app.pickerOpen}
            onpickday={(key) => void app.pickDay(key)}
          />
        {/if}
        <div class="main-wrap">
          <button class="toggle-side" aria-label="Toggle sidebar" onclick={() => app.toggleSidebar()}>☰</button>
          <div class="nav-btns">
            <button
              class="nav-btn"
              data-testid="nav-back"
              aria-label="Back"
              title={mac ? 'Back (Cmd+[)' : 'Back (Alt+←)'}
              disabled={!nav.canBackFrom(app.here)}
              onclick={() => void app.go('back')}>←</button
            >
            <button
              class="nav-btn"
              data-testid="nav-forward"
              aria-label="Forward"
              title={mac ? 'Forward (Cmd+])' : 'Forward (Alt+→)'}
              disabled={!nav.canForward}
              onclick={() => void app.go('forward')}>→</button
            >
          </div>
          <div class="main" use:autoHideScrollbar bind:this={scroller}>
            {#if mainArea.view.kind === 'newPage'}
              <NewPageView onsubmit={(name) => void app.createUntitled(name)} oncancel={() => void app.openJournal()} />
            {:else if mainArea.view.kind === 'settings'}
              <SettingsView
                folder={app.folder}
                recent={recentRows(app.recent, app.folder)}
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
                theme={app.theme}
                {mac}
                version={config.version}
                appVersion={app.appVersion}
                hasGit={app.hasGit}
                logFolder={app.logDir}
                onstates={(list, renames, version) => config.setStates(list, renames, version)}
                onconfirm={(message, ok) => app.confirmAsk(message, ok)}
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
                onhelp={() => app.toggleHelp()}
                ontheme={(c) => app.chooseTheme(c)}
                journalsAt={app.journalsAt}
                onjournalsat={(at) => app.chooseJournalsAt(at)}
                onlinkdisplay={(d) => app.chooseLinkDisplay(d)}
                onpickfolder={(type) => void app.pickAndSwitch(type)}
                onopenfolder={(path) => void app.switchFolder('folder.open', path)}
                onforgetfolder={(path) => void app.forgetRecent(path)}
                onmissingfolder={(path) => app.recentMissing(path)}
                onopenlogs={() => app.openLogs()}
                onchangelog={() => settings.showChangelog()}
              />
            {:else if mainArea.view.kind === 'graph'}
              <!-- Loaded the first time the graph opens: the main bundle stays small. -->
              {#await import('./components/NetworkView.svelte') then { default: NetworkView }}
                <NetworkView {network} onopen={(name) => void app.openPage(name)} />
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
                  onopencard={(c, column) => void app.openCard(c, column)}
                  onedit={(id, shift) => app.clickBlock(id, shift)}
                  ontoggle={(id) => app.toggleFold(id)}
                  onjump={(c) => void app.jumpTo(c.page, c.id)}
                  onadd={(column) => void app.addCard(column)}
                  onclosecard={() => void app.closeCard()}
                  archiveDays={config.archiveDays}
                  oncommand={(cmd) =>
                    // A drop refused because the column changed since it was shown: the notice says so, the board reloads.
                    void host.exec(cmd, (code) => {
                      if (code === 'boardChanged') boards.refresh()
                      return false
                    })}
                  onsettings={() => void app.openBoardSettings()}
                  hidden={hiddenCols.of(boards.view.name, boards.view.columns.map((c) => c.keyword))}
                  peek={hiddenCols.peek}
                  onhide={(k) => void app.hideColumn(k)}
                  onshow={(k) => boards.view && hiddenCols.show(boards.view.name, k)}
                  onpeek={(k) => hiddenCols.peekOpen(k)}
                  onpeekend={() => hiddenCols.endPeek()}
                  columnWidth={app.boardColumn}
                  oncolumnwidth={(w, final) => {
                    app.boardColumn = w
                    if (final) app.saveLayout()
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
                <ArchiveView archive={archiveView} {scroller} onopen={(r) => void app.jumpTo(r.page, r.id)} />
              {/await}
            {:else if mainArea.view.kind === 'dailies'}
              <DailiesView {dailies} onconfirm={(message, ok) => app.confirmAsk(message, ok)} />
            {:else if mainArea.view.kind === 'allPages' && scroller}
              <AllPagesView
                pages={allPages}
                {scroller}
                onopen={(r) =>
                  void app.exec(r.linkedOnly ? { type: 'page.open', name: r.name } : { type: 'page.show', key: r.key })}
              />
            {:else if mainArea.view.kind === 'feed' && journal.feed && scroller}
              <JournalFeed
                feed={journal.feed}
                {scroller}
                folded={app.folded}
                editingId={host.editingId}
                selected={sel.ids}
                onedit={(id, shift) => app.clickBlock(id, shift)}
                ontoggle={(id) => app.toggleFold(id)}
                onrange={(from, to) => journal.want(from, to)}
                target={journal.target}
                ontarget={() => journal.targetReached()}
                onopen={(key) => void app.exec({ type: 'page.open', name: key })}
                onstart={(key) => void app.exec({ type: 'block.insert', page: key, after: null, text: '' })}
                onsetcolor={(key, color) => void app.exec({ type: 'page.setColor', key, color })}
                onsetdue={(id, due) => void app.exec({ type: 'block.setDue', id, due })}
              />
            {:else if mainArea.view.kind === 'page' && app.page}
              <PageView
                page={app.page}
                refs={app.refs}
                folded={app.folded}
                editingId={host.editingId}
                selected={sel.ids}
                onedit={(id, shift) => app.clickBlock(id, shift)}
                ontoggle={(id) => app.toggleFold(id)}
                onstart={() => app.startWriting()}
                flash={app.flash}
                onrename={(name) => void flows.rename(app.page!.key, app.page!.name, name)}
                onopen={(name) => void app.exec({ type: 'page.open', name })}
                onsetcolor={(color) => void app.exec({ type: 'page.setColor', key: app.page!.key, color })}
                onlinkcolor={(key, color) => void app.exec({ type: 'page.setColor', key, color })}
                onsetdue={(id, due) => void app.exec({ type: 'block.setDue', id, due })}
                onhistory={(redo) => void app.exec({ type: redo ? 'history.redo' : 'history.undo', page: app.page!.key })}
              />
            {/if}
          </div>
        </div>
      </div>
    {:else}
      <Welcome
        recent={app.recent}
        onpick={(type) => void app.pickAndSwitch(type)}
        onopen={(path) => void app.switchFolder('folder.open', path)}
        onforget={(path) => void app.forgetRecent(path)}
        onmissing={(path) => app.recentMissing(path)}
      />
    {/if}
    <StatusBar
      left={app.status.left}
      right={app.status.right}
      onitem={(id) => app.clickStatus(id)}
      theme={app.theme}
      ontheme={(c) => app.chooseTheme(c)}
      onthemewheel={(dy) => app.themeWheel(dy)}
    />
  </div>
{/if}
