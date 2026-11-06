// Scrollbars that show only while the pointer moves over an area or it scrolls.
// The main view and the sidebar's page and tag list use it; the scrollbar keeps its space, only its
// thumb turns transparent (`.autohide` in app.css), so nothing shifts sideways.

/** How long after the last move or scroll (or after the pointer leaves) the scrollbar hides. */
export const SCROLL_FADE_MS = 1000

/** Shown on a poke; hidden once nothing pokes it for `SCROLL_FADE_MS`. */
export class ScrollFade {
  on = false
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly onchange: (on: boolean) => void) {}

  /** The pointer moved over the area, or it scrolled. */
  poke(): void {
    if (!this.on) {
      this.on = true
      this.onchange(true)
    }
    this.wait()
  }

  /** The pointer left the area. */
  leave(): void {
    if (this.on) this.wait()
  }

  stop(): void {
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
  }

  private wait(): void {
    this.stop()
    this.timer = setTimeout(() => {
      this.timer = null
      this.on = false
      this.onchange(false)
    }, SCROLL_FADE_MS)
  }
}

/** Svelte action: `.sb-on` on the element while its scrollbar should show. */
export function autoHideScrollbar(el: HTMLElement) {
  el.classList.add('autohide')
  const fade = new ScrollFade((on) => el.classList.toggle('sb-on', on))
  const poke = () => fade.poke()
  const leave = () => fade.leave()
  el.addEventListener('pointermove', poke, { passive: true })
  el.addEventListener('scroll', poke, { passive: true })
  el.addEventListener('wheel', poke, { passive: true })
  el.addEventListener('pointerleave', leave)
  return {
    destroy() {
      fade.stop()
      el.removeEventListener('pointermove', poke)
      el.removeEventListener('scroll', poke)
      el.removeEventListener('wheel', poke)
      el.removeEventListener('pointerleave', leave)
    },
  }
}
