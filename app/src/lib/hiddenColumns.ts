// Hidden board columns: which columns a board hides, kept on this PC per notes folder and board name.
// Hiding only changes what the board shows; every state stays in use everywhere else.

/** How long a column takes to narrow to its marker. */
export const HIDE_MS = 150
/** How long a dragged card rests on a hidden column's marker before the column opens. */
export const PEEK_MS = 500

/** The hiding time: none when the system asks for reduced motion. */
export function hideDuration(reduced: boolean): number {
  return reduced ? 0 : HIDE_MS
}

/**
 * The board's hidden columns: the saved states it has (unknown ones are ignored). If that is every column, the
 * first one stays visible (a hand-edited file), so a board always shows a column.
 */
export function hiddenOf(saved: readonly string[] | undefined, keywords: readonly string[]): Set<string> {
  const hidden = new Set((saved ?? []).filter((k) => keywords.includes(k)))
  if (keywords.length > 0 && keywords.every((k) => hidden.has(k))) hidden.delete(keywords[0])
  return hidden
}

/** Whether column `keyword` can be hidden: it is shown and is not the last column shown. */
export function canHide(keyword: string, keywords: readonly string[], hidden: ReadonlySet<string>): boolean {
  if (!keywords.includes(keyword) || hidden.has(keyword)) return false
  return keywords.some((k) => k !== keyword && !hidden.has(k))
}

/** The marker's tooltip. */
export function markerTitle(keyword: string, cards: number): string {
  return `${keyword} (${cards} ${cards === 1 ? 'card' : 'cards'}), click to show`
}

/** The saved map of one folder, from the shell: board name to state names; anything else is dropped. */
export function parseHidden(raw: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out
  for (const [board, list] of Object.entries(raw)) {
    if (Array.isArray(list)) out[board] = list.filter((k): k is string => typeof k === 'string')
  }
  return out
}
