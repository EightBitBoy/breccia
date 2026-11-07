<script lang="ts">
  // The page color choice: five rows of five colors, "No color" below them, and below that a custom part, a slider
  // for any hue. Two tab stops: the grid's roving one (it starts at the current color, else at "No color") and the
  // slider; Tab and Shift Tab go from one to the other, and ArrowDown from "No color" reaches the slider. The focus
  // starts on the current color, which is the slider for a saved hue. In the grid, arrows, Home and End move, Enter or
  // Space picks (`colorPickerKey`); on the slider, arrows move the hue by 1, Page Up and Down by 10, Home and End to
  // the ends, and Enter saves it (`hueSliderKey`). A pick, or Enter on the slider, closes; Esc closes without saving.
  // A drag on the slider previews as it moves and saves once on release (one undo step), and the picker stays open.
  // While it is open the saved color stays marked; after a save the mark and the slider follow the new saved color.
  // No key goes on to the page behind it, so a block selection there stays: Esc, Tab or Delete are the picker's own.
  // That also keeps the keys from the popover's own handlers, so the grid closes on Esc itself and moves Tab itself.
  // The start takes the focus when the grid mounts and again a frame later: in a bits-ui popover, whose content is not
  // yet focusable at mount, the popover's open auto-focus lands on the first tab stop, which for a saved hue is not
  // the start. It knows nothing about where it is shown: the page's swatch puts it in a popover, a link menu can too.
  // Below the choices, a preview shows a line of text with a link and a tag on the color under the pointer, else on
  // the focused one, in the current theme.
  import { onMount, untrack } from 'svelte'
  import { customShade, hueTrack, washValue } from '../lib/customColor'
  import {
    CUSTOM,
    DEFAULT_HUE,
    NO_COLOR,
    PAGE_COLORS,
    PAGE_COLOR_ROWS,
    colorLabel,
    colorPickerKey,
    followHue,
    gridStop,
    hueAt,
    hueColor,
    hueSliderKey,
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
    /** A choice other than `color`: a color name, `hue <h>`, or null for "No color". */
    onpick: (color: string | null) => void
    /**
     * After every choice, the current one included, and on Esc, so the place showing the grid can close; not after a
     * drag on the slider, which keeps the picker open.
     */
    ondone?: () => void
  } = $props()

  /** The focused picker index (`CUSTOM` for the slider); the preview follows it. */
  let at = $state(untrack(() => pickerStart(color)))
  /** The grid index that holds the grid's roving tab stop. */
  let gridAt = $state(untrack(() => gridStop(at)))
  let root = $state<HTMLElement | null>(null)
  let slider = $state<HTMLElement | null>(null)
  const current = $derived(pickerStart(color))
  /**
   * The picker index under the pointer, null when the pointer is outside the choices; any key clears it, so the
   * preview follows the arrow keys. The slider sets it to `CUSTOM` when pointed at or pressed.
   */
  let hover = $state<number | null>(null)
  /** The hue the slider stands for: the saved hue, else the default. Moving the slider changes it, saving does not. */
  let hue = $state(untrack(() => parseHue(color) ?? DEFAULT_HUE))
  /** A drag on the slider is under way (the slider holds the pointer). */
  let dragging = false
  /** The color the preview shows (null: no color). */
  const preview = $derived(previewColor(hover, at, hue))
  const previewWash = $derived(preview === null ? undefined : washValue(preview, themeTokens.current))
  const track = $derived(themeTokens.current === null ? undefined : hueTrack(themeTokens.current))
  const thumb = $derived(themeTokens.current === null ? undefined : customShade(hue, themeTokens.current).shade)

  // A new saved hue (a save from here, or an undo) moves the slider to it, except during a drag, which would jump.
  $effect.pre(() => {
    const saved = color
    untrack(() => {
      if (!dragging) hue = followHue(hue, saved)
    })
  })

  function focusAt(i: number) {
    at = i
    if (i < CUSTOM) gridAt = i
    root?.querySelector<HTMLElement>(`[data-index="${i}"]`)?.focus({ preventScroll: true })
  }

  /** A key or a press has reached the picker, so the start no longer takes the focus back. */
  let moved = false

  onMount(() => {
    const start = at
    focusAt(start)
    const frame = requestAnimationFrame(() => {
      if (!moved && document.activeElement !== root?.querySelector(`[data-index="${start}"]`)) focusAt(start)
    })
    return () => cancelAnimationFrame(frame)
  })

  function choose(i: number) {
    const picked = i === NO_COLOR ? null : PAGE_COLORS[i]
    if (picked !== color) onpick(picked)
    ondone?.()
  }

  /** Saves the slider's hue when it is not the saved color already. */
  function saveHue() {
    const picked = hueColor(hue)
    if (picked !== color) onpick(picked)
  }

  function onKey(e: KeyboardEvent) {
    e.stopPropagation()
    moved = true
    hover = null
    if (e.key === 'Escape') {
      e.preventDefault()
      ondone?.()
      return
    }
    const input = { key: e.key, shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey, meta: e.metaKey }
    if (e.target === slider) {
      const r = hueSliderKey(input, hue)
      if (r === null) {
        if (e.key === 'Tab') e.preventDefault()
        return
      }
      e.preventDefault()
      if (r === 'leave') focusAt(gridAt)
      else if (r === 'save') {
        saveHue()
        ondone?.()
      } else hue = r
      return
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      if (!e.ctrlKey && !e.altKey && !e.metaKey) focusAt(CUSTOM)
      return
    }
    const r = colorPickerKey(input, at)
    if (r === null) return
    e.preventDefault()
    if (r === 'pick') choose(at)
    else focusAt(r)
  }

  function hueFromPointer(e: PointerEvent) {
    if (slider === null) return
    const box = slider.getBoundingClientRect()
    hue = hueAt(e.clientX - box.left, box.width)
  }

  function onSliderDown(e: PointerEvent) {
    if (e.button !== 0 || slider === null) return
    e.preventDefault()
    slider.setPointerCapture(e.pointerId)
    dragging = true
    hover = CUSTOM
    slider.focus({ preventScroll: true })
    hueFromPointer(e)
  }

  function onSliderMove(e: PointerEvent) {
    if (dragging) hueFromPointer(e)
  }

  function onSliderUp(e: PointerEvent) {
    if (!dragging) return
    dragging = false
    hueFromPointer(e)
    saveHue()
  }

  /** A cancelled drag, or one whose pointer was taken away, saves nothing. */
  function onSliderCancel() {
    dragging = false
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="pc-choice"
  bind:this={root}
  onkeydown={onKey}
  onpointerdown={() => (moved = true)}
  onpointerleave={() => (hover = null)}>
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
              tabindex={i === gridAt ? 0 : -1}
              onfocus={() => ((at = i), (gridAt = i))}
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
    tabindex={gridAt === NO_COLOR ? 0 : -1}
    onfocus={() => ((at = NO_COLOR), (gridAt = NO_COLOR))}
    onpointerenter={() => (hover = NO_COLOR)}
    onclick={() => choose(NO_COLOR)}>{colorLabel(null)}</button
  >
  <div class="pc-custom">
    <div class="pc-custom-label" aria-hidden="true">Custom</div>
    <div
      class="pc-hue"
      class:current={current === CUSTOM}
      bind:this={slider}
      style:background={track}
      role="slider"
      data-testid="page-color-hue"
      data-index={CUSTOM}
      data-current={current === CUSTOM ? '' : undefined}
      aria-label="Custom hue"
      aria-valuemin="0"
      aria-valuemax="359"
      aria-valuenow={hue}
      aria-valuetext={`Hue ${hue}`}
      title={colorLabel(hueColor(hue))}
      tabindex="0"
      onfocus={() => (at = CUSTOM)}
      onpointerenter={() => (hover = CUSTOM)}
      onpointerdown={onSliderDown}
      onpointermove={onSliderMove}
      onpointerup={onSliderUp}
      onpointercancel={onSliderCancel}
      onlostpointercapture={onSliderCancel}
    >
      <div class="pc-hue-thumb" style:left={`${(hue / 359) * 100}%`} style:background={thumb}></div>
    </div>
  </div>
  <div class="pc-preview" data-testid="page-color-preview" data-preview={preview ?? ''} aria-hidden="true">
    <div class="pc-preview-wash" data-testid="page-color-preview-wash" style:background={previewWash}>
      Notes with <span class="pc-preview-link">a link</span> and <span class="pc-preview-tag">#tag</span>
    </div>
  </div>
</div>
