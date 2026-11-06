// Hover during a gesture. Sigma re-resolves the hovered dot after every frame it draws, so while the
// picture pans or zooms, dots stream under a still pointer and each enter or leave would restyle the whole graph. The
// gate holds hovers back while a mouse button is down and until the picture has been still for QUIET_MS, then applies
// the last one once.

/** How long after the last wheel step or camera move the picture counts as still. */
export const QUIET_MS = 150

export class HoverGate {
  private want: string | null = null
  private pending = false
  private down = false
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly apply: (key: string | null) => void) {}

  /** Sigma's enter (a key) or leave (null). */
  hover(key: string | null): void {
    this.want = key
    if (this.busy()) this.pending = true
    else this.apply(key)
  }

  /** A mouse button went down on the picture. */
  press(): void {
    this.down = true
  }

  /** The mouse button came up (anywhere). */
  release(): void {
    this.down = false
    this.settle()
  }

  /** A wheel step or a camera move: the picture is moving for at least QUIET_MS more. */
  moved(): void {
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      this.settle()
    }, QUIET_MS)
  }

  /** Forgets a waiting hover (a new graph was loaded). */
  reset(): void {
    this.pending = false
    this.want = null
  }

  dispose(): void {
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
  }

  private busy(): boolean {
    return this.down || this.timer !== null
  }

  private settle(): void {
    if (this.busy() || !this.pending) return
    this.pending = false
    this.apply(this.want)
  }
}
