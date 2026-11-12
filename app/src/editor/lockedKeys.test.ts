import { expect, test } from 'vitest'
import { lockedKeyText } from './lockedKeys'

const k = (key: string, mods: Partial<{ shift: boolean; ctrl: boolean; alt: boolean; meta: boolean; altGraph: boolean }> = {}) =>
  lockedKeyText({ key, shift: false, ctrl: false, alt: false, meta: false, altGraph: false, ...mods })

test('a plain character is kept, shifted or not', () => {
  expect(k('a')).toBe('a')
  expect(k('A', { shift: true })).toBe('A')
  expect(k(' ')).toBe(' ')
  expect(k('😀')).toBe('😀')
})

test('AltGr characters are kept (Windows reports Ctrl and Alt)', () => {
  expect(k('@', { ctrl: true, alt: true, altGraph: true })).toBe('@')
})

test('shortcuts and non-text keys are not kept', () => {
  expect(k('z', { ctrl: true })).toBeNull()
  expect(k('k', { meta: true })).toBeNull()
  expect(k('x', { alt: true })).toBeNull()
  expect(k('Enter')).toBeNull()
  expect(k('Backspace')).toBeNull()
  expect(k('ArrowLeft')).toBeNull()
  expect(k('Dead')).toBeNull()
})
