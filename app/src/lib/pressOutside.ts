// A press outside a floating panel closes it, decided when the press happens. The due date calendar's library closes
// it 10 ms after a press outside, and only if the pressed element is still in the page: a quick click on a block's
// text replaces that element (the editor opens) within those 10 ms, and the calendar stayed open. Here the document
// hears the press first (capture phase) and closes the panel at once, whatever the press then does.

/**
 * Calls `close` on every `pointerdown` in `doc` whose target is not inside the panel (`inside`), with any button.
 * Returns the function that stops listening.
 */
export function closeOnPressOutside(
  doc: EventTarget,
  inside: (target: EventTarget | null) => boolean,
  close: () => void,
): () => void {
  const onPress = (e: Event) => {
    if (!inside(e.target)) close()
  }
  doc.addEventListener('pointerdown', onPress, true)
  return () => doc.removeEventListener('pointerdown', onPress, true)
}
