<script lang="ts">
  import type { BlockView } from '../lib/types'

  let {
    block,
    editing,
    selected,
    folded,
    flash = false,
    onedit,
    ontoggle,
  }: {
    block: BlockView
    editing: boolean
    selected: boolean
    folded: boolean
    /** Highlighted briefly (the jump from a card). */
    flash?: boolean
    /** A click on the rendered block; `shift` extends a selection. */
    onedit: (id: number, shift: boolean) => void
    ontoggle: (id: number) => void
  } = $props()
</script>

<div class="block" class:editing class:selected class:flash data-block-id={block.id} style:--depth={block.depth}>
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
    <div class="content" onclick={(e) => onedit(block.id, e.shiftKey)}>{@html block.html}</div>
  {/if}
</div>
