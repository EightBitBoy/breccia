// A command's reply holds what it changed (the other fields of `Output`, which every view follows)
// and at most one answer, which only the asker wants. `answerOf` reads the answer of one kind.
import type { Answer, Output } from './types'

/** The value an answer of each kind holds. */
type Values = { [A in Answer as A['kind']]: A['value'] }

/** The value an answer of `kind` holds: `Extract<Answer, { kind: K }>['value']`. */
export type AnswerValue<K extends Answer['kind']> = Values[K]

/** The value of `out`'s answer when it is of `kind`; null for another kind or no answer. */
export function answerOf<K extends Answer['kind']>(out: Output, kind: K): AnswerValue<K> | null {
  // A fake reply in a test may leave the field out: undefined is no answer too.
  const answer: Answer | null | undefined = out.answer
  if (answer === null || answer === undefined || answer.kind !== kind) return null
  return answer.value as AnswerValue<K>
}
