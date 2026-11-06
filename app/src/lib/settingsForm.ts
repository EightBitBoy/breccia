// Values typed into the Settings forms.
const whole = (v: string, min: number, max: number) => /^\d+$/.test(v.trim()) && Number(v) >= min && Number(v) <= max

export function minutesProblem(v: string): string | null {
  return whole(v, 0, 1440) ? null : 'Enter whole minutes from 0 to 1440.'
}

export function daysProblem(v: string): string | null {
  return whole(v, 1, 3650) ? null : 'Enter whole days from 1 to 3650.'
}

export const CONFIG_NOTE = 'Stored in breccia/config.toml in the notes folder, so every computer that syncs this folder shares it.'

export function zeroNote(kind: 'commit' | 'pull'): string {
  return kind === 'commit'
    ? '0: only when you click the Git item, before a pull and when Breccia closes.'
    : '0: only when Breccia starts and when you click the Git item.'
}

/**
 * A box's text after the file's value changed from `prev` to `next` (both as the box shows them): what is typed stays
 * unless that value itself changed, so a hand edit of another setting never wipes typing.
 */
export function keepDraft(draft: string, prev: string, next: string): string {
  return next === prev ? draft : next
}

/** The keyword boxes after the states changed from `prev` to `next`: each state keeps the text typed into its row, wherever the row is now. */
export function keepDrafts(drafts: string[], prev: string[], next: string[]): string[] {
  return next.map((k) => {
    const j = prev.indexOf(k)
    return j < 0 ? k : (drafts[j] ?? k)
  })
}

/** A box's text once its change is answered: the file's value when the box still holds what was sent, else what was typed meanwhile. */
export function settledDraft(draft: string, sent: string, file: string): string {
  return draft === sent ? file : draft
}

/**
 * The keyword boxes after a rename is cancelled or answered: the rows of the states in `names` show the file's
 * keyword (`keywords`), every other row keeps its typing.
 */
export function settleRows(drafts: string[], keywords: string[], names: string[]): string[] {
  return keywords.map((k, i) => (names.includes(k) ? k : (drafts[i] ?? k)))
}
