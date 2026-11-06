// Editing the state list in Settings: pure helpers, so the form's decisions can be tested.
import type { Command, StateUsage, StateView } from './types'

/** The state colours, in the core's order. */
export const PALETTE = ['grey', 'amber', 'violet', 'green', 'dim', 'blue', 'red', 'teal'] as const

export function normalizeKeyword(s: string): string {
  return s.trim().toUpperCase()
}

/** Why `k` cannot be the keyword of state `index`, or null. */
export function keywordProblem(k: string, states: StateView[], index: number): string | null {
  if (!/^[A-Z][A-Z0-9_]*$/.test(k)) return 'A keyword starts with a letter A–Z and holds only A–Z, 0–9 and _.'
  if (states.some((s, i) => i !== index && s.keyword === k)) return `There is already a state ${k}.`
  return null
}

/** `NEW`, `NEW2`, `NEW3`, … the first one no state has. */
export function newStateKeyword(states: StateView[]): string {
  const taken = new Set(states.map((s) => s.keyword))
  if (!taken.has('NEW')) return 'NEW'
  for (let n = 2; ; n++) if (!taken.has(`NEW${n}`)) return `NEW${n}`
}

export function addState(states: StateView[]): StateView[] {
  return [...states, { keyword: newStateKeyword(states), color: 'grey', finished: false, inCycle: false }]
}

export function moveState(states: StateView[], i: number, dir: -1 | 1): StateView[] {
  const j = i + dir
  if (i < 0 || i >= states.length || j < 0 || j >= states.length) return states
  const out = [...states]
  const t = out[i]
  out[i] = out[j]
  out[j] = t
  return out
}

export function withState(states: StateView[], i: number, patch: Partial<StateView>): StateView[] {
  return states.map((s, k) => (k === i ? { ...s, ...patch } : s))
}

export function withoutState(states: StateView[], i: number): StateView[] {
  return states.filter((_, k) => k !== i)
}

/**
 * Who uses state `k`: a sentence with the counts, null when none does, or `unknown` when the count has no entry for
 * it (the state came after the count, so it is never taken for unused).
 */
function usedBy(k: string, u: StateUsage | undefined): string | null | 'unknown' {
  if (!u) return 'unknown'
  if (u.blocks === 0) return null
  const n = u.blocks
  const p = u.pages
  return `${n} block${n === 1 ? '' : 's'} in ${p} page${p === 1 ? '' : 's'} ${n === 1 ? 'starts' : 'start'} with ${k}.`
}

/** The sentence for blocks that may use `k` but were not counted. */
const uncounted = (k: string) => `Blocks may start with ${k}; Breccia could not count them.`

/** The confirmation before a rename that rewrites blocks; null when no block uses `from` (a counted 0). */
export function renameQuestion(from: string, to: string, u: StateUsage | undefined): string | null {
  const used = usedBy(from, u)
  if (used === null) return null
  return `Rename ${from} to ${to}? ${used === 'unknown' ? uncounted(from) : used} Breccia changes that word at the start of each of them and nothing else, and boards that show ${from} show ${to}.`
}

/** The confirmation before removing a state that blocks use; null when none does (a counted 0). */
export function removeQuestion(k: string, u: StateUsage | undefined): string | null {
  const used = usedBy(k, u)
  if (used === null) return null
  return `Remove the state ${k}? ${used === 'unknown' ? uncounted(k) : used} Their text stays as it is; ${k} is just no longer a state, so they leave the boards.`
}

export function statesSet(states: StateView[], renames: { from: string; to: string }[], version: number): Command {
  return { type: 'states.set', states, renames, version }
}

/** How many blocks start with a state's keyword, for its row (`no blocks` until it is counted). */
export function usageLabel(u: StateUsage | undefined): string {
  const n = u?.blocks ?? 0
  return n === 0 ? 'no blocks' : `${n} block${n === 1 ? '' : 's'}`
}

/** Appended to the rename question: pages that did not load are neither counted nor renamed. */
export function skippedNote(n: number): string {
  if (n === 0) return ''
  return n === 1
    ? ' 1 page could not be read, so Breccia does not change it.'
    : ` ${n} pages could not be read, so Breccia does not change them.`
}

export type KeywordCommit =
  | { kind: 'none' }
  | { kind: 'problem' }
  | { kind: 'rename'; from: string; to: string; question: string | null; states: StateView[] }

/**
 * `keywordCommit` for the state whose keyword was `from` when the user committed, found again by keyword in the
 * current `states` (a pull or hand edit may have moved or removed it while usage was counted). Gone: nothing.
 */
export function keywordCommitFor(draft: string, from: string, states: StateView[], usage: StateUsage[], skipped: number): KeywordCommit {
  const at = states.findIndex((s) => s.keyword === from)
  return at < 0 ? { kind: 'none' } : keywordCommit(draft, states, at, usage, skipped)
}

/**
 * What committing the typed keyword `draft` of state `i` does: nothing, nothing (it has a problem), or a rename, asked
 * first when blocks use the old keyword. The rename's new list is made now, from the states it was decided on.
 */
export function keywordCommit(draft: string, states: StateView[], i: number, usage: StateUsage[], skipped: number): KeywordCommit {
  const from = states[i]?.keyword
  const to = normalizeKeyword(draft)
  if (from === undefined || to === from) return { kind: 'none' }
  if (keywordProblem(to, states, i) !== null) return { kind: 'problem' }
  const q = renameQuestion(from, to, usage.find((u) => u.keyword === from))
  return { kind: 'rename', from, to, question: q === null ? null : q + skippedNote(skipped), states: withState(states, i, { keyword: to }) }
}

/** Removing state `i`: the list without it, made now, and the question to ask first (null when no block uses it). */
export function removeCommit(states: StateView[], i: number, usage: StateUsage[]): { states: StateView[]; question: string | null } {
  const k = states[i].keyword
  return { states: withoutState(states, i), question: removeQuestion(k, usage.find((u) => u.keyword === k)) }
}
