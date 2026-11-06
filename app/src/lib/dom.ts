// The document listeners: every anchor click is ours, presses outside the editor leave it.

/** Registers the listeners; returns the remover. */
export function installDom(h: {
  click(e: MouseEvent): void
  pointerDown(e: MouseEvent): void
  key(e: KeyboardEvent): void
  /** Keys before anyone else (the editor included) sees them: `Ctrl K`. */
  keyCapture(e: KeyboardEvent): void
  scroll(): void
}): () => void {
  document.addEventListener('click', h.click, true)
  document.addEventListener('auxclick', h.click, true)
  document.addEventListener('mousedown', h.pointerDown, true)
  document.addEventListener('keydown', h.key)
  document.addEventListener('keydown', h.keyCapture, true)
  document.addEventListener('scroll', h.scroll, true)
  return () => {
    document.removeEventListener('click', h.click, true)
    document.removeEventListener('auxclick', h.click, true)
    document.removeEventListener('mousedown', h.pointerDown, true)
    document.removeEventListener('keydown', h.key)
    document.removeEventListener('keydown', h.keyCapture, true)
    document.removeEventListener('scroll', h.scroll, true)
  }
}
