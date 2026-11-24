import { expect, test } from 'vitest'
import { LONG_MONTHS, SHORT_MONTHS } from './months'

test('twelve short and twelve long month names', () => {
  expect(SHORT_MONTHS).toHaveLength(12)
  expect(LONG_MONTHS).toHaveLength(12)
  expect(SHORT_MONTHS[10]).toBe('Nov')
  expect(LONG_MONTHS[1]).toBe('February')
})
