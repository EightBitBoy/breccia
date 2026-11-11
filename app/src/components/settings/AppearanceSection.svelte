<script lang="ts">
  import { THEME_CHOICES, THEME_NAMES, type ThemeChoice, type ThemeId } from '../../lib/theme'

  let { theme, ontheme }: { theme: ThemeChoice; ontheme: (c: ThemeChoice) => void } = $props()

</script>

{#snippet preview(id: ThemeId)}
  <!-- data-theme on the preview itself: it shows that theme's tokens whatever the app's theme is -->
  <span class="theme-preview" data-theme={id}>
    <span class="tp-side"></span>
    <span class="tp-body">
      <span class="tp-line"></span>
      <span class="tp-line short"></span>
      <span class="tp-dot"></span>
    </span>
  </span>
{/snippet}

<p class="settings-hint">This computer only: the theme is not stored in the notes folder.</p>
<div class="theme-options" role="radiogroup" aria-label="Theme">
  {#each THEME_CHOICES as c (c)}
    <button
      type="button"
      class="theme-option"
      role="radio"
      aria-checked={theme === c}
      data-testid="theme-option"
      data-theme-choice={c}
      onclick={() => ontheme(c)}
    >
      {#if c === 'system'}
        <span class="theme-split">{@render preview('light')}{@render preview('dark')}</span>
      {:else}
        {@render preview(c)}
      {/if}
      <span class="theme-name">{THEME_NAMES[c]}</span>
    </button>
  {/each}
</div>
