<script lang="ts">
  // The status bar's theme button and its menu: the same choices as Settings > Appearance, applied at once.
  import { DropdownMenu } from 'bits-ui'
  import type { StatusItem } from '../lib/status'
  import { THEME_CHOICES, THEME_NAMES, parseTheme, type ThemeChoice } from '../lib/theme'

  let {
    item,
    theme,
    ontheme,
    onwheel,
  }: {
    item: StatusItem
    theme: ThemeChoice
    ontheme: (c: ThemeChoice) => void
    /** The wheel over the button (not with Ctrl or Cmd, which zoom, and not while the menu is open). */
    onwheel: (deltaY: number) => void
  } = $props()

  /**
   * Where the focus was when the menu opened (a block's editor, for one); it goes back there on close. A press on
   * the button does not move the focus (App's press handler), so this is the editor while a block is edited.
   */
  let before: HTMLElement | null = null
  let open = $state(false)
  let button = $state<HTMLElement | null>(null)

  // Not Svelte's onwheel: the listener must be able to preventDefault, so the page under it does not scroll.
  $effect(() => {
    const el = button
    if (!el) return
    const wheel = (e: WheelEvent) => {
      if (open || e.ctrlKey || e.metaKey || e.deltaY === 0) return
      e.preventDefault()
      onwheel(e.deltaY)
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  })
</script>

<DropdownMenu.Root
  bind:open
  onOpenChange={(o) => {
    if (o) before = document.activeElement instanceof HTMLElement ? document.activeElement : null
  }}
>
  <DropdownMenu.Trigger
    bind:ref={button}
    class="status-item"
    data-testid="status-item"
    data-id={item.id}
    aria-label={item.label ?? item.tip}
    title={item.tip}
  >
    {item.text}
  </DropdownMenu.Trigger>
  <DropdownMenu.Portal>
    <DropdownMenu.Content
      class="menu theme-menu"
      data-testid="theme-menu"
      data-theme-menu
      side="top"
      align="end"
      sideOffset={4}
      collisionPadding={8}
      onCloseAutoFocus={(e) => {
        // bits-ui also calls this as the menu opens: the focus moves into the menu, not to the button.
        if (open) {
          e.preventDefault()
          return
        }
        const back = before
        before = null
        // Opened from the keyboard, the focus was on the button itself: bits-ui gives it back there.
        if (!back?.isConnected || back === document.body || back.closest('[data-theme-menu]') || back.matches('[data-id="theme"]')) return
        e.preventDefault()
        back.focus({ preventScroll: true })
      }}
    >
      <DropdownMenu.RadioGroup value={theme} onValueChange={(v) => ontheme(parseTheme(v))} aria-label="Theme">
        {#each THEME_CHOICES as c (c)}
          <DropdownMenu.RadioItem class="menu-item theme-menu-item" value={c} data-theme-choice={c}>
            {THEME_NAMES[c]}
          </DropdownMenu.RadioItem>
        {/each}
      </DropdownMenu.RadioGroup>
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>
