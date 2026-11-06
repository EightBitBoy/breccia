// The board's column width: set with the slider and the + and - buttons, kept in the saved layout.
// Null means the columns fill the window (at least 220 px each), which is how a board starts.
export const BOARD_COL_MIN = 160
export const BOARD_COL_MAX = 520
/** What one press of + or - changes. */
export const BOARD_COL_STEP = 10
/** The slider moves in single pixels. */
export const BOARD_COL_SLIDER_STEP = 1
/** Where the first + or - starts from when the columns still fill the window. */
export const BOARD_COL_DEFAULT = 260

/** A width within the limits; a missing or invalid one is null. */
export function clampColumn(w: number | null | undefined): number | null {
  if (w === null || w === undefined || !Number.isFinite(w)) return null
  return Math.min(BOARD_COL_MAX, Math.max(BOARD_COL_MIN, Math.round(w)))
}

/** The width one step wider (`dir` 1) or narrower (-1) than `w`. */
export function stepColumn(w: number | null, dir: 1 | -1): number {
  const next = (w ?? BOARD_COL_DEFAULT) + dir * BOARD_COL_STEP
  return clampColumn(next) ?? BOARD_COL_DEFAULT
}
