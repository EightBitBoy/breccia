// Zooming the whole app: the steps, the keys, the wheel and the status bar item.
import type { StatusItem } from './status'

/** The zoom levels in percent, as in Chrome. */
export const ZOOM_STEPS = [50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200]
export const ZOOM_DEFAULT = 100

/** The level one step up (`dir` 1) or down (-1); a level between steps goes to the next step that way. */
export function stepZoom(percent: number, dir: 1 | -1): number {
  const next = dir === 1 ? ZOOM_STEPS.find((s) => s > percent) : [...ZOOM_STEPS].reverse().find((s) => s < percent)
  return next ?? (dir === 1 ? ZOOM_STEPS[ZOOM_STEPS.length - 1] : ZOOM_STEPS[0])
}

/** A stored level: a whole percent within the range, else 100. */
export function parseZoom(v: number | null | undefined): number {
  if (v === null || v === undefined || !Number.isInteger(v)) return ZOOM_DEFAULT
  return v >= ZOOM_STEPS[0] && v <= ZOOM_STEPS[ZOOM_STEPS.length - 1] ? v : ZOOM_DEFAULT
}

export type ZoomAction = 'in' | 'out' | 'reset'

/** What a key press means for the zoom: `Ctrl +`, `Ctrl =`, `Ctrl -` and `Ctrl 0` (`Cmd` on a Mac), or null. */
export function zoomKey(
  e: { key: string; shift: boolean; alt: boolean; ctrl: boolean; meta: boolean },
  mac: boolean,
): ZoomAction | null {
  const mod = mac ? e.meta : e.ctrl
  const other = mac ? e.ctrl : e.meta
  if (!mod || other || e.alt) return null
  if (e.key === '+' || e.key === '=') return 'in'
  if (e.key === '-' || e.key === '_') return 'out'
  if (e.key === '0' && !e.shift) return 'reset'
  return null
}

/** Collects wheel movement into whole steps: about one notch (100 units) is a step; a reversal starts over. */
export class WheelSteps {
  private acc = 0

  /** 1 (zoom in) or -1 (zoom out) when enough has collected, else 0. Wheel up has a negative `deltaY`. */
  add(deltaY: number): 1 | -1 | 0 {
    if (this.acc !== 0 && Math.sign(this.acc) !== Math.sign(deltaY)) this.acc = 0
    this.acc += deltaY
    if (this.acc <= -100) {
      this.acc += 100
      return 1
    }
    if (this.acc >= 100) {
      this.acc -= 100
      return -1
    }
    return 0
  }
}

/** The status bar item while the zoom is not 100 %; a click resets it. */
export function zoomItem(percent: number): StatusItem | null {
  if (percent === ZOOM_DEFAULT) return null
  return {
    id: 'zoom',
    side: 'right',
    order: 30,
    text: `${percent} %`,
    progress: null,
    tone: 'normal',
    action: true,
    tip: 'Zoom: click to go back to 100 %',
  }
}
