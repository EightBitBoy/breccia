import { expect, test } from 'vitest'
import { answerOf } from './answer'
import { emptyOutput } from './emptyOutput.testing'
import type { UsageView } from './types'

test('answerOf gives the value of an answer of its kind', () => {
  const out = emptyOutput({ answer: { kind: 'reach', value: 3 } })
  expect(answerOf(out, 'reach')).toBe(3)
})

test('answerOf gives the value even when it is falsy', () => {
  const out = emptyOutput({ answer: { kind: 'reach', value: 0 } })
  expect(answerOf(out, 'reach')).toBe(0)
})

test('answerOf gives null for an answer of another kind', () => {
  const out = emptyOutput({ answer: { kind: 'reach', value: 3 } })
  expect(answerOf(out, 'day')).toBeNull()
})

test('answerOf gives null when the command answers nothing', () => {
  expect(answerOf(emptyOutput(), 'reach')).toBeNull()
})

test('answerOf types the value by its kind', () => {
  const out = emptyOutput({ answer: { kind: 'usage', value: { states: [], skipped: 2 } } })
  const usage: UsageView | null = answerOf(out, 'usage')
  expect(usage?.skipped).toBe(2)
  // @ts-expect-error no answer has this kind
  expect(answerOf(out, 'nope')).toBeNull()
})
