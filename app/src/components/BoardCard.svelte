<script lang="ts">
  import { linkDisplay } from '../lib/linkDisplay.svelte'
  import { DropdownMenu } from 'bits-ui'
  import { cardDue, clip, descriptionOf, sourceLine, subtaskHint } from '../lib/board'
  import { today } from '../lib/today.svelte'
  import { focusedCardKey } from '../lib/cardKeys'
  import { cardDrag } from '../lib/dnd'
  import { isMac as mac } from '../lib/platform'
  import type { Box } from '../lib/linkColor'
  import type { CardView } from '../lib/types'
  import BlockRow from './BlockRow.svelte'

  let {
    card,
    column,
    menu,
    draggable,
    expanded,
    onopen,
    onjump,
    onmove,
    onarchive,
    onsetdue,
    onmore,
  }: {
    card: CardView
    /** The keyword of the card's column (its state). */
    column: string
    /** The menu's items (`cardMenu`): the columns for "Move to …", and whether "Archive" shows. */
    menu: { moveTo: string[]; archive: boolean }
    /** Whether the card can be dragged now. */
    draggable: boolean
    /** "show more" was pressed: the whole description shows (for the session). */
    expanded: boolean
    /** A click on the card that is not on a link or a button. */
    onopen: () => void
    /** The jump button: open the source page at the block. */
    onjump: () => void
    /** "Move to KEYWORD" from the card menu. */
    onmove: (keyword: string) => void
    /** "Archive" from the card menu. */
    onarchive: () => void
    /** "Set due date…" from the card menu: open the due date calendar at `anchor` (the menu button). */
    onsetdue: (anchor: Box) => void
    /** "show more" was pressed. */
    onmore: () => void
  } = $props()

  const description = $derived(descriptionOf(card).map((b) => ({ ...b, hasChildren: false })))
  const clipped = $derived(clip(description, 4))
  const shown = $derived(expanded ? description : clipped.shown)
  const hint = $derived(subtaskHint(card))
  // Reading `today.key` makes the chip follow midnight.
  const due = $derived(cardDue(card, today.key))
  const noop = () => {}

  let menuButton = $state<HTMLElement | null>(null)
  let cardEl = $state<HTMLElement | null>(null)
  /** "Set due date…" was chosen: the calendar opens once the menu has closed, so the menu's focus return cannot take it. */
  let pendingDue = false
  let menuOpen = $state(false)
  /** The menu was opened by a key on the focused card: closing it gives the focus back to the card. */
  let menuFromCard = false

  function menuClosed(e: Event) {
    // bits-ui also calls this as the menu opens: the focus stays for the menu's first item then.
    if (menuOpen) {
      if (menuFromCard) e.preventDefault()
      return
    }
    const fromCard = menuFromCard
    menuFromCard = false
    if (!pendingDue) {
      if (!fromCard) return
      e.preventDefault()
      if (cardEl?.isConnected) cardEl.focus({ preventScroll: true })
      return
    }
    pendingDue = false
    e.preventDefault()
    if (!menuButton?.isConnected) return
    // The calendar gives the focus back to where it is now. The menu button shows only on hover or a keyboard
    // focus, and a hidden button loses the focus, so after a mouse pick (or the menu opened from the card) the card
    // itself holds it.
    if (fromCard) cardEl?.focus({ preventScroll: true })
    else {
      menuButton.focus({ preventScroll: true })
      if (!menuButton.matches(':focus-visible')) cardEl?.focus({ preventScroll: true })
    }
    setDue()
  }

  /** Opens the due date calendar at the menu button; the focus stays where it is, and the calendar gives it back. */
  function setDue() {
    if (!menuButton) return
    const r = menuButton.getBoundingClientRect()
    onsetdue({ left: r.left, top: r.top, right: r.right, bottom: r.bottom })
  }

  function click(e: MouseEvent) {
    if ((e.target as Element | null)?.closest?.('a, button')) return
    onopen()
  }

  function key(e: KeyboardEvent) {
    if (e.target !== e.currentTarget) return
    const act = focusedCardKey({ key: e.key, shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey, meta: e.metaKey }, mac)
    if (act === null) return
    e.preventDefault()
    if (act === 'open') onopen()
    else if (act === 'due') setDue()
    else {
      menuFromCard = true
      menuOpen = true
    }
  }

  /** The context-menu key and Shift F10 also send a `contextmenu` event to what has the focus (the card, or the menu
   *  it just opened): the card menu takes the key, so the WebView's own menu stays shut. */
  function noContextMenu(e: MouseEvent) {
    if (e.target === e.currentTarget) e.preventDefault()
  }
</script>

<div
  class="card"
  data-testid="card"
  data-card={card.id}
  bind:this={cardEl}
  role="button"
  tabindex="0"
  onclick={click}
  onkeydown={key}
  oncontextmenu={noContextMenu}
  use:cardDrag={{ id: card.id, state: column, disabled: !draggable }}
>
  <div class="tools">
    <button
      class="jump"
      data-testid="card-jump"
      aria-label="Show in {card.source}"
      title="Show in {card.source}"
      onclick={onjump}>↗</button
    >
    <DropdownMenu.Root bind:open={menuOpen}>
      <DropdownMenu.Trigger bind:ref={menuButton} class="card-menu" data-testid="card-menu" aria-label="Card menu" title="Card menu">
        ⋯
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content class="menu" align="end" onCloseAutoFocus={menuClosed} oncontextmenu={(e) => e.preventDefault()}>
          {#each menu.moveTo as k (k)}
            <DropdownMenu.Item class="menu-item" data-testid="menu-move" data-state={k} onSelect={() => onmove(k)}>
              Move to {k}
            </DropdownMenu.Item>
          {/each}
          <DropdownMenu.Item class="menu-item" data-testid="menu-due" onSelect={() => (pendingDue = true)}>
            Set due date…
          </DropdownMenu.Item>
          {#if menu.archive}
            <DropdownMenu.Item class="menu-item" data-testid="menu-archive" onSelect={onarchive}>
              Archive
            </DropdownMenu.Item>
          {/if}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  </div>
  <div class="card-title" data-testid="card-title">{@html linkDisplay.apply(card.html)}</div>
  {#if card.parent}
    <div class="parent">↳ {card.parent}</div>
  {/if}
  {#if shown.length}
    <div class="desc">
      {#each shown as b (b.id)}
        <BlockRow block={b} editing={false} selected={false} folded={false} onedit={noop} ontoggle={noop} />
      {/each}
    </div>
    {#if !expanded && clipped.more > 0}
      <button class="more" onclick={onmore}>show more ({clipped.more})</button>
    {/if}
  {/if}
  {#if hint}
    <div class="hint">{hint}</div>
  {/if}
  <div class="src">
    {sourceLine(card)}{#if due}<span class="chip due" data-testid="card-due" data-due={card.blocks[0]?.due} data-tone={due.tone} title={due.title}
        >{due.label}</span
      >{/if}
  </div>
</div>
