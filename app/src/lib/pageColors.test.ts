import { describe, expect, test } from 'vitest'
import {
  CUSTOM,
  NO_COLOR,
  PAGE_COLORS,
  PAGE_COLOR_ROWS,
  colorLabel,
  colorPickerKey,
  hueAt,
  hueColor,
  hueSliderKey,
  indexColor,
  parseHue,
  pickerStart,
  previewColor,
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
    expect(colorPickerKey(k('ArrowDown'), 25)).toBe(CUSTOM)
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

describe('hues', () => {
  test('parseHue reads only what the core writes', () => {
    expect(parseHue('hue 212')).toBe(212)
    expect(parseHue('hue 0')).toBe(0)
    expect(parseHue('hue 359')).toBe(359)
    for (const bad of ['hue 360', 'hue 07', 'HUE 7', 'red', null]) expect(parseHue(bad)).toBeNull()
  })
  test('labels, start and index colors', () => {
    expect(hueColor(7)).toBe('hue 7')
    expect(colorLabel('hue 212')).toBe('Custom (hue 212)')
    expect(pickerStart('hue 5')).toBe(CUSTOM)
    expect(CUSTOM).toBe(26)
    expect(indexColor(1, 9)).toBe('red')
    expect(indexColor(NO_COLOR, 9)).toBeNull()
    expect(indexColor(CUSTOM, 9)).toBe('hue 9')
  })

  test('the preview shows the index under the pointer, else the focused one', () => {
    expect(previewColor(1, 2, 9)).toBe('red')
    expect(previewColor(null, 2, 9)).toBe('coral')
    expect(previewColor(NO_COLOR, 2, 9)).toBeNull()
    expect(previewColor(null, NO_COLOR, 9)).toBeNull()
    expect(previewColor(CUSTOM, 0, 9)).toBe('hue 9')
    expect(previewColor(null, CUSTOM, 212)).toBe('hue 212')
  })
})

describe('hue slider keys', () => {
  test('arrows by 1, Page keys by 10, Home and End to the ends', () => {
    expect(hueSliderKey(k('ArrowRight'), 100)).toBe(101)
    expect(hueSliderKey(k('ArrowUp'), 100)).toBe(101)
    expect(hueSliderKey(k('ArrowLeft'), 100)).toBe(99)
    expect(hueSliderKey(k('ArrowDown'), 100)).toBe(99)
    expect(hueSliderKey(k('PageUp'), 100)).toBe(110)
    expect(hueSliderKey(k('PageDown'), 100)).toBe(90)
    expect(hueSliderKey(k('Home'), 100)).toBe(0)
    expect(hueSliderKey(k('End'), 100)).toBe(359)
  })
  test('clamped to 0..359', () => {
    expect(hueSliderKey(k('PageUp'), 355)).toBe(359)
    expect(hueSliderKey(k('PageDown'), 3)).toBe(0)
    expect(hueSliderKey(k('ArrowLeft'), 0)).toBe(0)
    expect(hueSliderKey(k('ArrowRight'), 359)).toBe(359)
  })
  test('Enter saves, Tab leaves, the rest does nothing', () => {
    expect(hueSliderKey(k('Enter'), 100)).toBe('save')
    expect(hueSliderKey(k('Tab'), 100)).toBe('leave')
    expect(hueSliderKey(k('Tab', { shift: true }), 100)).toBe('leave')
    expect(hueSliderKey(k('ArrowRight', { ctrl: true }), 100)).toBeNull()
    expect(hueSliderKey(k('ArrowRight', { shift: true }), 100)).toBeNull()
    expect(hueSliderKey(k('a'), 100)).toBeNull()
    expect(hueSliderKey(k(' '), 100)).toBeNull()
  })
})

test('hueAt maps a pointer position to a hue', () => {
  expect(hueAt(0, 100)).toBe(0)
  expect(hueAt(50, 100)).toBe(180)
  expect(hueAt(100, 100)).toBe(359)
  expect(hueAt(-20, 100)).toBe(0)
  expect(hueAt(140, 100)).toBe(359)
  expect(hueAt(10, 0)).toBe(0)
})
