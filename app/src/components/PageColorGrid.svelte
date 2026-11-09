<script lang="ts">
  // The page color choice: five rows of five colors, "No color" below them, and below that a custom part: a slider
  // for any hue and, under it, a slider for its vividness (50 to 200, 100 is the plain look). Three tab stops: the
  // grid's roving one (it starts at the current color, else at "No color"), the hue slider and the vividness slider;
  // Tab goes grid, hue, vividness, grid and Shift Tab the other way (`pickerTab`), and ArrowDown from "No color"
  // reaches the hue slider. The vividness slider is always shown, so the layout never moves, but it is greyed out and
  // disabled (not a tab stop, no pointer or keys) until the saved color is a custom hue or the hue slider has been
  // focused or pointed at; then it stays enabled until the picker closes. The focus starts on the current color, which
  // is the hue slider for a saved hue. In the grid, arrows, Home and End move, Enter or Space picks (`colorPickerKey`);
  // on the hue slider, arrows move the hue by 1, Page Up and Down by 10, Home and End to the ends (`hueSliderKey`); on
  // the vividness slider, arrows move by 5, Page Up and Down by 25, Home and End to 50 and 200 (`vividSliderKey`).
  // Enter on either slider saves the hue with its vividness. A pick, or Enter on a slider, closes; Esc closes without
  // saving. A drag on either slider previews as it moves and saves once on release (one undo step), and the picker
  // stays open. While it is open the saved color stays marked; after a save the mark and the sliders follow the new
  // saved color.
  // No key goes on to the page behind it, so a block selection there stays: Esc, Tab or Delete are the picker's own.
  // That also keeps the keys from the popover's own handlers, so the grid closes on Esc itself and moves Tab itself.
  // The start takes the focus when the grid mounts and again a frame later: in a bits-ui popover, whose content is not
  // yet focusable at mount, the popover's open auto-focus lands on the first tab stop, which for a saved hue is not
  // the start. It knows nothing about where it is shown: the page's swatch puts it in a popover, a link menu can too.
  // Below the choices, a preview shows a line of text with a link and a tag on the color under the pointer, else on
  // the focused one, in the current theme. When readability holds a custom wash below what its vividness asks for, a
  // note under that line says it was softened.
  import { onMount, untrack } from 'svelte'
  import { customShade, hueTrack, vividTrack, washValue } from '../lib/customColor'
  import {
    CUSTOM,
    DEFAULT_HUE,
    DEFAULT_VIVID,
    MAX_VIVID,
    MIN_VIVID,
    NO_COLOR,
    PAGE_COLORS,
    PAGE_COLOR_ROWS,
    VIVID,
    colorLabel,
    colorPickerKey,
    followHue,
    followVivid,
    gridStop,
    hueAt,
    hueColor,
    hueSliderKey,
    parseCustom,
    pickerStart,
    pickerTab,
    previewColor,
    vividAt,
    vividSliderKey,
  } from '../lib/pageColors'
  import { themeTokens } from '../lib/themeTokens.svelte'

  let {
    color,
    onpick,
    ondone,
  }: {
    /** The page's color now (a name, `hue <h>` or `hue <h> vivid <v>`), or null. */
    color: string | null
    /** A choice other than `color`: a color name, `hue <h>` or `hue <h> vivid <v>`, or null for "No color". */
    onpick: (color: string | null) => void
    /**
     * After every choice, the current one included, and on Esc, so the place showing the grid can close; not after a
     * drag on a slider, which keeps the picker open.
     */
    ondone?: () => void
  } = $props()

  type SliderIndex = typeof CUSTOM | typeof VIVID

  /** The focused picker index (`CUSTOM` for the hue slider, `VIVID` for the vividness one); the preview follows it. */
  let at = $state(untrack(() => pickerStart(color)))
  /** The grid index that holds the grid's roving tab stop. */
  let gridAt = $state(untrack(() => gridStop(at)))
  let root = $state<HTMLElement | null>(null)
  let slider = $state<HTMLElement | null>(null)
  let vividSlider = $state<HTMLElement | null>(null)
  const current = $derived(pickerStart(color))
  /**
   * The picker index under the pointer, null when the pointer is outside the choices; any key clears it, so the
   * preview follows the arrow keys. A slider sets it to its own index when pointed at or pressed.
   */
  let hover = $state<number | null>(null)
  /** The hue the slider stands for: the saved hue, else the default. Moving the slider changes it, saving does not. */
  let hue = $state(untrack(() => parseCustom(color)?.hue ?? DEFAULT_HUE))
  /** The vividness the second slider stands for: the saved one, else 100. Like `hue`, saving does not change it. */
  let vivid = $state(untrack(() => parseCustom(color)?.vivid ?? DEFAULT_VIVID))
  /**
   * The custom part has been reached in this opening: the hue slider, or the enabled vividness slider, was focused or
   * pointed at. It never goes back to false while the picker is open.
   */
  let customSeen = $state(untrack(() => pickerStart(color) === CUSTOM))
  /** The vividness slider is enabled; a color that becomes a custom hue while the picker is open enables it too. */
  const vividOn = $derived(customSeen || current === CUSTOM)
  /** The slider that holds the pointer during a drag, else null. */
  let dragging: SliderIndex | null = null
  /** The color the preview shows (null: no color). */
  const preview = $derived(previewColor(hover, at, hue, vivid))
  const previewWash = $derived(preview === null ? undefined : washValue(preview, themeTokens.current))
  /** The custom shade the sliders stand for, in the current theme. */
  const shown = $derived(themeTokens.current === null ? undefined : customShade(hue, themeTokens.current, vivid))
  /** Readability holds the shown custom wash below what its vividness asks for. */
  const limited = $derived(shown?.limited === true)
  const previewLimited = $derived(limited && parseCustom(preview) !== null)
  const track = $derived(themeTokens.current === null ? undefined : hueTrack(themeTokens.current, vivid))
  const vividBar = $derived(themeTokens.current === null ? undefined : vividTrack(hue, themeTokens.current))

  // A new saved custom color (a save from here, or an undo) moves the sliders to it, except during a drag, which would
  // jump. It also keeps the vividness slider enabled if the color later turns back into a name while the picker is
  // open, so the slider that may hold the focus never greys out under it.
  $effect.pre(() => {
    const saved = color
    untrack(() => {
      if (pickerStart(saved) === CUSTOM) customSeen = true
      if (dragging !== null) return
      hue = followHue(hue, saved)
      vivid = followVivid(vivid, saved)
    })
  })

  function focusAt(i: number) {
    at = i
    if (i < CUSTOM) gridAt = i
    else customSeen = true
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

  /** Saves the sliders' hue and vividness when they are not the saved color already. */
  function saveCustom() {
    const picked = hueColor(hue, vivid)
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
    const onHue = e.target === slider
    if (onHue || e.target === vividSlider) {
      // A disabled vividness slider takes no keys (it cannot normally hold the focus).
      if (!onHue && !vividOn) {
        e.preventDefault()
        return
      }
      const r = onHue ? hueSliderKey(input, hue) : vividSliderKey(input, vivid)
      if (r === null) {
        if (e.key === 'Tab') e.preventDefault()
        return
      }
      e.preventDefault()
      if (r === 'leave') focusAt(pickerTab(onHue ? CUSTOM : VIVID, e.shiftKey, gridAt, vividOn))
      else if (r === 'save') {
        saveCustom()
        ondone?.()
      } else if (onHue) hue = r
      else vivid = r
      return
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      if (!e.ctrlKey && !e.altKey && !e.metaKey) focusAt(pickerTab(at, e.shiftKey, gridAt, vividOn))
      return
    }
    const r = colorPickerKey(input, at)
    if (r === null) return
    e.preventDefault()
    if (r === 'pick') choose(at)
    else focusAt(r)
  }

  /** Focus or pointer on a slider: the hue slider always counts, the vividness slider only while it is enabled. */
  function reach(i: SliderIndex, how: 'focus' | 'pointer') {
    if (i === VIVID && !vividOn) return
    customSeen = true
    if (how === 'focus') at = i
    else hover = i
  }

  /**
   * The pointer handlers of a slider: a press takes the pointer and the focus, a move previews, the release saves once
   * and keeps the picker open; a cancelled drag, or one whose pointer was taken away, saves nothing. A disabled
   * vividness slider ignores them all.
   */
  function sliderDrag(i: SliderIndex) {
    const el = () => (i === CUSTOM ? slider : vividSlider)
    const follow = (e: PointerEvent) => {
      const s = el()
      if (s === null) return
      const box = s.getBoundingClientRect()
      const x = e.clientX - box.left
      if (i === CUSTOM) hue = hueAt(x, box.width)
      else vivid = vividAt(x, box.width)
    }
    const cancel = () => {
      if (dragging === i) dragging = null
    }
    return {
      onpointerdown(e: PointerEvent) {
        const s = el()
        if (e.button !== 0 || s === null || (i === VIVID && !vividOn)) return
        e.preventDefault()
        s.setPointerCapture(e.pointerId)
        dragging = i
        hover = i
        s.focus({ preventScroll: true })
        follow(e)
      },
      onpointermove(e: PointerEvent) {
        if (dragging === i) follow(e)
      },
      onpointerup(e: PointerEvent) {
        if (dragging !== i) return
        dragging = null
        follow(e)
        saveCustom()
      },
      onpointercancel: cancel,
      onlostpointercapture: cancel,
    }
  }

  const hueDrag = sliderDrag(CUSTOM)
  const vividDrag = sliderDrag(VIVID)
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
      title={colorLabel(hueColor(hue, vivid))}
      tabindex="0"
      onfocus={() => reach(CUSTOM, 'focus')}
      onpointerenter={() => reach(CUSTOM, 'pointer')}
      {...hueDrag}
    >
      <div class="pc-hue-thumb" style:left={`${(hue / 359) * 100}%`} style:background={shown?.shade}></div>
    </div>
  </div>
  <div class="pc-vivid-part" class:off={!vividOn}>
    <div class="pc-custom-label" aria-hidden="true">Vividness</div>
    <div
      class="pc-hue pc-vivid"
      bind:this={vividSlider}
      style:background={vividBar}
      role="slider"
      data-testid="page-color-vivid"
      data-index={VIVID}
      aria-label="Vividness"
      aria-valuemin={MIN_VIVID}
      aria-valuemax={MAX_VIVID}
      aria-valuenow={vivid}
      aria-valuetext={`Vividness ${vivid}${limited ? ', softened for readability' : ''}`}
      aria-disabled={vividOn ? undefined : 'true'}
      tabindex={vividOn ? 0 : -1}
      onfocus={() => reach(VIVID, 'focus')}
      onpointerenter={() => reach(VIVID, 'pointer')}
      {...vividDrag}
    >
      <div
        class="pc-hue-thumb"
        style:left={`${((vivid - MIN_VIVID) / (MAX_VIVID - MIN_VIVID)) * 100}%`}
        style:background={shown?.wash}
      ></div>
    </div>
  </div>
  <div
    class="pc-preview"
    data-testid="page-color-preview"
    data-preview={preview ?? ''}
    data-limited={previewLimited ? '' : undefined}
    aria-hidden="true"
  >
    <div class="pc-preview-wash" data-testid="page-color-preview-wash" style:background={previewWash}>
      Notes with <span class="pc-preview-link">a link</span> and <span class="pc-preview-tag">#tag</span>
      {#if previewLimited}
        <div class="pc-preview-note" data-testid="page-color-limited">Softened here so text stays readable</div>
      {/if}
    </div>
  </div>
</div>
