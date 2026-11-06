// The zoom level of the window, with what it takes to apply and keep it.
import { ZOOM_DEFAULT, parseZoom, stepZoom } from './zoom'

export class Zoom {
  /** The level in percent. */
  percent = $state(ZOOM_DEFAULT)

  constructor(
    private io: {
      /** Sets the webview's zoom factor (1 is 100 %). */
      apply: (factor: number) => Promise<void>
      /** Keeps the level on this computer. */
      save: (percent: number) => Promise<void>
    },
  ) {}

  /** Takes the stored level at start: applied, not saved again. */
  restore(stored: number | null | undefined): void {
    const p = parseZoom(stored)
    this.percent = p
    if (p !== ZOOM_DEFAULT) this.io.apply(p / 100).catch((e) => console.error('could not restore the zoom', e))
  }

  step(dir: 1 | -1): Promise<void> {
    return this.set(stepZoom(this.percent, dir))
  }

  reset(): Promise<void> {
    return this.set(ZOOM_DEFAULT)
  }

  /** The level shows at once; it goes back when the webview refuses. */
  private async set(p: number): Promise<void> {
    const before = this.percent
    if (p === before) return
    this.percent = p
    try {
      await this.io.apply(p / 100)
    } catch (e) {
      console.error('could not zoom', e)
      this.percent = before
      return
    }
    await this.io.save(p).catch((e) => console.error('could not save the zoom', e))
  }
}
