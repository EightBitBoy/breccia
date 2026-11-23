<script lang="ts">
  // The right-click menu in a page's or journal day's outline. On a link or tag, "Color…" opens the page color grid
  // at the link, for the page the link goes to. On a web or mail link it holds "Copy link", which puts the link's
  // address on the clipboard. Elsewhere in a task row it holds "Set due date…", which opens the due date calendar
  // (`DuePicker`) at the row; a link or tag in a task row keeps its own menu. A right-click in the block editor or on
  // selected text keeps the native menu; anywhere else, no menu opens (`linkMenuAction`). "On selected text" means
  // the point lies in the selection's own boxes, not merely in an element that holds a selection.
  //
  // When the menu or the picker closes (a pick, Esc, a click outside), the focus goes back to the link. While the
  // picker is open, and while the focus given back is still on the link, the day may be drawn anew (a pick re-sends
  // it, another program edits it): the link is then found again at its place (row, page, index), the picker moves
  // with it, and a replaced focused link hands the focus to the new one. A link that is gone leaves the picker where
  // it is, and closing it leaves the focus on the page. After "Set due date…" the focus goes back where it was before
  // the right-click, and the calendar gives it back there when it closes.
  import { onDestroy, type Snippet } from 'svelte'
  import type { Action } from 'svelte/action'
  import { ContextMenu, Popover } from 'bits-ui'
  import {
    findSpot,
    linkMenuAction,
    pickingColor,
    pointInBoxes,
    spotOf,
    taskOf,
    type Box,
    type LinkSpot,
  } from '../lib/linkColor'
  import type { BlockId, BlockView, TargetView } from '../lib/types'
  import { duePick } from '../lib/duePick.svelte'
  import PageColorGrid from './PageColorGrid.svelte'

  let {
    targets,
    blocks,
    onsetcolor,
    onsetdue,
    children,
  }: {
    /** The day's colorable links and tags (`PageView.targets`). */
    targets: TargetView[]
    /** The outline's blocks, to tell a task row from others (`PageView.blocks`). */
    blocks: BlockView[]
    /** A new color for the page `key`, or null to remove it. */
    onsetcolor: (key: string, color: string | null) => void
    /** A new due date (a day key) for the task `id`, or null to remove it. */
    onsetdue: (id: BlockId, due: string | null) => void
    children: Snippet
  } = $props()

  /** The link the menu was opened on, and its anchor. */
  let target = $state<TargetView | null>(null)
  /** The address "Copy link" copies, when the menu was opened on a web or mail link. */
  let copyUrl = $state<string | null>(null)
  /** The task "Set due date…" is for, when the menu was opened on a task row away from its links. */
  let task = $state<BlockId | null>(null)
  /** The task's row, where the calendar opens. */
  let taskRow: HTMLElement | null = null
  /** Where the focus was before the right-click on a task row; it goes back there before the calendar opens. */
  let taskFocus: HTMLElement | null = null
  /** "Set due date…" was chosen: the calendar opens once the menu has closed, so the menu's focus return cannot take it. */
  let pendingDue = false

  /** Puts `text` on the clipboard; where the clipboard API refuses, the older copy command does it. */
  function copyText(text: string) {
    navigator.clipboard.writeText(text).catch(() => {
      const area = document.createElement('textarea')
      area.value = text
      document.body.append(area)
      area.select()
      document.execCommand('copy')
      area.remove()
    })
  }
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
   * it is when the link goes. The box is first taken when the menu opens, so a link gone before the picker opens
   * still places it at the link.
   */
  let lastBox = new DOMRect()
  const anchorBox = $derived(boxOf(anchor))
  function boxOf(a: HTMLElement | null) {
    if (!a) return null
    return {
      contextElement: a,
      getBoundingClientRect: () => {
        if (a.isConnected) lastBox = a.getBoundingClientRect()
        return lastBox
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

  /**
   * "Set due date…" was chosen and the menu has closed: the focus goes back where it was before the right-click, and
   * the calendar opens at the task's row (found again if the outline was drawn anew) on its due date now.
   */
  function openDue() {
    endRefocus()
    const id = task
    if (id === null) return
    const now = taskOf(id, blocks)
    if (!now) return
    const row = taskRow?.isConnected
      ? taskRow
      : zone?.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(String(id))}"]`)
    if (!row) return
    if (taskFocus?.isConnected) taskFocus.focus({ preventScroll: true })
    const r = (row.querySelector('.content') ?? row).getBoundingClientRect()
    duePick.show(now.due, { left: r.left, top: r.top, right: r.right, bottom: r.bottom }, (due) => onsetdue(id, due))
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
      const a = el?.closest<HTMLElement>('a.link, a.tag, a.ext') ?? null
      const row = el?.closest<HTMLElement>('[data-block-id]') ?? null
      const rowId = Number(row?.getAttribute('data-block-id'))
      const sel = window.getSelection()
      const onSelection = !!el && !!sel && !sel.isCollapsed && pointInBoxes(e.clientX, e.clientY, selectionBoxes(sel))
      const act = linkMenuAction(
        {
          inEditor: !!el?.closest('.editor-slot'),
          onSelection,
          anchor: a && { className: a.className, dataPage: a.getAttribute('data-page'), href: a.getAttribute('href') },
          task: row && Number.isInteger(rowId) ? taskOf(rowId, blocks) : null,
        },
        targets,
      )
      if (act.kind === 'native') {
        e.stopPropagation()
      } else if (act.kind === 'none') {
        e.preventDefault()
      } else {
        target = act.kind === 'menu' ? act.target : null
        copyUrl = act.kind === 'copy' ? act.url : null
        task = act.kind === 'task' ? act.id : null
        taskRow = act.kind === 'task' ? row : null
        const active = document.activeElement
        taskFocus = act.kind === 'task' && active instanceof HTMLElement && active !== document.body ? active : null
        anchor = a
        spot = a && act.kind === 'menu' ? spotOf(a) : null
        if (a) lastBox = a.getBoundingClientRect()
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
        if (pendingDue) {
          pendingDue = false
          openDue()
          return
        }
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
      {#if task !== null}
        <ContextMenu.Item class="menu-item" data-testid="task-due" onSelect={() => (pendingDue = true)}>
          Set due date…
        </ContextMenu.Item>
      {:else if copyUrl !== null}
        {@const url = copyUrl}
        <ContextMenu.Item class="menu-item" data-testid="link-copy" onSelect={() => copyText(url)}>
          Copy link
        </ContextMenu.Item>
      {:else}
        <ContextMenu.Item class="menu-item" data-testid="link-color" onSelect={() => (pending = true)}>
          Color…
        </ContextMenu.Item>
      {/if}
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
