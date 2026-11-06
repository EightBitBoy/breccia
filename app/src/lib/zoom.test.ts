import { describe, expect, it } from 'vitest'
import { WheelSteps, ZOOM_STEPS, parseZoom, stepZoom, zoomItem, zoomKey } from './zoom'

const key = (k: string, over: Record<string, boolean> = {}) => ({ key: k, shift: false, alt: false, ctrl: true, meta: false, ...over })

describe('stepZoom', () => {
  it('moves one step like Chrome', () => {
    expect(ZOOM_STEPS).toEqual([50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200])
    expect(stepZoom(100, 1)).toBe(110)
    expect(stepZoom(100, -1)).toBe(90)
    expect(stepZoom(50, -1)).toBe(50)
    expect(stepZoom(200, 1)).toBe(200)
  })
  it('a value between steps goes to the next step in that direction', () => {
    expect(stepZoom(105, 1)).toBe(110)
    expect(stepZoom(105, -1)).toBe(100)
  })
})

describe('parseZoom', () => {
  it('keeps a whole percent in range and rejects anything else as 100', () => {
    expect(parseZoom(125)).toBe(125)
    expect(parseZoom(null)).toBe(100)
    expect(parseZoom(undefined)).toBe(100)
    expect(parseZoom(10)).toBe(100)
    expect(parseZoom(900)).toBe(100)
    expect(parseZoom(Number.NaN)).toBe(100)
    expect(parseZoom(110.5)).toBe(100)
  })
})

describe('zoomKey', () => {
  it('maps plus, equals, minus and 0 with Ctrl', () => {
    expect(zoomKey(key('+'), false)).toBe('in')
    expect(zoomKey(key('='), false)).toBe('in')
    expect(zoomKey(key('+', { shift: true }), false)).toBe('in')
    expect(zoomKey(key('-'), false)).toBe('out')
    expect(zoomKey(key('_', { shift: true }), false)).toBe('out')
    expect(zoomKey(key('0'), false)).toBe('reset')
  })
  it('needs the platform modifier alone', () => {
    expect(zoomKey(key('+', { ctrl: false }), false)).toBeNull()
    expect(zoomKey(key('+', { alt: true }), false)).toBeNull()
    expect(zoomKey(key('0', { shift: true }), false)).toBeNull()
    expect(zoomKey(key('+', { ctrl: false, meta: true }), true)).toBe('in')
    expect(zoomKey(key('+', { meta: true }), true)).toBeNull()
    expect(zoomKey(key('a'), false)).toBeNull()
  })
})

describe('WheelSteps', () => {
  it('turns a notch into a step and a trackpad trickle into steps by total', () => {
    const w = new WheelSteps()
    expect(w.add(-100)).toBe(1)
    expect(w.add(100)).toBe(-1)
    expect(w.add(-30)).toBe(0)
    expect(w.add(-30)).toBe(0)
    expect(w.add(-50)).toBe(1)
  })
  it('a reversal drops what was collected', () => {
    const w = new WheelSteps()
    expect(w.add(-60)).toBe(0)
    expect(w.add(60)).toBe(0)
    expect(w.add(60)).toBe(-1)
  })
})

describe('zoomItem', () => {
  it('shows nothing at 100 % and a button otherwise', () => {
    expect(zoomItem(100)).toBeNull()
    expect(zoomItem(110)).toMatchObject({ id: 'zoom', side: 'right', text: '110 %', action: true })
  })
})
