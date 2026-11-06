/** Whether pasted text holds a bullet line (`- ` after optional indentation, or a lone `-`): the core then splits it into blocks. */
export function isOutline(text: string): boolean {
  return text.split(/\r?\n/).some((l) => /^\s*- /.test(l) || l === '-')
}

/**
 * Puts back the selection a refused paste removed: `slice` goes in at `at`
 * (UTF-16), or at the end if the text is shorter now. The caret follows it.
 */
export function restoreRemoved(text: string, at: number, slice: string): { text: string; cursor16: number } {
  const i = Math.min(at, text.length)
  return { text: text.slice(0, i) + slice + text.slice(i), cursor16: i + slice.length }
}
