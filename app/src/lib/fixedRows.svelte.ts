// A virtualised list of rows that are all the same height, inside a scroller that also holds other content above
// the rows (a title, a filter bar, a table header). Only the rows on screen, and `overscan` more on each side, are
// drawn. Used by All pages, the Git history and the Archive; the journal feed measures its rows and keeps its own.
// The search dialog keeps its own too: it scrolls its own list, with nothing above the rows.
import { Virtualizer, elementScroll, observeElementOffset, observeElementRect, type VirtualItem } from '@tanstack/virtual-core'

export interface FixedRowsOptions<T> {
  /** The element that scrolls (`.main`). */
  scroller: () => HTMLElement
  /** The rows to show; read inside an effect, so a change draws again. */
  rows: () => T[]
  /** A row's stable key, so a row keeps its element when rows are added above it. */
  key: (row: T, i: number) => string | number
  /** Every row is this tall in px (the CSS agrees), so nothing is measured. */
  rowHeight: number
  /** Rows drawn beyond each edge of the screen; 10 when left out. */
  overscan?: number
  /** The element that holds the rows (its height is `height`). */
  rowsEl: () => HTMLElement | undefined
  /** The block above the rows; when it changes size, where the rows start is measured again. */
  headEl: () => HTMLElement | undefined
}

export interface FixedRows {
  /** The rows to draw; `start - margin` is a row's offset inside the rows element. */
  readonly items: VirtualItem[]
  /** The height of every row together. */
  readonly height: number
  /** Where the rows start inside the scroller's content. */
  readonly margin: number
  /** Scrolls the scroller so that row `i` is on screen. */
  scrollToIndex(i: number): void
}

/** Call during a component's set-up: the effects live as long as the component. */
export function fixedRows<T>(opts: FixedRowsOptions<T>): FixedRows {
  let items = $state<VirtualItem[]>([])
  let height = $state(0)
  let margin = $state(0)

  function options(count: number, scrollMargin: number) {
    return {
      count,
      getItemKey: (i: number) => {
        const row = opts.rows()[i]
        return row === undefined ? i : opts.key(row, i)
      },
      estimateSize: () => opts.rowHeight,
      overscan: opts.overscan ?? 10,
      scrollMargin,
      getScrollElement: opts.scroller,
      scrollToFn: elementScroll,
      observeElementRect,
      observeElementOffset,
      onChange: (v: Virtualizer<HTMLElement, HTMLElement>) => {
        items = [...v.getVirtualItems()]
        height = v.getTotalSize()
      },
    }
  }

  const virtualizer = new Virtualizer<HTMLElement, HTMLElement>(options(0, 0))

  // The rows' offset in the scroller's content: the padding and everything above the rows.
  // Measured again when the block above changes size (a theme or font change, a narrow window, a message line).
  $effect(() => {
    const rowsEl = opts.rowsEl()
    const headEl = opts.headEl()
    if (!rowsEl || !headEl) return
    const scroller = opts.scroller()
    const read = () => {
      const r = rowsEl.getBoundingClientRect().top - scroller.getBoundingClientRect().top
      margin = Math.round(r + scroller.scrollTop)
    }
    read()
    const ro = new ResizeObserver(read)
    ro.observe(headEl)
    return () => ro.disconnect()
  })

  $effect(() => virtualizer._didMount())

  $effect(() => {
    virtualizer.setOptions(options(opts.rows().length, margin))
    virtualizer._willUpdate()
    items = [...virtualizer.getVirtualItems()]
    height = virtualizer.getTotalSize()
  })

  return {
    get items() {
      return items
    },
    get height() {
      return height
    },
    get margin() {
      return margin
    },
    scrollToIndex(i: number) {
      virtualizer.scrollToIndex(i)
    },
  }
}
