import { expect, test } from 'vitest'
import { BOARD_COL_DEFAULT, BOARD_COL_MAX, BOARD_COL_MIN, clampColumn, stepColumn } from './boardWidth'

test('widths are clamped to the limits and rounded; none or garbage is null (fill the window)', () => {
  expect(clampColumn(null)).toBeNull()
  expect(clampColumn(undefined)).toBeNull()
  expect(clampColumn(NaN)).toBeNull()
  expect(clampColumn(10)).toBe(BOARD_COL_MIN)
  expect(clampColumn(5000)).toBe(BOARD_COL_MAX)
  expect(clampColumn(300.4)).toBe(300)
})

test('plus and minus move by one step from the shown width, stopping at the limits', () => {
  expect(stepColumn(300, 1)).toBe(310)
  expect(stepColumn(300, -1)).toBe(290)
  expect(stepColumn(BOARD_COL_MAX, 1)).toBe(BOARD_COL_MAX)
  expect(stepColumn(BOARD_COL_MIN, -1)).toBe(BOARD_COL_MIN)
  // from "fill the window" the first step starts at the default
  expect(stepColumn(null, 1)).toBe(BOARD_COL_DEFAULT + 10)
  expect(stepColumn(null, -1)).toBe(BOARD_COL_DEFAULT - 10)
})
