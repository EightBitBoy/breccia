<script lang="ts">
  // The page color choice: five rows of five colors and "No color" below them. The one tab stop starts at the current
  // color (or "No color") and takes the focus when the grid mounts; in a bits-ui popover, whose content is not yet
  // focusable then, leave the popover's open auto-focus on: it lands on that tab stop. Arrows, Home and End move,
  // Enter or Space picks (`colorPickerKey`), Esc closes. No key goes on to the page behind it, so a block selection
  // there stays: Esc, Tab or Delete are the picker's own. That also keeps the keys from the popover's own handlers, so
  // the grid closes on Esc itself, and Tab stays put (the grid has one tab stop, which the popover would loop to).
  // It knows nothing about where it is shown: the page's swatch puts it in a popover, a link menu can too.
  // Below the choices, a preview shows a line of text with a link and a tag on the color under the pointer, else on
  // the focused one, in the current theme.
  import { onMount, untrack } from 'svelte'
  import { washValue } from '../lib/customColor'
  import {
    DEFAULT_HUE,
    NO_COLOR,
    PAGE_COLORS,
    PAGE_COLOR_ROWS,
    colorLabel,
    colorPickerKey,
    parseHue,
    pickerStart,
    previewColor,
  } from '../lib/pageColors'
  import { themeTokens } from '../lib/themeTokens.svelte'

  let {
    color,
    onpick,
    ondone,
  }: {
    /** The page's color now (a name or `hue <h>`), or null. */
    color: string | null
    /** A choice other than `color`: a color name, or null for "No color". */
    onpick: (color: string | null) => void
    /** After every choice, the current one included, and on Esc, so the place showing the grid can close. */
    ondone?: () => void
  } = $props()

  /** The picker index that holds the roving tab stop. */
  let at = $state(untrack(() => pickerStart(color)))
  let root = $state<HTMLElement | null>(null)
  const current = $derived(pickerStart(color))
  /**
   * The picker index under the pointer, null when the pointer is outside the choices; any key clears it, so the
   * preview follows the arrow keys. A custom part sets it to `CUSTOM` when pointed at or pressed.
   */
  let hover = $state<number | null>(null)
  /** The hue the custom part stands for: the saved hue, else the default. A custom part moves it. */
  let hue = $state(untrack(() => parseHue(color) ?? DEFAULT_HUE))
  /** The color the preview shows (null: no color). */
  const preview = $derived(previewColor(hover, at, hue))
  const previewWash = $derived(preview === null ? undefined : washValue(preview, themeTokens.current))

  function focusAt(i: number) {
    at = i
    root?.querySelector<HTMLElement>(`[data-index="${i}"]`)?.focus({ preventScroll: true })
  }

  onMount(() => focusAt(at))

  function choose(i: number) {
    const picked = i === NO_COLOR ? null : PAGE_COLORS[i]
    if (picked !== color) onpick(picked)
    ondone?.()
  }

  function onKey(e: KeyboardEvent) {
    e.stopPropagation()
    hover = null
    if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault()
      if (e.key === 'Escape') ondone?.()
      return
    }
    const r = colorPickerKey({ key: e.key, shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey, meta: e.metaKey }, at)
    if (r === null) return
    e.preventDefault()
    if (r === 'pick') choose(at)
    else focusAt(r)
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="pc-choice" bind:this={root} onkeydown={onKey} onpointerleave={() => (hover = null)}>
  <div class="pc-grid" role="grid" aria-label="Page colors">
    {#each PAGE_COLOR_ROWS as row, r (r)}
      <div class="pc-row" role="row">
        {#each row as name, c (name)}
          {@const i = r * row.length + c}
          <span role="gridcell" aria-selected={i === current}>
            <button
              class="pc-cell"
              class:current={i === current}
              style:background={`var(--pc-${name})`}
              data-testid="page-color-option"
              data-color={name}
              data-index={i}
              data-current={i === current ? '' : undefined}
              aria-label={colorLabel(name)}
              title={colorLabel(name)}
              tabindex={i === at ? 0 : -1}
              onfocus={() => (at = i)}
              onpointerenter={() => (hover = i)}
              onclick={() => choose(i)}
            ></button>
          </span>
        {/each}
      </div>
    {/each}
  </div>
  <button
    class="pc-none"
    class:current={current === NO_COLOR}
    data-testid="page-color-none"
    data-index={NO_COLOR}
    data-current={current === NO_COLOR ? '' : undefined}
    aria-pressed={current === NO_COLOR}
    tabindex={at === NO_COLOR ? 0 : -1}
    onfocus={() => (at = NO_COLOR)}
    onpointerenter={() => (hover = NO_COLOR)}
    onclick={() => choose(NO_COLOR)}>{colorLabel(null)}</button
  >
  <div class="pc-preview" data-testid="page-color-preview" data-preview={preview ?? ''} aria-hidden="true">
    <div class="pc-preview-wash" data-testid="page-color-preview-wash" style:background={previewWash}>
      Notes with <span class="pc-preview-link">a link</span> and <span class="pc-preview-tag">#tag</span>
    </div>
  </div>
</div>
