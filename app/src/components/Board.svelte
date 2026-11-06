<script lang="ts">
  import { DropdownMenu } from 'bits-ui'
  import { BOARD_COL_DEFAULT, BOARD_COL_MAX, BOARD_COL_MIN, BOARD_COL_SLIDER_STEP, stepColumn } from '../lib/boardWidth'
  import { cardMenu, cardRoot, placeCommand } from '../lib/board'
  import { columnDrop, hiddenDrop, watchDrops, watchPeek } from '../lib/dnd'
  import { canHide, hideDuration, markerTitle, PEEK_MS } from '../lib/hiddenColumns'
  import { refBlocks } from '../lib/refs'
  import type { BlockId, BoardView, CardView, Command, RefsView } from '../lib/types'
  import BlockRow from './BlockRow.svelte'
  import BoardCard from './BoardCard.svelte'

  let {
    board,
    card,
    cardColumn,
    folded,
    editingId,
    flash,
    expanded,
    onmore,
    onopencard,
    onedit,
    ontoggle,
    onjump,
    onadd,
    onclosecard,
    archiveDays,
    oncommand,
    onsettings,
    columnWidth,
    oncolumnwidth,
    hidden,
    peek,
    onhide,
    onshow,
    onpeek,
    onpeekend,
  }: {
    board: BoardView
    /** The open card, edited in place; null while none is open. */
    card: RefsView | null
    /** The column the open card is shown in. */
    cardColumn: string | null
    folded: ReadonlySet<number>
    editingId: BlockId | null
    /** A block to highlight briefly. */
    flash: BlockId | null
    /** Cards whose "show more" was pressed (kept for the session). */
    expanded: ReadonlySet<BlockId>
    /** "show more" on card `id`. */
    onmore: (id: BlockId) => void
    onopencard: (c: CardView, column: string) => void
    onedit: (id: BlockId, shift: boolean) => void
    ontoggle: (id: BlockId) => void
    onjump: (c: CardView) => void
    /** "+ Add" in column `column` (its keyword). */
    onadd: (column: string) => void
    /** Esc while a card is open and no block is edited. */
    onclosecard: () => void
    /** `[board] archive_after_days`. */
    archiveDays: number
    /** A drop, "Move to", "Archive" or "Archive finished …". */
    oncommand: (cmd: Command) => void
    /** The title was clicked: board settings. */
    onsettings: () => void
    /** The column width in px, or null while the columns fill the window. */
    columnWidth: number | null
    /** A new width; `final` once the slider is let go or a button pressed (then it is saved). */
    oncolumnwidth: (w: number, final: boolean) => void
    /** The columns this board hides. */
    hidden: ReadonlySet<string>
    /** Hidden columns a card drag has opened for the rest of the drag. */
    peek: ReadonlySet<string>
    onhide: (keyword: string) => void
    onshow: (keyword: string) => void
    /** A dragged card rested on the marker of `keyword`. */
    onpeek: (keyword: string) => void
    /** The card drag ended. */
    onpeekend: () => void
  } = $props()

  const openId = $derived(cardRoot(card))
  const openBlocks = $derived(card ? refBlocks(card, folded) : [])

  const keywords = $derived(board.columns.map((c) => c.keyword))

  // A drop puts the card at its place in the column; the core sets the state and `priority::`.
  $effect(() =>
    watchDrops((c, target, before) => {
      const col = board.columns.find((k) => k.keyword === target)
      if (!col) return
      const cmd = placeCommand(c, { keyword: col.keyword, finished: col.finished, ids: col.cards.map((x) => x.id) }, before)
      if (cmd) oncommand(cmd)
    }),
  )

  // A dragged card resting on a hidden column's marker opens the column until the drag ends.
  $effect(() => watchPeek((k) => onpeek(k), () => onpeekend(), PEEK_MS))

  /** Columns shown again from their marker: they widen (CSS `.col.widen`) until the animation ends. A column a card
   *  drag opens appears at once. */
  let widening = $state(new Set<string>())
  function showColumn(keyword: string) {
    widening = new Set([...widening, keyword])
    onshow(keyword)
  }
  function widened(keyword: string) {
    if (!widening.has(keyword)) return
    const next = new Set(widening)
    next.delete(keyword)
    widening = next
  }

  /** The column narrows to its marker when hidden. */
  function narrow(node: HTMLElement) {
    const w = node.offsetWidth
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    return {
      duration: hideDuration(reduced),
      css: (t: number) =>
        `flex: 0 0 ${t * w}px; width: ${t * w}px; min-width: 0; overflow: hidden; opacity: ${t}; ` +
        `padding-left: ${t * 10}px; padding-right: ${t * 10}px;`,
    }
  }

  // Capture phase: the editor's own Esc clears `editingId` before the bubble phase,
  // and one Esc would then leave the block and close the card too. An open dialog or
  // menu takes its own Esc.
  function onKey(e: KeyboardEvent) {
    if (e.key !== 'Escape' || card === null || editingId !== null) return
    if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]')) return
    onclosecard()
  }

  function titleKey(e: KeyboardEvent) {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    onsettings()
  }
  /** Sets `--view-w` to the main view's visible content width, so the title row stays in sight while
   *  wide columns scroll sideways with the main view. */
  function viewWidth(el: HTMLElement) {
    const main = el.closest<HTMLElement>('.main')
    if (!main) return
    const set = () => {
      const cs = getComputedStyle(main)
      const w = main.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      el.style.setProperty('--view-w', `${w}px`)
    }
    set()
    const ro = new ResizeObserver(set)
    ro.observe(main)
    return { destroy: () => ro.disconnect() }
  }
</script>

<svelte:window onkeydowncapture={onKey} />

{#snippet openCard()}
  <div class="card open" data-card-open>
    {#each openBlocks as b (b.id)}
      <BlockRow
        block={b}
        editing={b.id === editingId}
        selected={false}
        folded={folded.has(b.id)}
        flash={b.id === flash}
        {onedit}
        {ontoggle}
      />
    {/each}
  </div>
{/snippet}

<section class="board" use:viewWidth>
  <div class="ptitle">
    <!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
    <h1
      class="renamable"
      data-testid="board-title"
      role="button"
      tabindex="0"
      title="Board settings"
      onclick={onsettings}
      onkeydown={titleKey}
    >
      {board.name}
    </h1>
    <span class="arr">board · {board.columns.length} {board.columns.length === 1 ? 'column' : 'columns'}</span>
    <div class="col-width" data-testid="col-width" title="Column width">
      <button
        type="button"
        aria-label="Narrower columns"
        data-testid="col-narrower"
        disabled={columnWidth !== null && columnWidth <= BOARD_COL_MIN}
        onclick={() => oncolumnwidth(stepColumn(columnWidth, -1), true)}>−</button
      >
      <input
        type="range"
        aria-label="Column width"
        data-testid="col-slider"
        min={BOARD_COL_MIN}
        max={BOARD_COL_MAX}
        step={BOARD_COL_SLIDER_STEP}
        value={columnWidth ?? BOARD_COL_DEFAULT}
        oninput={(e) => oncolumnwidth(Number(e.currentTarget.value), false)}
        onchange={(e) => oncolumnwidth(Number(e.currentTarget.value), true)}
      />
      <button
        type="button"
        aria-label="Wider columns"
        data-testid="col-wider"
        disabled={columnWidth !== null && columnWidth >= BOARD_COL_MAX}
        onclick={() => oncolumnwidth(stepColumn(columnWidth, 1), true)}>+</button
      >
    </div>
  </div>
  {#if board.unknown.length}
    <p class="board-note">Not shown, no such state: {board.unknown.join(', ')}</p>
  {/if}
  <div class="cols" class:sized={columnWidth !== null} style:--col-w={columnWidth === null ? null : `${columnWidth}px`}>
    {#each board.columns as col (col.keyword)}
      {#if hidden.has(col.keyword) && !peek.has(col.keyword)}
        <button
          type="button"
          class="col-hidden"
          data-testid="hidden-column"
          data-state={col.keyword}
          title={markerTitle(col.keyword, col.cards.length)}
          aria-label={markerTitle(col.keyword, col.cards.length)}
          use:hiddenDrop={{ state: col.keyword, finished: col.finished }}
          onclick={() => showColumn(col.keyword)}><span class="tri" aria-hidden="true">▾</span></button
        >
      {:else}
      {@const hideable = canHide(col.keyword, keywords, hidden)}
      <div
        class="col"
        data-testid="column"
        data-state={col.keyword}
        use:columnDrop={{ state: col.keyword, finished: col.finished }}
        class:widen={widening.has(col.keyword)}
        onanimationend={() => widened(col.keyword)}
        out:narrow
      >
        <h4 style:color="var(--c-{col.color})">
          {col.keyword}
          <span class="col-tools">
            {#if hideable}
              <button
                type="button"
                class="col-hide"
                data-testid="hide-column"
                aria-label="Hide {col.keyword}"
                title="Hide column"
                onclick={() => onhide(col.keyword)}
              >
                <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8Z" />
                  <circle cx="8" cy="8" r="2" />
                  <path d="M2.5 13.5l11-11" />
                </svg>
              </button>
            {/if}
            {#if col.finished}
              <DropdownMenu.Root>
                <DropdownMenu.Trigger
                  class="col-menu"
                  data-testid="column-menu"
                  aria-label="{col.keyword} menu"
                  title="{col.keyword} menu">⋯</DropdownMenu.Trigger
                >
                <DropdownMenu.Portal>
                  <DropdownMenu.Content class="menu" align="end">
                    <DropdownMenu.Item
                      class="menu-item"
                      data-testid="menu-archive-old"
                      onSelect={() => oncommand({ type: 'board.archive', keyword: col.keyword })}
                    >
                      Archive finished more than {archiveDays} days ago
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            {/if}
            <span class="count">{col.cards.length}</span>
          </span>
        </h4>
        {#each col.cards as c (c.id)}
          {#if c.id === openId && col.keyword === cardColumn}
            {@render openCard()}
          {:else}
            <BoardCard
              card={c}
              column={col.keyword}
              menu={cardMenu(col.keyword, keywords)}
              draggable={card === null}
              expanded={expanded.has(c.id)}
              onmore={() => onmore(c.id)}
              onopen={() => onopencard(c, col.keyword)}
              onjump={() => onjump(c)}
              onmove={(k) => oncommand({ type: 'blocks.setState', ids: [c.id], keyword: k })}
              onarchive={() => oncommand({ type: 'blocks.setArchived', ids: [c.id], archived: true })}
            />
          {/if}
        {/each}
        {#if card && col.keyword === cardColumn && !col.cards.some((c) => c.id === openId)}
          {@render openCard()}
        {/if}
        <button class="add-card" data-testid="add-card" onclick={() => onadd(col.keyword)}>+ Add</button>
      </div>
      {/if}
    {/each}
  </div>
</section>
