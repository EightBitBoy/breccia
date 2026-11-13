<script lang="ts">
  import { linkDisplay } from '../lib/linkDisplay.svelte'
  import { DropdownMenu } from 'bits-ui'
  import { clip, descriptionOf, sourceLine, subtaskHint } from '../lib/board'
  import { cardDrag } from '../lib/dnd'
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
    /** "show more" was pressed. */
    onmore: () => void
  } = $props()

  const description = $derived(descriptionOf(card).map((b) => ({ ...b, hasChildren: false })))
  const clipped = $derived(clip(description, 4))
  const shown = $derived(expanded ? description : clipped.shown)
  const hint = $derived(subtaskHint(card))
  const noop = () => {}

  function click(e: MouseEvent) {
    if ((e.target as Element | null)?.closest?.('a, button')) return
    onopen()
  }

  function key(e: KeyboardEvent) {
    if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return
    e.preventDefault()
    onopen()
  }
</script>

<div
  class="card"
  data-testid="card"
  data-card={card.id}
  role="button"
  tabindex="0"
  onclick={click}
  onkeydown={key}
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
    <DropdownMenu.Root>
      <DropdownMenu.Trigger class="card-menu" data-testid="card-menu" aria-label="Card menu" title="Card menu">
        ⋯
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content class="menu" align="end">
          {#each menu.moveTo as k (k)}
            <DropdownMenu.Item class="menu-item" data-testid="menu-move" data-state={k} onSelect={() => onmove(k)}>
              Move to {k}
            </DropdownMenu.Item>
          {/each}
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
  <div class="src">{sourceLine(card)}</div>
</div>
