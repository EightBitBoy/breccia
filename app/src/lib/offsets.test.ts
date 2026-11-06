import { expect, test } from 'vitest'
import { utf16ToUtf8, utf8ToUtf16 } from './offsets'

test('offsets', () => {
  const t = '😀x ä'
  expect(utf16ToUtf8(t, 2)).toBe(4)
  expect(utf16ToUtf8(t, 5)).toBe(8)
  expect(utf8ToUtf16(t, 4)).toBe(2)
  expect(utf8ToUtf16(t, 8)).toBe(5)
  expect(utf16ToUtf8('abc', 3)).toBe(3)
})

test('lone surrogates, mid-pair offsets and positions past the end', () => {
  expect(utf16ToUtf8('\ud83d', 1)).toBe(3)
  expect(utf16ToUtf8('😀x', 1)).toBe(4)
  expect(utf8ToUtf16('😀x', 2)).toBe(2)
  expect(utf16ToUtf8('ab', 9)).toBe(2)
  expect(utf8ToUtf16('ab', 9)).toBe(2)
})
