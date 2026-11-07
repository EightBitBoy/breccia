import type { KeyInput } from './keys'
import type { BlockView } from './types'

/** The 25 page colors in picker order: five rows of five. */
export const PAGE_COLOR_ROWS: readonly (readonly string[])[] = [
  ['crimson', 'red', 'coral', 'orange', 'amber'],
  ['yellow', 'olive', 'lime', 'green', 'emerald'],
  ['teal', 'cyan', 'sky', 'blue', 'indigo'],
  ['violet', 'purple', 'magenta', 'pink', 'rose'],
  ['brown', 'tan', 'sand', 'slate', 'grey'],
]

export const PAGE_COLORS: readonly string[] = PAGE_COLOR_ROWS.flat()

/** The picker index of "No color", after the 25 swatches. */
export const NO_COLOR = PAGE_COLORS.length

const COLUMNS = 5

/** `crimson` becomes `Crimson`; no color becomes `No color`. */
export function colorLabel(name: string | null): string {
  return name === null ? 'No color' : name.charAt(0).toUpperCase() + name.slice(1)
}

/** The picker index to focus first: the current color's, else "No color". */
export function pickerStart(color: string | null): number {
  const i = color === null ? -1 : PAGE_COLORS.indexOf(color)
  return i < 0 ? NO_COLOR : i
}

/** What a key press on picker index `at` does: the index to move to, `'pick'`, or null. */
export function colorPickerKey(e: KeyInput, at: number): number | 'pick' | null {
  if (e.ctrl || e.meta || e.alt || e.shift) return null
  const onGrid = at < NO_COLOR
  switch (e.key) {
    case 'ArrowLeft':
      return Math.max(0, at - 1)
    case 'ArrowRight':
      return Math.min(NO_COLOR, at + 1)
    case 'ArrowUp':
      return at >= COLUMNS ? at - COLUMNS : at
    case 'ArrowDown':
      return at + COLUMNS >= NO_COLOR ? NO_COLOR : at + COLUMNS
    case 'Home':
      return onGrid ? at - (at % COLUMNS) : at
    case 'End':
      return onGrid ? at - (at % COLUMNS) + COLUMNS - 1 : at
    case 'Enter':
    case ' ':
      return 'pick'
    default:
      return null
  }
}

/** The page-history keys on the focused swatch, the same as in a block editor. */
export function swatchKey(e: KeyInput, mac: boolean): 'undo' | 'redo' | null {
  const mod = mac ? e.meta : e.ctrl
  const other = mac ? e.ctrl : e.meta
  if (!mod || other || e.alt) return null
  const key = e.key.toLowerCase()
  if (key === 'z') return e.shift ? 'redo' : 'undo'
  if (key === 'y' && !e.shift) return 'redo'
  return null
}

export interface RowWash {
  color: string
  /** First row of its blob. */
  top: boolean
  /** Last row of its blob. */
  bottom: boolean
  /** First row of a blob that directly follows another blob. */
  gap: boolean
}

/** Groups journal rows into wash blobs: maximal runs of washed rows with the same topic. */
export function washRows(rows: readonly Pick<BlockView, 'topic' | 'color'>[]): (RowWash | null)[] {
  const washed = (i: number) => i >= 0 && i < rows.length && rows[i].topic !== undefined && rows[i].color !== undefined
  const same = (i: number, j: number) => washed(i) && washed(j) && rows[i].topic === rows[j].topic
  return rows.map((row, i) => {
    if (!washed(i)) return null
    const top = !same(i - 1, i)
    return { color: row.color as string, top, bottom: !same(i, i + 1), gap: top && washed(i - 1) }
  })
}
