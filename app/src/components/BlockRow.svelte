<script lang="ts">
  import { linkDisplay } from '../lib/linkDisplay.svelte'
  import type { BlockView } from '../lib/types'
  import type { RowWash } from '../lib/pageColors'
  import { washValue } from '../lib/customColor'
  import { themeTokens } from '../lib/themeTokens.svelte'
  import { fillDueChips } from '../lib/due'
  import { today } from '../lib/today.svelte'
  import { linkTarget } from '../lib/dnd'

  let {
    block,
    editing,
    selected,
    folded,
    flash = false,
    wash = null,
    linkDrops = false,
    onedit,
    ontoggle,
  }: {
    block: BlockView
    editing: boolean
    selected: boolean
    folded: boolean
    /** Highlighted briefly (the jump from a card). */
    flash?: boolean
    /** The row's part of a page color wash (journal only). */
    wash?: RowWash | null
    /** Whether a page dragged from the sidebar can be dropped on the row for a link (a page's or day's outline). */
    linkDrops?: boolean
    /** A click on the rendered block; `shift` extends a selection. */
    onedit: (id: number, shift: boolean) => void
    ontoggle: (id: number) => void
  } = $props()
</script>

<div
  class="block"
  class:editing
  class:selected
  class:flash
  class:wash={wash !== null}
  class:wash-top={wash?.top}
  class:wash-bottom={wash?.bottom}
  class:wash-gap={wash?.gap}
  data-block-id={block.id}
  data-wash={wash?.color}
  style:--depth={block.depth}
  style:--wash={wash ? washValue(wash.color, themeTokens.current) : undefined}
  use:linkTarget={linkDrops ? { block: block.id } : null}
>
  <span class="fold">
    {#if block.hasChildren}
      <button
        class="arrow"
        aria-label={folded ? 'Expand' : 'Collapse'}
        aria-expanded={!folded}
        onclick={() => ontoggle(block.id)}>{folded ? '▸' : '▾'}</button
      >
    {/if}
  </span>
  <span class="dot" class:folded></span>
  {#if editing}
    <div class="editor-slot"></div>
  {:else}
    <!-- Links inside are handled by the app's anchor handler before this click. -->
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="content" onclick={(e) => onedit(block.id, e.shiftKey)}>{@html linkDisplay.apply(fillDueChips(block.html, today.key))}</div>
  {/if}
</div>
