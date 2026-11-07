import { describe, expect, test } from 'vitest'
import {
  NO_COLOR,
  PAGE_COLORS,
  PAGE_COLOR_ROWS,
  colorLabel,
  colorPickerKey,
  pickerStart,
  swatchKey,
  washRows,
} from './pageColors'
import appCss from '../styles/app.css?raw'

const k = (key: string, over: Partial<{ shift: boolean; alt: boolean; ctrl: boolean; meta: boolean }> = {}) => ({
  key,
  shift: false,
  alt: false,
  ctrl: false,
  meta: false,
  ...over,
})

test('the 25 colors in five rows', () => {
  expect(PAGE_COLOR_ROWS).toEqual([
    ['crimson', 'red', 'coral', 'orange', 'amber'],
    ['yellow', 'olive', 'lime', 'green', 'emerald'],
    ['teal', 'cyan', 'sky', 'blue', 'indigo'],
    ['violet', 'purple', 'magenta', 'pink', 'rose'],
    ['brown', 'tan', 'sand', 'slate', 'grey'],
  ])
  expect(PAGE_COLORS).toEqual(PAGE_COLOR_ROWS.flat())
  expect(PAGE_COLORS).toHaveLength(25)
  expect(NO_COLOR).toBe(25)
})

test('labels', () => {
  expect(colorLabel('sky')).toBe('Sky')
  expect(colorLabel('crimson')).toBe('Crimson')
  expect(colorLabel(null)).toBe('No color')
})

describe('picker keys', () => {
  test('arrows move, wrapping to the next row, and stop at the ends', () => {
    expect(colorPickerKey(k('ArrowRight'), 0)).toBe(1)
    expect(colorPickerKey(k('ArrowLeft'), 0)).toBe(0)
    expect(colorPickerKey(k('ArrowDown'), 0)).toBe(5)
    expect(colorPickerKey(k('ArrowUp'), 0)).toBe(0)
    expect(colorPickerKey(k('ArrowRight'), 4)).toBe(5)
    expect(colorPickerKey(k('ArrowDown'), 22)).toBe(25)
    expect(colorPickerKey(k('ArrowUp'), 25)).toBe(20)
    expect(colorPickerKey(k('ArrowDown'), 25)).toBe(25)
    expect(colorPickerKey(k('ArrowRight'), 25)).toBe(25)
  })
  test('Home and End go to the row ends', () => {
    expect(colorPickerKey(k('Home'), 7)).toBe(5)
    expect(colorPickerKey(k('End'), 7)).toBe(9)
    expect(colorPickerKey(k('Home'), 25)).toBe(25)
    expect(colorPickerKey(k('End'), 25)).toBe(25)
  })
  test('Enter and Space pick; other keys and modified arrows do nothing', () => {
    expect(colorPickerKey(k('Enter'), 3)).toBe('pick')
    expect(colorPickerKey(k(' '), 3)).toBe('pick')
    expect(colorPickerKey(k('ArrowDown', { ctrl: true }), 3)).toBeNull()
    expect(colorPickerKey(k('a'), 3)).toBeNull()
  })
  test('the picker starts on the current color', () => {
    expect(pickerStart('blue')).toBe(13)
    expect(pickerStart(null)).toBe(25)
    expect(pickerStart('banana')).toBe(25)
  })
})

describe('swatch keys', () => {
  test('Ctrl Z undoes, Ctrl Shift Z and Ctrl Y redo', () => {
    expect(swatchKey(k('z', { ctrl: true }), false)).toBe('undo')
    expect(swatchKey(k('Z', { ctrl: true, shift: true }), false)).toBe('redo')
    expect(swatchKey(k('y', { ctrl: true }), false)).toBe('redo')
  })
  test('on a Mac Cmd is the modifier and Ctrl does nothing', () => {
    expect(swatchKey(k('z', { meta: true }), true)).toBe('undo')
    expect(swatchKey(k('Z', { meta: true, shift: true }), true)).toBe('redo')
    expect(swatchKey(k('y', { meta: true }), true)).toBe('redo')
    expect(swatchKey(k('z', { ctrl: true }), true)).toBeNull()
  })
  test('a bare Z or an Alt chord does nothing', () => {
    expect(swatchKey(k('z'), false)).toBeNull()
    expect(swatchKey(k('z', { ctrl: true, alt: true }), false)).toBeNull()
  })
})

describe('washRows', () => {
  const r = (topic?: string, color?: string) => ({ topic, color })
  const plain = { top: true, bottom: true, gap: false }
  test('plain rows have no wash', () => {
    expect(washRows([r(), r(), r()])).toEqual([null, null, null])
  })
  test('a run of one page is one blob', () => {
    expect(washRows([r('p', 'red'), r('p', 'red'), r('p', 'red')])).toEqual([
      { color: 'red', top: true, bottom: false, gap: false },
      { color: 'red', top: false, bottom: false, gap: false },
      { color: 'red', top: false, bottom: true, gap: false },
    ])
  })
  test('a plain row splits blobs without a gap', () => {
    expect(washRows([r('p', 'red'), r(), r('p', 'red')])).toEqual([
      { color: 'red', ...plain },
      null,
      { color: 'red', ...plain },
    ])
  })
  test('different pages are separate blobs with a gap, even in equal colors', () => {
    expect(washRows([r('p', 'red'), r('q', 'red')])).toEqual([
      { color: 'red', ...plain },
      { color: 'red', top: true, bottom: true, gap: true },
    ])
  })
  test('a new blob after another has a gap on its first row only', () => {
    expect(washRows([r('p', 'red'), r('q', 'blue'), r('q', 'blue')])).toEqual([
      { color: 'red', ...plain },
      { color: 'blue', top: true, bottom: false, gap: true },
      { color: 'blue', top: false, bottom: true, gap: false },
    ])
  })
  test('a topic without a color is not washed', () => {
    expect(washRows([r('p')])).toEqual([null])
  })
})

test('a selected row shows its selection over a wash', () => {
  // Same specificity, so the rule that comes later wins: every wash rule must come before the selection rule.
  const selection = appCss.indexOf('.block.selected {')
  const washRules = [...appCss.matchAll(/\.block\.wash[\w-]*[^{]*\{/g)]
  expect(selection).toBeGreaterThan(0)
  expect(washRules.map((m) => m[0])).toEqual(
    expect.arrayContaining(['.block.wash {', '.block.wash-top {', '.block.wash-bottom {', '.block.wash-gap {']),
  )
  for (const m of washRules) expect(m.index, m[0]).toBeLessThan(selection)
})
