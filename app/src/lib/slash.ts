export type SlashItem =
  | { kind: 'state'; keyword: string; label: string; color?: string }
  | { kind: 'link'; label: string }
  | { kind: 'date'; label: string }
  | { kind: 'pickdate'; label: string }

/** `start` is in UTF-16 units (a string index). A `/` at the start or after whitespace, then non-whitespace up to the cursor. */
export function slashQuery(before: string): { start: number; query: string } | null {
  const m = /(^|\s)\/(\S*)$/.exec(before)
  if (!m) return null
  return { start: m.index + m[1].length, query: m[2] }
}

function matches(label: string, query: string): boolean {
  const q = query.toLowerCase()
  return label
    .toLowerCase()
    .split(/\s+/)
    .some((w) => w.startsWith(q))
}

export function slashItems(states: { keyword: string; color?: string }[], query: string): SlashItem[] {
  const all: SlashItem[] = [
    ...states.map((s): SlashItem => ({ kind: 'state', keyword: s.keyword, label: s.keyword, color: s.color })),
    { kind: 'link', label: 'Link to page' },
    { kind: 'date', label: "Today's date" },
    { kind: 'pickdate', label: 'Date…' },
  ]
  return all.filter((i) => matches(i.label, query))
}

/**
 * `text` without the `/query` from `start` (the slash) to `end` (the caret),
 * both UTF-16. With `dropSpace`, the one whitespace character before the slash
 * goes too when it is not the first character and nothing follows the query:
 * "TODO later /do" becomes "TODO later". `at` is where the caret goes.
 */
export function removeSlash(text: string, start: number, end: number, dropSpace = true): { text: string; at: number } {
  const from = dropSpace && end === text.length && start >= 2 && /\s/.test(text[start - 1]) ? start - 1 : start
  return { text: text.slice(0, from) + text.slice(end), at: from }
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** The text a non-state item inserts at the caret (local `now`), and the caret offset in it; null for a state. */
export function slashInsert(item: SlashItem, now: Date): { text: string; caret: number } | null {
  switch (item.kind) {
    case 'state':
      return null
    case 'link':
      return { text: '[[]]', caret: 2 }
    case 'date': {
      const text = `[[${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}]]`
      return { text, caret: text.length }
    }
    // The date picker inserts the picked day later; the query goes now.
    case 'pickdate':
      return { text: '', caret: 0 }
  }
}

/**
 * The edit that applies `item` to `doc`, where the `/query` runs from `start`
 * (the slash) to `end` (the caret), both UTF-16: replace `from..to` with
 * `insert` and put the caret at `caret`. Only a state inserts nothing; then the
 * space before the slash goes too, and `setState` names the state. `pickDate` asks for the date picker.
 */
export function slashEdit(
  doc: string,
  start: number,
  end: number,
  item: SlashItem,
  now: Date,
): { from: number; to: number; insert: string; caret: number; setState: string | null; pickDate: boolean } {
  const insert = slashInsert(item, now)
  const { at } = removeSlash(doc, start, end, insert === null)
  return {
    from: at,
    to: end,
    insert: insert?.text ?? '',
    caret: at + (insert?.caret ?? 0),
    setState: item.kind === 'state' ? item.keyword : null,
    pickDate: item.kind === 'pickdate',
  }
}
