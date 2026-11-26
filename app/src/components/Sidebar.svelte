<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity'
  import { reveal, rows as makeRows, tagRows, type Row } from '../lib/treeRows'
  import { baseName, joinPath, type Op } from '../lib/pageOps'
  import TreeMenu from './TreeMenu.svelte'
  import { clampWidth } from '../lib/sidebarLayout'
  import type { AppController } from '../lib/app.svelte'
  import PageTree from './PageTree.svelte'
  import DatePicker from './DatePicker.svelte'
  import { journalKeys } from '../lib/calendar'
  import { treeDrop, watchTreeDrops, type TreeDropEnv } from '../lib/dnd'
  import { dropFolder, PAGES, type Over } from '../lib/treeDrop'

  let {
    app,
    width,
    pickerOpen = $bindable(false),
  }: {
    /** The window: the sidebar shows its folder, tree and views, and its rows call it. */
    app: AppController
    width: number
    /** The date picker by the Journal row is open (its icon, or `Ctrl Shift D`). */
    pickerOpen: boolean
  } = $props()

  const folder = $derived(app.folder ?? '')
  const folderName = $derived(app.folderName)
  /** Where the Journals row sits among the pages. */
  const journalsAt = $derived(app.journalsAt)
  const tree = $derived(app.tree)
  /** The key of the page shown; null while the journal feed is shown. */
  const shown = $derived(app.page?.key ?? null)
  const journalShown = $derived(app.area.is('feed'))
  const dailiesShown = $derived(app.dailies.shown)
  const allPagesShown = $derived(app.allPages.shown)
  const settingsShown = $derived(app.settings.shown)
  const graphShown = $derived(app.network.shown)
  /** The configured boards, in order. */
  const boards = $derived(app.config.boards)
  /** The index of the board shown, or null. */
  const boardShown = $derived(app.boards.index)
  const archiveShown = $derived(app.archiveView.shown)

  const onopen = (name: string) => void app.openPage(name)
  const onjournal = () => void app.openJournal()
  /** "Dailies", under Journal: the things to tick each day. */
  const ondailies = () => void app.openDailies()
  const onallpages = () => void app.openAllPages()
  /** The search box was clicked. */
  const onsearch = () => app.openSearch()
  /** The footer's Settings entry. */
  const onsettings = () => void app.openSettings()
  /** The "+" by Pages: start an untitled page. */
  const onnewpage = () => void app.startNewPage()
  /** The footer's Graph entry. */
  const ongraph = () => void app.openGraph()
  /** The folder name was clicked: Settings at the Notes folder section. */
  const onfolder = () => void app.openSettings('folder')
  const onboard = (i: number) => void app.openBoard(i)
  const onnewboard = () => app.overlays.open({ kind: 'newBoard', from: 'sidebar' })
  /** "Archive" in the Boards section: every archived task. */
  const onarchive = () => void app.openArchive()
  /** A context menu operation on a row (null: the empty tree area). */
  const onop = (op: Op, row: Row | null) => app.flows.start(op, row)
  /** A day was picked in the date picker. */
  const onpickday = (key: string) => void app.pickDay(key)

  /** Session-only folding; all folders start closed. */
  const open = new SvelteSet<string>()
  let seen: string | null = null

  // Showing a page opens the way to its row, once per page.
  $effect(() => {
    const r = reveal(tree, shown, seen)
    seen = r.seen
    for (const id of r.open) open.add(id)
  })

  const rows = $derived(tree ? makeRows(tree, open, journalsAt) : [])
  const tags = $derived(tree ? tagRows(tree) : [])
  /** The days the date picker marks (a tinted background). */
  const journalDays = $derived(journalKeys(tree))

  let aside = $state<HTMLElement>()
  const dropEnv: TreeDropEnv = {
    tree: () => tree,
    row: (id) => rows.find((r) => r.id === id) ?? null,
  }

  /** A drop: the move runs, then the target folder is open, so the row is seen in its new place. */
  async function dropped(row: Row, over: Over) {
    const t = tree
    const folder = t && dropFolder(t, over)
    if (folder === null || folder === undefined) return
    const wasOpen = row.kind === 'folder' && row.open === true
    await app.dropRow(row, folder)
    if (folder !== '') open.add(`f:${folder}`)
    // A folder that was open stays open at its new path.
    if (wasOpen && row.path) open.add(`f:${joinPath(folder, baseName(row.path))}`)
  }

  $effect(() => {
    if (!aside) return
    return watchTreeDrops(aside, { ...dropEnv, open: (id) => open.add(id), onDrop: (row, over) => void dropped(row, over) })
  })

  function toggle(id: string) {
    if (open.has(id)) open.delete(id)
    else open.add(id)
  }

  function drag(e: PointerEvent) {
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    const move = (m: PointerEvent) => (app.sidebarWidth = clampWidth(m.clientX))
    const up = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      app.saveLayout()
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  }
</script>

<aside class="side" data-testid="sidebar" style:width="{width}px" bind:this={aside}>
  <div
    class="folder-name"
    data-testid="folder-name"
    title={folder}
    role="button"
    tabindex="0"
    onclick={onfolder}
    onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onfolder())}
  >{folderName}</div>
  <div
    class="search-box"
    data-testid="search-box"
    role="button"
    tabindex="0"
    onclick={onsearch}
    onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onsearch())}
  >
    Search or jump to… <kbd>Ctrl K</kbd>
  </div>
  <div class="nav-row">
    <div
      class="nav"
      class:active={journalShown}
      data-testid="nav-journal"
      role="button"
      tabindex="0"
      onclick={onjournal}
      onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onjournal())}
    >
      <span class="ic">📅</span>Journal
    </div>
    <DatePicker bind:open={pickerOpen} {shown} marked={journalDays} onpick={onpickday} />
  </div>
  <div
    class="nav"
    class:active={dailiesShown}
    data-testid="nav-dailies"
    role="button"
    tabindex="0"
    title="The things to tick each day"
    onclick={ondailies}
    onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), ondailies())}
  >
    <span class="ic">☑</span>Dailies
  </div>
  <div
    class="nav"
    class:active={allPagesShown}
    data-testid="nav-all-pages"
    role="button"
    tabindex="0"
    onclick={onallpages}
    onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onallpages())}
  >
    <span class="ic">☰</span>All pages
  </div>
  <div class="group">Boards</div>
  {#each boards as b, i (i)}
    <div
      class="nav"
      class:active={boardShown === i}
      data-testid="nav-board"
      data-board={i}
      role="button"
      tabindex="0"
      onclick={() => onboard(i)}
      onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onboard(i))}
    >
      <span class="ic">▦</span>{b.name}
    </div>
  {/each}
  <div
    class="nav"
    class:active={archiveShown}
    data-testid="nav-archive"
    role="button"
    tabindex="0"
    title="Every archived task"
    onclick={onarchive}
    onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onarchive())}
  >
    <span class="ic">▤</span>Archive
  </div>
  <div
    class="nav"
    data-testid="new-board"
    role="button"
    tabindex="0"
    onclick={onnewboard}
    onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onnewboard())}
  >
    <span class="ic">+</span>New board
  </div>
  <TreeMenu rows={[...rows, ...tags]} {onop}>
    <div class="group group-pages" data-testid="pages-group" data-drop={PAGES} use:treeDrop={{ over: PAGES, env: dropEnv }}>
      Pages
      <button class="group-add" data-testid="new-page" aria-label="New page" title="New page (Ctrl N)" onclick={onnewpage}>+</button>
    </div>
    <PageTree {rows} {tags} {shown} ontoggle={toggle} {onopen} {dropEnv} />
  </TreeMenu>
  <div class="side-foot">
    <div
      class="nav"
      class:active={graphShown}
      data-testid="nav-graph"
      role="button"
      tabindex="0"
      onclick={ongraph}
      onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), ongraph())}
    >
      <span class="ic">✳</span>Graph
    </div>
    <div
      class="nav"
      class:active={settingsShown}
      data-testid="nav-settings"
      role="button"
      tabindex="0"
      onclick={onsettings}
      onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onsettings())}
    >
      <span class="ic">⚙</span>Settings
    </div>
  </div>
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="resizer" role="separator" aria-orientation="vertical" aria-label="Resize sidebar" onpointerdown={drag}></div>
</aside>
