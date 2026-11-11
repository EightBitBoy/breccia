import { stepTheme, type ThemeChoice } from './theme'
import type { WheelSteps } from './zoom'

/**
 * The theme a wheel event switches to, or null while no whole step has collected. Wheel down (positive `deltaY`) is
 * the next theme in the menu, wheel up the previous. `deltaY` is scaled by the window zoom so a notch is one step.
 */
export function wheelTheme(current: ThemeChoice, steps: WheelSteps, deltaY: number, zoomPercent: number): ThemeChoice | null {
  if (deltaY === 0) return null
  const s = steps.add(Math.round((deltaY * zoomPercent) / 100))
  if (s === 0) return null
  return stepTheme(current, s === -1 ? 1 : -1)
}
