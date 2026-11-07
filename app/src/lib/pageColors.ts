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

/** The picker index of the custom part (the hue slider), after "No color". */
export const CUSTOM = NO_COLOR + 1

/** The hue the slider starts on when the page has no custom color yet. */
export const DEFAULT_HUE = 200

const COLUMNS = 5
const MAX_HUE = 359

/** The hue of a custom color as the core writes it (`hue 212`), else null. */
export function parseHue(color: string | null): number | null {
  const m = color === null ? null : /^hue (0|[1-9]\d{0,2})$/.exec(color)
  if (m === null) return null
  const h = Number(m[1])
  return h <= MAX_HUE ? h : null
}

/** The color string for a custom hue. */
export function hueColor(h: number): string {
  return `hue ${h}`
}

/** `crimson` becomes `Crimson`; `hue 212` becomes `Custom (hue 212)`; no color becomes `No color`. */
export function colorLabel(name: string | null): string {
  if (name === null) return 'No color'
  if (parseHue(name) !== null) return `Custom (${name})`
  return name.charAt(0).toUpperCase() + name.slice(1)
}

/** The picker index to focus first: the current color's (a hue gives the custom part), else "No color". */
export function pickerStart(color: string | null): number {
  if (parseHue(color) !== null) return CUSTOM
  const i = color === null ? -1 : PAGE_COLORS.indexOf(color)
  return i < 0 ? NO_COLOR : i
}

/** The color a picker index stands for: a name, a hue for the custom part, null for "No color". */
export function indexColor(i: number, hue: number): string | null {
  if (i === CUSTOM) return hueColor(hue)
  return i < NO_COLOR ? PAGE_COLORS[i] : null
}

/** The color the picker previews: the index under the pointer, else the focused one (`hue` for the custom part). */
export function previewColor(hover: number | null, focused: number, hue: number): string | null {
  return indexColor(hover ?? focused, hue)
}

/** The hue under a pointer at `x` on a slider `width` wide. */
export function hueAt(x: number, width: number): number {
  if (width <= 0) return 0
  return Math.min(MAX_HUE, Math.max(0, Math.round((x / width) * MAX_HUE)))
}

/** What a key press on the hue slider does: the new hue, `'save'`, `'leave'` (Tab), or null. */
export function hueSliderKey(e: KeyInput, hue: number): number | 'save' | 'leave' | null {
  if (e.ctrl || e.meta || e.alt) return null
  if (e.key === 'Tab') return 'leave'
  if (e.shift) return null
  const move = (by: number) => Math.min(MAX_HUE, Math.max(0, hue + by))
  switch (e.key) {
    case 'ArrowLeft':
    case 'ArrowDown':
      return move(-1)
    case 'ArrowRight':
    case 'ArrowUp':
      return move(1)
    case 'PageDown':
      return move(-10)
    case 'PageUp':
      return move(10)
    case 'Home':
      return 0
    case 'End':
      return MAX_HUE
    case 'Enter':
      return 'save'
    default:
      return null
  }
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
      if (at === NO_COLOR) return CUSTOM
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
  const washed = (i: number) =>
    i >= 0 && i < rows.length && rows[i].topic !== undefined && rows[i].color !== undefined
  const same = (i: number, j: number) => washed(i) && washed(j) && rows[i].topic === rows[j].topic
  return rows.map((row, i) => {
    if (!washed(i)) return null
    const top = !same(i - 1, i)
    return { color: row.color as string, top, bottom: !same(i, i + 1), gap: top && washed(i - 1) }
  })
}
