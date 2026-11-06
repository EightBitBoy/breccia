// When a block's editor closes: a state typed or removed by hand gets the lines a change of state brings
// (`created::`, `done::`). The core writes them; this decides whether to ask.
import type { BlockId, Command } from './types'

/** The keyword `text`'s first line starts with, followed by a space or ending the line (the core's `starts_with_keyword`), or null. */
export function typedState(text: string, keywords: readonly string[]): string | null {
  const first = text.split('\n', 1)[0]
  return keywords.find((k) => k !== '' && first.startsWith(k) && (first.length === k.length || first[k.length] === ' ')) ?? null
}

/**
 * The `block.settle` for block `id` whose editor opened with state `opened` and closes with `text`;
 * null when the state is the same (nothing to add or remove).
 */
export function settleCommand(id: BlockId, opened: string | null, text: string, keywords: readonly string[]): Command | null {
  if (typedState(text, keywords) === opened) return null
  return { type: 'block.settle', id, before: opened }
}
