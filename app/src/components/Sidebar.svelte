<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity'
  import { reveal, rows as makeRows, tagRows, type Row } from '../lib/treeRows'
  import { baseName, joinPath, type Op } from '../lib/pageOps'
  import TreeMenu from './TreeMenu.svelte'
  import { clampWidth } from '../lib/sidebarLayout'
  import type { BoardSummary, TreeView } from '../lib/types'
  import PageTree from './PageTree.svelte'
  import DatePicker from './DatePicker.svelte'
  import { journalKeys } from '../lib/calendar'
  import { treeDrop, watchTreeDrops, type TreeDropEnv } from '../lib/dnd'
  import { dropFolder, PAGES, type Over } from '../lib/treeDrop'

  let {
    folder,
    folderName,
    tree,
    shown,
    journalShown,
    allPagesShown,
    settingsShown,
    graphShown,
    boards,
    boardShown,
    archiveShown,
    width,
    onopen,
    onjournal,
    onallpages,
    onsearch,
    onsettings,
    onnewpage,
    ongraph,
    onfolder,
    onboard,
    onnewboard,
    onarchive,
    onop,
    onresize,
    onresized,
    pickerOpen = $bindable(false),
    onpickday,
    ondrop,
  }: {
    folder: string
    folderName: string
    tree: TreeView | null
    /** The key of the page shown; null while the journal feed is shown. */
    shown: string | null
    /** Whether the journal feed is shown. */
    journalShown: boolean
    /** Whether the All pages table is shown. */
    allPagesShown: boolean
    /** Whether the Settings screen is shown. */
    settingsShown: boolean
    /** Whether the Graph screen is shown. */
    graphShown: boolean
    /** The configured boards, in order. */
    boards: BoardSummary[]
    /** The index of the board shown, or null. */
    boardShown: number | null
    /** Whether the Archive view is shown. */
    archiveShown: boolean
    width: number
    onopen: (name: string) => void
    onjournal: () => void
    onallpages: () => void
    /** The search box was clicked. */
    onsearch: () => void
    /** The footer's Settings entry. */
    onsettings: () => void
    /** The "+" by Pages: start an untitled page. */
    onnewpage: () => void
    /** The footer's Graph entry. */
    ongraph: () => void
    /** The folder name was clicked: Settings at the Notes folder section. */
    onfolder: () => void
    onboard: (i: number) => void
    onnewboard: () => void
    /** "Archive" in the Boards section: every archived task. */
    onarchive: () => void
    /** A context menu operation on a row (null: the empty tree area). */
    onop: (op: Op, row: Row | null) => void
    /** The width while dragging. */
    onresize: (w: number) => void
    /** The drag is over. */
    onresized: () => void
    /** The date picker by the Journal row is open (its icon, or `Ctrl Shift D`). */
    pickerOpen: boolean
    /** A day was picked in the date picker. */
    onpickday: (key: string) => void
    /** A page or folder row was dropped onto `folder` ('' is the top level); resolves once the tree is back. */
    ondrop: (row: Row, folder: string) => Promise<void>
  } = $props()

  /** Session-only folding; all folders start closed. */
  const open = new SvelteSet<string>()
  let seen: string | null = null

  // Showing a page opens the way to its row, once per page.
  $effect(() => {
    const r = reveal(tree, shown, seen)
    seen = r.seen
    for (const id of r.open) open.add(id)
  })

  const rows = $derived(tree ? makeRows(tree, open) : [])
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
    await ondrop(row, folder)
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
    const move = (m: PointerEvent) => onresize(clampWidth(m.clientX))
    const up = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      onresized()
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
