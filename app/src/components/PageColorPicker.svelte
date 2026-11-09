<script lang="ts">
  // The page color swatch at the right end of a page's title row: a click opens the color grid below it, and the grid
  // puts the focus on its start itself (the popover's own open auto-focus is turned off). A pick,
  // Esc or a click outside closes it and sends the focus back to the swatch, so undo works on it right away: while
  // it is focused, Ctrl Z takes the page's newest step back and Ctrl Shift Z or Ctrl Y redoes it (`swatchKey`).
  import { Popover } from 'bits-ui'
  import { swatchValue } from '../lib/customColor'
  import { colorLabel, swatchKey } from '../lib/pageColors'
  import { themeTokens } from '../lib/themeTokens.svelte'
  import { isMac as mac } from '../lib/platform'
  import PageColorGrid from './PageColorGrid.svelte'

  let {
    color,
    onpick,
    onhistory,
  }: {
    /** The page's color (a name or `hue <h>`), or null. */
    color: string | null
    /** A new color for the page, or null to remove it. */
    onpick: (color: string | null) => void
    /** Undo (false) or redo (true) on the page. */
    onhistory: (redo: boolean) => void
  } = $props()

  const fill = $derived(color === null ? undefined : swatchValue(color, themeTokens.current))

  let open = $state(false)
  let trigger = $state<HTMLElement | null>(null)

  function onKey(e: KeyboardEvent) {
    if (open) return
    const a = swatchKey({ key: e.key, shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey, meta: e.metaKey }, mac)
    if (a === null) return
    e.preventDefault()
    onhistory(a === 'redo')
  }
</script>

<Popover.Root bind:open>
  <Popover.Trigger
    bind:ref={trigger}
    class={color === null ? 'page-color-btn none' : 'page-color-btn'}
    style={fill === undefined ? undefined : `background: ${fill}`}
    data-testid="page-color"
    data-color={color ?? ''}
    aria-label={`Page color: ${color === null ? 'none' : colorLabel(color)}`}
    title="Page color"
    onkeydown={onKey}
  />
  <Popover.Portal>
    <Popover.Content
      class="menu page-color-picker"
      data-testid="page-color-picker"
      role="dialog"
      aria-label="Page color"
      side="bottom"
      align="end"
      sideOffset={4}
      collisionPadding={8}
      onOpenAutoFocus={(e) => e.preventDefault()}
      onCloseAutoFocus={(e) => {
        e.preventDefault()
        if (trigger?.isConnected) trigger.focus({ preventScroll: true })
      }}
    >
      <PageColorGrid {color} {onpick} ondone={() => (open = false)} />
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>
