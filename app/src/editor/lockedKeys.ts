/** A key event, reduced to what decides whether it types text. */
export interface KeyInfo {
  key: string
  shift: boolean
  ctrl: boolean
  alt: boolean
  meta: boolean
  /** AltGr is held: Windows reports it as Ctrl and Alt together. */
  altGraph: boolean
}

/** The text a key types while the editor is locked, or null for a shortcut or a key that types nothing. */
export function lockedKeyText(e: KeyInfo): string | null {
  if (e.meta || ((e.ctrl || e.alt) && !e.altGraph)) return null
  // One character (a letter, a space, an emoji); names like `Enter` and `Dead` are longer.
  return [...e.key].length === 1 ? e.key : null
}
