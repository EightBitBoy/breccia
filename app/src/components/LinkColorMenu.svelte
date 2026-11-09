<script lang="ts">
  // The right-click menu on a journal day's links and tags: "Color…" opens the page color grid at the link, for the
  // page the link goes to. A right-click in the block editor or on selected text keeps the native menu; anywhere else
  // that is not a colorable link or tag, no menu opens (`linkMenuAction`). "On selected text" means the point lies in
  // the selection's own boxes, not merely in an element that holds a selection.
  import type { Snippet } from 'svelte'
  import type { Action } from 'svelte/action'
  import { ContextMenu, Popover } from 'bits-ui'
  import { linkMenuAction, pickingColor, pointInBoxes, type Box } from '../lib/linkColor'
  import type { TargetView } from '../lib/types'
  import PageColorGrid from './PageColorGrid.svelte'

  let {
    targets,
    onsetcolor,
    children,
  }: {
    /** The day's colorable links and tags (`PageView.targets`). */
    targets: TargetView[]
    /** A new color for the page `key`, or null to remove it. */
    onsetcolor: (key: string, color: string | null) => void
    children: Snippet
  } = $props()

  /** The link the menu was opened on, and its anchor. */
  let target = $state<TargetView | null>(null)
  let anchor = $state<HTMLElement | null>(null)
  /** The page the open picker colors. */
  let picking = $state<TargetView | null>(null)
  let pickerOpen = $state(false)
  /** "Color…" was chosen: the picker opens once the menu has closed, so the menu's focus return cannot take it. */
  let pending = false

  /** The boxes of the selection's text. */
  function selectionBoxes(sel: Selection): Box[] {
    const boxes: Box[] = []
    for (let i = 0; i < sel.rangeCount; i++) boxes.push(...Array.from(sel.getRangeAt(i).getClientRects()))
    return boxes
  }

  /**
   * Decides before the menu trigger sees the event (a native listener on an inner element runs first): the native
   * menu stops the event here, "no menu" prevents its default, which the trigger then ignores.
   */
  const guard: Action<HTMLElement> = (node) => {
    function oncontextmenu(e: MouseEvent) {
      const el = e.target instanceof Element ? e.target : null
      const a = el?.closest<HTMLElement>('a.link, a.tag') ?? null
      const sel = window.getSelection()
      const onSelection = !!el && !!sel && !sel.isCollapsed && pointInBoxes(e.clientX, e.clientY, selectionBoxes(sel))
      const act = linkMenuAction(
        {
          inEditor: !!el?.closest('.editor-slot'),
          onSelection,
          anchor: a && { className: a.className, dataPage: a.getAttribute('data-page') },
        },
        targets,
      )
      if (act.kind === 'native') {
        e.stopPropagation()
      } else if (act.kind === 'none') {
        e.preventDefault()
      } else {
        target = act.target
        anchor = a
      }
    }
    node.addEventListener('contextmenu', oncontextmenu)
    return { destroy: () => node.removeEventListener('contextmenu', oncontextmenu) }
  }
</script>

<ContextMenu.Root>
  <ContextMenu.Trigger class="link-zone">
    <div class="link-zone-inner" use:guard>
      {@render children()}
    </div>
  </ContextMenu.Trigger>
  <ContextMenu.Portal>
    <ContextMenu.Content
      class="menu"
      data-testid="link-color-menu"
      onCloseAutoFocus={(e) => {
        e.preventDefault()
        if (!pending) return
        pending = false
        picking = target
        pickerOpen = true
      }}
    >
      <ContextMenu.Item class="menu-item" data-testid="link-color" onSelect={() => (pending = true)}>
        Color…
      </ContextMenu.Item>
    </ContextMenu.Content>
  </ContextMenu.Portal>
</ContextMenu.Root>

<Popover.Root bind:open={pickerOpen}>
  <Popover.Portal>
    <Popover.Content
      class="menu page-color-picker"
      data-testid="page-color-picker"
      role="dialog"
      aria-label={picking ? `Color of ${picking.name}` : undefined}
      customAnchor={anchor}
      side="bottom"
      align="start"
      sideOffset={4}
      collisionPadding={8}
      onCloseAutoFocus={(e) => e.preventDefault()}
    >
      {#if picking}
        {@const page = picking}
        <PageColorGrid
          color={pickingColor(targets, page)}
          onpick={(color) => onsetcolor(page.key, color)}
          ondone={() => (pickerOpen = false)}
        />
      {/if}
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>
