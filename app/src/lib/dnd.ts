// Drag and drop over pragmatic-drag-and-drop, for boards and the sidebar's page tree.
// Boards: cards are draggable, columns
// are drop targets, and one monitor reports every drop with the card the pointer
// is above (the place in the column). DOM glue, no unit test; the
// decisions are `dropBefore` and `placeCommand` in board.ts.
import type { Action } from 'svelte/action'
import {
  draggable,
  dropTargetForElements,
  monitorForElements,
} from '@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter'
import { dropBefore, type CardBox } from './board'
import { canDrag, canDrop, hoverOpen, PAGES, receiver, TREE, treeData, type Over } from './treeDrop'
import type { Row } from './treeRows'
import type { BlockId, TreeView } from './types'

interface CardData {
  id: BlockId
  state: string
}

const CARD = 'breccia-card'

function cardData(data: Record<string | symbol, unknown>): CardData | null {
  return data[CARD] === true && typeof data.id === 'number' && typeof data.state === 'string'
    ? { id: data.id, state: data.state }
    : null
}

/** Makes a card draggable while `p.disabled` is false (an open card is not draggable). */
export const cardDrag: Action<HTMLElement, { id: BlockId; state: string; disabled: boolean }> = (el, param) => {
  let p = param
  const stop = draggable({
    element: el,
    canDrag: () => !p.disabled,
    getInitialData: () => ({ [CARD]: true, id: p.id, state: p.state }),
    onDragStart: () => el.classList.add('dragging'),
    onDrop: () => el.classList.remove('dragging'),
  })
  return {
    update: (next) => (p = next),
    destroy: stop,
  }
}

/** The column's cards (`[data-card]`) with their edges on screen, top to bottom. */
function boxes(column: Element): CardBox[] {
  return [...column.querySelectorAll<HTMLElement>('[data-card]')].map((c) => {
    const r = c.getBoundingClientRect()
    return { id: Number(c.dataset.card), top: r.top, bottom: r.bottom }
  })
}

/** Shows where a drop lands: a line above card `before`, or at the column's end; none for `undefined`. */
function mark(column: Element, before: BlockId | null | undefined) {
  for (const c of column.querySelectorAll('.drop-before')) c.classList.remove('drop-before')
  column.classList.toggle('drop-end', before === null)
  if (before != null) column.querySelector(`[data-card="${before}"]`)?.classList.add('drop-before')
}

/**
 * Makes a column a drop target (a finished column rejects its own cards). While hovered it has class
 * `drop-over` and marks the place the card would land (`drop-before` on a card, `drop-end` on the column).
 */
export const columnDrop: Action<HTMLElement, { state: string; finished: boolean }> = (el, param) => {
  let p = param
  const before = (source: Record<string | symbol, unknown>, y: number) => {
    const c = cardData(source)
    return c ? dropBefore(boxes(el), c.id, y) : null
  }
  const stop = dropTargetForElements({
    element: el,
    canDrop: ({ source }) => {
      const c = cardData(source.data)
      return c !== null && !(p.finished && c.state === p.state)
    },
    getData: ({ input, source }) => ({ column: p.state, before: before(source.data, input.clientY) }),
    onDragEnter: () => el.classList.add('drop-over'),
    onDrag: ({ self }) => {
      // A finished column takes the card at its own place (by done date): no line.
      if (!p.finished) mark(el, self.data.before as BlockId | null)
    },
    onDragLeave: () => {
      el.classList.remove('drop-over')
      mark(el, undefined)
    },
    onDrop: () => {
      el.classList.remove('drop-over')
      mark(el, undefined)
    },
  })
  return {
    update: (next) => (p = next),
    destroy: () => {
      el.classList.remove('drop-over')
      mark(el, undefined)
      stop()
    },
  }
}

/**
 * Makes a hidden column's marker a drop target: a card dropped on it goes to that state like a drop at the
 * end of its column; `watchPeek` opens the column while a card rests on it. Class `drop-over` while hovered.
 */
export const hiddenDrop: Action<HTMLElement, { state: string; finished: boolean }> = (el, param) => {
  let p = param
  const stop = dropTargetForElements({
    element: el,
    canDrop: ({ source }) => {
      const c = cardData(source.data)
      return c !== null && !(p.finished && c.state === p.state)
    },
    getData: () => ({ column: p.state, before: null, marker: p.state }),
    onDragEnter: () => el.classList.add('drop-over'),
    onDragLeave: () => el.classList.remove('drop-over'),
    onDrop: () => el.classList.remove('drop-over'),
  })
  return {
    update: (next) => (p = next),
    destroy: () => {
      el.classList.remove('drop-over')
      stop()
    },
  }
}

/**
 * While a card is dragged, `open(state)` once it has rested `delay` ms on the marker of hidden column `state`;
 * `end()` when the drag ends, dropped or not. Returns the stopper.
 */
export function watchPeek(open: (state: string) => void, end: () => void, delay: number): () => void {
  const hover = hoverOpen(open, delay)
  return monitorForElements({
    canMonitor: ({ source }) => cardData(source.data) !== null,
    onDropTargetChange: ({ location }) => {
      const marker = location.current.dropTargets[0]?.data.marker
      if (typeof marker === 'string') hover.enter(marker, true)
      else hover.leave()
    },
    onDrop: () => {
      hover.end()
      end()
    },
  })
}

/** Calls `onDrop` for every card dropped on a column, with the card it landed above (null: at the end); returns the stopper. */
export function watchDrops(onDrop: (card: CardData, target: string, before: BlockId | null) => void): () => void {
  return monitorForElements({
    canMonitor: ({ source }) => cardData(source.data) !== null,
    onDrop: ({ source, location }) => {
      const card = cardData(source.data)
      const data = location.current.dropTargets[0]?.data
      const target = data?.column
      const before = typeof data?.before === 'number' ? data.before : null
      if (card && typeof target === 'string') onDrop(card, target, before)
    },
  })
}

// ---- the sidebar's page tree --------------------------------------------------------------------------------------
// Rows are draggable and are drop targets; so is the "Pages" heading. One monitor shows the highlight on the row
// that receives the drop, opens a collapsed folder the pointer stays on, and reports the drop. The decisions are
// in treeDrop.ts.

/** Makes a tree row draggable while `canDrag(row)` (pages and folders); class `dragging` while it is dragged. */
export const treeDrag: Action<HTMLElement, Row> = (el, param) => {
  let row = param
  // A row's kind never changes (its id starts with it): journals and their days are never draggable.
  if (!canDrag(row)) return {}
  const stop = draggable({
    element: el,
    canDrag: () => canDrag(row),
    getInitialData: () => ({ [TREE]: true, id: row.id }),
    onDragStart: () => el.classList.add('dragging'),
    onDrop: () => el.classList.remove('dragging'),
  })
  return {
    update: (next) => (row = next),
    destroy: () => {
      el.classList.remove('dragging')
      stop()
    },
  }
}

/** What the tree's drop targets need to know about the drag: the tree, and the row a drag's id names. */
export interface TreeDropEnv {
  tree(): TreeView | null
  row(id: string): Row | null
}

/** Makes a tree row, or the "Pages" heading (`PAGES`), a drop target for the rows that can go there. */
export const treeDrop: Action<HTMLElement, { over: Over; env: TreeDropEnv }> = (el, param) => {
  let p = param
  // Only page and folder rows (and the heading) take drops; the Journals rows never do.
  if (p.over !== PAGES && !canDrag(p.over)) return {}
  const stop = dropTargetForElements({
    element: el,
    canDrop: ({ source }) => {
      const id = treeData(source.data)
      const tree = p.env.tree()
      const dragged = id === null ? null : p.env.row(id)
      return tree !== null && dragged !== null && canDrop(tree, dragged, p.over)
    },
    getData: () => ({ [TREE]: true, over: p.over === PAGES ? PAGES : p.over.id }),
  })
  return {
    update: (next) => (p = next),
    destroy: stop,
  }
}

/**
 * Watches the tree's drags: `drop-over` goes on the element `[data-drop="{id}"]` of the row that receives the drop
 * (the folder, or the heading), a collapsed folder opens after 0.7 s, and `onDrop` gets the dragged row and the
 * target. Returns the stopper.
 */
export function watchTreeDrops(
  root: HTMLElement,
  env: TreeDropEnv & { open(id: string): void; onDrop(dragged: Row, over: Over): void },
): () => void {
  const hover = hoverOpen((id) => env.open(id))
  const mark = (id: string | null) => {
    for (const e of root.querySelectorAll('.drop-over')) e.classList.remove('drop-over')
    if (id !== null) root.querySelector(`[data-drop="${CSS.escape(id)}"]`)?.classList.add('drop-over')
  }
  const target = (over: unknown): Over | null => {
    if (over === PAGES) return PAGES
    return typeof over === 'string' ? env.row(over) : null
  }
  return monitorForElements({
    canMonitor: ({ source }) => treeData(source.data) !== null,
    onDropTargetChange: ({ location }) => {
      const over = target(location.current.dropTargets[0]?.data.over)
      const tree = env.tree()
      mark(over && tree ? receiver(tree, over) : null)
      if (over === null || over === PAGES) hover.leave()
      else hover.enter(over.id, over.kind === 'folder' && over.open === false)
    },
    onDrop: ({ source, location }) => {
      mark(null)
      hover.end()
      const id = treeData(source.data)
      const dragged = id === null ? null : env.row(id)
      const over = target(location.current.dropTargets[0]?.data.over)
      if (dragged && over) env.onDrop(dragged, over)
    },
  })
}
