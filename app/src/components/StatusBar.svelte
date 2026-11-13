<script lang="ts">
  // A thin strip along the bottom of the window (§7.13); empty and quiet with nothing to show.
  import type { StatusItem } from '../lib/status'
  import type { ThemeChoice } from '../lib/theme'
  import ThemeMenu from './ThemeMenu.svelte'

  let {
    left,
    right,
    onitem,
    theme,
    ontheme,
    onthemewheel,
  }: {
    left: StatusItem[]
    right: StatusItem[]
    /** A click on an item with an action (Enter and Space press it too). */
    onitem: (id: string) => void
    /** The theme item's current choice and its pick (the same as Settings > Themes). */
    theme: ThemeChoice
    ontheme: (c: ThemeChoice) => void
    /** The wheel over the theme item (`deltaY`): next or previous theme. */
    onthemewheel: (deltaY: number) => void
  } = $props()
</script>

{#snippet body(item: StatusItem)}
  {#if item.icon === 'history'}
    <!-- A clock with a turning-back arrow. -->
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9" />
      <path d="M2.2 2.2v2.6h2.6" />
      <path d="M8 5v3.2l2.2 1.4" />
    </svg>
  {/if}
  {item.text}
  {#if item.progress !== null}
    <span class="status-progress" style:width="{Math.min(1, Math.max(0, item.progress)) * 100}%"></span>
  {/if}
{/snippet}

{#snippet items(list: StatusItem[], side: 'left' | 'right')}
  <div class="status-side {side}">
    {#each list as item (item.id)}
      {#if item.id === 'theme'}
        <ThemeMenu {item} {theme} {ontheme} onwheel={onthemewheel} />
      {:else if item.action}
        <button
          type="button"
          class="status-item"
          class:warning={item.tone === 'warning'}
          class:icon={item.icon !== undefined}
          class:pressed={item.pressed === true}
          aria-pressed={item.pressed}
          aria-label={item.label ?? (item.icon ? item.tip : undefined)}
          data-testid="status-item"
          data-id={item.id}
          title={item.tip}
          onclick={() => onitem(item.id)}
        >
          {@render body(item)}
        </button>
      {:else}
        <div class="status-item" class:warning={item.tone === 'warning'} data-testid="status-item" data-id={item.id} title={item.tip}>
          {@render body(item)}
        </div>
      {/if}
    {/each}
  </div>
{/snippet}

<div class="status-bar" data-testid="status-bar">
  {@render items(left, 'left')}
  {@render items(right, 'right')}
</div>
