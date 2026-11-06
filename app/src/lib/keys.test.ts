import { expect, test } from 'vitest'
import { decide, isDatePickerKey, isHelpKey, isNewPageKey, isSearchKey, isSettingsKey, navKey, type Ctx, type KeyInput } from './keys'

const ctx: Ctx = { atStart: false, selectionEmpty: true, onFirstLine: false, onLastLine: false, mac: false }
const k = (key: string, m: Partial<{ shift: boolean; alt: boolean; ctrl: boolean; meta: boolean }> = {}) => ({
  key,
  shift: false,
  alt: false,
  ctrl: false,
  meta: false,
  ...m,
})

test('enter splits, shift-enter is a newline', () => {
  expect(decide(k('Enter'), ctx)).toBe('split')
  expect(decide(k('Enter', { shift: true }), ctx)).toBeNull()
})

test('arrows only leave the block at its edges', () => {
  expect(decide(k('ArrowUp'), { ...ctx, onFirstLine: true })).toBe('focusPrev')
  expect(decide(k('ArrowUp'), ctx)).toBeNull()
  expect(decide(k('ArrowDown'), { ...ctx, onLastLine: true })).toBe('focusNext')
  expect(decide(k('ArrowDown'), ctx)).toBeNull()
  expect(decide(k('ArrowUp', { shift: true }), { ...ctx, onFirstLine: true })).toBe('extendUp')
  expect(decide(k('ArrowDown', { shift: true }), { ...ctx, onLastLine: true })).toBe('extendDown')
  expect(decide(k('ArrowDown', { shift: true }), ctx)).toBeNull()
})

test('backspace merges only at the start with no selection', () => {
  expect(decide(k('Backspace'), { ...ctx, atStart: true })).toBe('merge')
  expect(decide(k('Backspace'), { ...ctx, atStart: true, selectionEmpty: false })).toBeNull()
  expect(decide(k('Backspace'), ctx)).toBeNull()
})

test('mod keys follow the platform', () => {
  const mac = { ...ctx, mac: true }
  expect(decide(k('z', { ctrl: true }), ctx)).toBe('undo')
  expect(decide(k('z', { meta: true }), ctx)).toBeNull()
  expect(decide(k('z', { meta: true }), mac)).toBe('undo')
  expect(decide(k('z', { ctrl: true }), mac)).toBeNull()
  expect(decide(k('z', { ctrl: true, shift: true }), ctx)).toBe('redo')
  expect(decide(k('y', { ctrl: true }), ctx)).toBe('redo')
  expect(decide(k('Enter', { ctrl: true }), ctx)).toBe('cycleState')
  expect(decide(k('Enter', { meta: true }), mac)).toBe('cycleState')
  expect(decide(k('ArrowUp', { alt: true }), ctx)).toBe('moveUp')
  expect(decide(k('ArrowDown', { alt: true }), ctx)).toBe('moveDown')
  expect(decide(k('Tab'), ctx)).toBe('indent')
  expect(decide(k('Tab', { shift: true }), ctx)).toBe('outdent')
  expect(decide(k('Escape'), ctx)).toBe('leave')
  expect(decide(k('a'), ctx)).toBeNull()
})

test('Ctrl K opens search (Cmd K on a Mac)', () => {
  const key = (over: Partial<KeyInput>) => ({ key: 'k', shift: false, alt: false, ctrl: false, meta: false, ...over })
  expect(isSearchKey(key({ ctrl: true }), false)).toBe(true)
  expect(isSearchKey(key({ ctrl: true, key: 'K' }), false)).toBe(true)
  expect(isSearchKey(key({ meta: true }), true)).toBe(true)
  expect(isSearchKey(key({ meta: true }), false)).toBe(false)
  expect(isSearchKey(key({ ctrl: true, shift: true }), false)).toBe(false)
  expect(isSearchKey(key({}), false)).toBe(false)
})

test('Ctrl , opens Settings (Cmd , on a Mac)', () => {
  const key = (over: Partial<KeyInput>) => ({ key: ',', shift: false, alt: false, ctrl: false, meta: false, ...over })
  expect(isSettingsKey(key({ ctrl: true }), false)).toBe(true)
  expect(isSettingsKey(key({ meta: true }), true)).toBe(true)
  expect(isSettingsKey(key({ meta: true }), false)).toBe(false)
  expect(isSettingsKey(key({ ctrl: true }), true)).toBe(false)
  expect(isSettingsKey(key({ ctrl: true, shift: true }), false)).toBe(false)
  expect(isSettingsKey(key({ ctrl: true, alt: true }), false)).toBe(false)
  expect(isSettingsKey(key({ ctrl: true, key: 'k' }), false)).toBe(false)
})

test('Ctrl N starts a new page (Cmd N on a Mac)', () => {
  const key = (over: Partial<KeyInput>) => ({ key: 'n', shift: false, alt: false, ctrl: false, meta: false, ...over })
  expect(isNewPageKey(key({ ctrl: true }), false)).toBe(true)
  expect(isNewPageKey(key({ ctrl: true, key: 'N' }), false)).toBe(true)
  expect(isNewPageKey(key({ meta: true }), true)).toBe(true)
  expect(isNewPageKey(key({ meta: true }), false)).toBe(false)
  expect(isNewPageKey(key({ ctrl: true, shift: true }), false)).toBe(false)
  expect(isNewPageKey(key({}), false)).toBe(false)
})

test('F1 opens the shortcut list, only on its own', () => {
  const key = (over: Partial<KeyInput>) => ({ key: 'F1', shift: false, alt: false, ctrl: false, meta: false, ...over })
  expect(isHelpKey(key({}))).toBe(true)
  expect(isHelpKey(key({ key: 'F2' }))).toBe(false)
  expect(isHelpKey(key({ shift: true }))).toBe(false)
  expect(isHelpKey(key({ ctrl: true }))).toBe(false)
  expect(isHelpKey(key({ alt: true }))).toBe(false)
  expect(isHelpKey(key({ meta: true }))).toBe(false)
})

test('Ctrl Shift D (Cmd Shift D on a Mac) opens the date picker', () => {
  expect(isDatePickerKey(k('D', { ctrl: true, shift: true }), false)).toBe(true)
  expect(isDatePickerKey(k('d', { ctrl: true, shift: true }), false)).toBe(true)
  expect(isDatePickerKey(k('D', { meta: true, shift: true }), true)).toBe(true)
  expect(isDatePickerKey(k('D', { meta: true, shift: true }), false)).toBe(false)
  expect(isDatePickerKey(k('D', { ctrl: true, shift: true }), true)).toBe(false)
  expect(isDatePickerKey(k('d', { ctrl: true }), false)).toBe(false)
  expect(isDatePickerKey(k('D', { ctrl: true, shift: true, alt: true }), false)).toBe(false)
  expect(isDatePickerKey(k('E', { ctrl: true, shift: true }), false)).toBe(false)
})

test('mod shift enter removes the state; mod backspace stays with the editor', () => {
  const mac = { ...ctx, mac: true }
  expect(decide(k('Enter', { ctrl: true, shift: true }), ctx)).toBe('removeState')
  expect(decide(k('Enter', { meta: true, shift: true }), mac)).toBe('removeState')
  expect(decide(k('Enter', { ctrl: true, shift: true }), mac)).toBeNull()
  expect(decide(k('Enter', { ctrl: true, shift: true, alt: true }), ctx)).toBeNull()
  expect(decide(k('Enter', { ctrl: true }), ctx)).toBe('cycleState')
  expect(decide(k('Backspace', { ctrl: true }), { ...ctx, atStart: true })).toBeNull()
})

test('Alt ← / Alt → go back and forward; Cmd [ / Cmd ] on a Mac', () => {
  expect(navKey(k('ArrowLeft', { alt: true }), false)).toBe('back')
  expect(navKey(k('ArrowRight', { alt: true }), false)).toBe('forward')
  expect(navKey(k('ArrowLeft', { alt: true, shift: true }), false)).toBeNull()
  expect(navKey(k('ArrowLeft', { alt: true, ctrl: true }), false)).toBeNull()
  expect(navKey(k('ArrowLeft'), false)).toBeNull()
  expect(navKey(k('[', { ctrl: true }), false)).toBeNull()
  expect(navKey(k('[', { meta: true }), true)).toBe('back')
  expect(navKey(k(']', { meta: true }), true)).toBe('forward')
  expect(navKey(k('[', { meta: true, shift: true }), true)).toBeNull()
  expect(navKey(k('ArrowLeft', { alt: true }), true)).toBeNull()
})
