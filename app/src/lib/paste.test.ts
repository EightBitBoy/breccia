import { expect, test } from 'vitest'
import { dropLeadingBom, isOutline, restoreRemoved } from './paste'

test('a byte-order mark at the start of pasted text is dropped, one inside the text stays', () => {
  expect(dropLeadingBom('﻿hello')).toBe('hello')
  expect(dropLeadingBom('a﻿b')).toBe('a﻿b')
  expect(dropLeadingBom('')).toBe('')
  // Only one, the leading one.
  expect(dropLeadingBom('﻿﻿x')).toBe('﻿x')
})

test('text with a bullet line is an outline', () => {
  expect(isOutline('- a\n- b')).toBe(true)
  expect(isOutline('intro\n  - nested')).toBe(true)
  expect(isOutline('a\r\n- b')).toBe(true)
  expect(isOutline('-')).toBe(true)
  expect(isOutline('a\n-\nb')).toBe(true)
})

test('other text is not', () => {
  expect(isOutline('plain text')).toBe(false)
  expect(isOutline('-not a bullet')).toBe(false)
  expect(isOutline('a - b')).toBe(false)
  expect(isOutline('--')).toBe(false)
  expect(isOutline('')).toBe(false)
})

test('a refused paste puts the removed selection back', () => {
  expect(restoreRemoved('a  b', 2, 'XY')).toEqual({ text: 'a XY b', cursor16: 4 })
  expect(restoreRemoved('', 0, 'all')).toEqual({ text: 'all', cursor16: 3 })
  // The text got shorter meanwhile: the slice goes at the end, never lost.
  expect(restoreRemoved('a', 5, 'XY')).toEqual({ text: 'aXY', cursor16: 3 })
  expect(restoreRemoved('ab', 1, '')).toEqual({ text: 'ab', cursor16: 1 })
})
