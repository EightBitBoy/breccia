<script lang="ts">
  // The right-click menu on a journal day's links and tags: "Color…" opens the page color grid at the link, for the
  // page the link goes to. A right-click in the block editor or on selected text keeps the native menu; anywhere else
  // that is not a colorable link or tag, no menu opens (`linkMenuAction`). "On selected text" means the point lies in
  // the selection's own boxes, not merely in an element that holds a selection.
  //
  // When the menu or the picker closes (a pick, Esc, a click outside), the focus goes back to the link. While the
  // picker is open, and while the focus given back is still on the link, the day may be drawn anew (a pick re-sends
  // it, another program edits it): the link is then found again at its place (row, page, index), the picker moves
  // with it, and a replaced focused link hands the focus to the new one. A link that is gone leaves the picker where
  // it is, and closing it leaves the focus on the page.
  import { onDestroy, type Snippet } from 'svelte'
  import type { Action } from 'svelte/action'
  import { ContextMenu, Popover } from 'bits-ui'
  import {
    findSpot,
    linkMenuAction,
    pickingColor,
    pointInBoxes,
    spotOf,
    type Box,
    type LinkSpot,
  } from '../lib/linkColor'
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

  /** The element that holds the links. */
  let zone: HTMLElement | null = null
  /** Where the anchor stands, to find it again when the day is drawn anew. */
  let spot: LinkSpot | null = null
  /** The focus was given back to the anchor: a link drawn anew in its place takes it. */
  let refocus = false
  let observer: MutationObserver | null = null

  /**
   * The picker's anchor: the link's box while it is in the page, else the last box it had, so the picker stays where
   * it is when the link goes.
   */
  const anchorBox = $derived(boxOf(anchor))
  function boxOf(a: HTMLElement | null) {
    if (!a) return null
    let last = new DOMRect()
    return {
      contextElement: a,
      getBoundingClientRect: () => {
        if (a.isConnected) last = a.getBoundingClientRect()
        return last
      },
    }
  }

  function focusLink(a: HTMLElement) {
    a.setAttribute('tabindex', '-1')
    a.focus({ preventScroll: true })
  }

  /** The anchor was replaced: take its new self, and the focus if the old one had it. */
  function follow() {
    if (!zone || !spot || anchor?.isConnected) return
    const found = findSpot(zone, spot)
    if (!found) return
    anchor = found
    if (refocus && (document.activeElement === null || document.activeElement === document.body)) focusLink(found)
  }

  function watch() {
    if (observer || !zone) return
    observer = new MutationObserver(follow)
    observer.observe(zone, { childList: true, subtree: true })
  }

  /** Stops following the link once neither the picker nor a given-back focus needs it. */
  function settle() {
    if (pickerOpen || refocus) return
    observer?.disconnect()
    observer = null
  }

  function onPointerDown() {
    endRefocus()
  }
  function onFocusIn(e: FocusEvent) {
    if (e.target !== anchor) endRefocus()
  }
  function endRefocus() {
    if (!refocus) return
    refocus = false
    document.removeEventListener('pointerdown', onPointerDown, true)
    document.removeEventListener('focusin', onFocusIn, true)
    settle()
  }

  /** The menu or the picker closed: the focus goes back to the link, unless something else took it or it is gone. */
  function giveBack() {
    endRefocus()
    const a = anchor
    const active = document.activeElement
    const elsewhere =
      active && active !== document.body && !active.closest('[data-testid="link-color-menu"], [data-testid="page-color-picker"]')
    if (!a?.isConnected || elsewhere) {
      settle()
      return
    }
    focusLink(a)
    refocus = true
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('focusin', onFocusIn, true)
    watch()
  }

  onDestroy(() => {
    endRefocus()
    observer?.disconnect()
    observer = null
  })

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
    zone = node
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
        spot = a && spotOf(a)
      }
    }
    node.addEventListener('contextmenu', oncontextmenu)
    return {
      destroy: () => {
        node.removeEventListener('contextmenu', oncontextmenu)
        if (zone === node) zone = null
      },
    }
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
        if (!pending) {
          giveBack()
          return
        }
        pending = false
        endRefocus()
        picking = target
        pickerOpen = true
        watch()
        follow()
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
      customAnchor={anchorBox}
      side="bottom"
      align="start"
      sideOffset={4}
      collisionPadding={8}
      onOpenAutoFocus={(e) => e.preventDefault()}
      onCloseAutoFocus={(e) => {
        e.preventDefault()
        giveBack()
      }}
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
