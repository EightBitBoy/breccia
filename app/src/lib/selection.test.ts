import { expect, test } from 'vitest'
import { extend, neighbour, nextState, selectionAction } from './selection'

test('extend in both directions', () => {
  expect(extend([5, 6, 7, 8], 6, 8)).toEqual([6, 7, 8])
  expect(extend([5, 6, 7, 8], 7, 5)).toEqual([5, 6, 7])
  expect(extend([5, 6, 7, 8], 6, 6)).toEqual([6])
})

test('extend with an id that is not visible gives nothing', () => {
  expect(extend([5, 6], 9, 5)).toEqual([])
})

test('neighbour stops at the ends', () => {
  expect(neighbour([5, 6, 7], 6, 1)).toBe(7)
  expect(neighbour([5, 6, 7], 6, -1)).toBe(5)
  expect(neighbour([5, 6, 7], 7, 1)).toBe(7)
  expect(neighbour([5, 6, 7], 5, -1)).toBe(5)
  expect(neighbour([5, 6, 7], 9, 1)).toBe(9)
})

const st = (keyword: string, inCycle = true) => ({ keyword, inCycle })
const states = [st('TODO'), st('DOING'), st('WAITING', false), st('DONE'), st('CANCELED', false)]

test('next state walks the cycle like Config::cycle_next', () => {
  expect(nextState(states, null)).toBe('TODO')
  expect(nextState(states, 'TODO')).toBe('DOING')
  // A state out of the cycle continues from where it stands.
  expect(nextState(states, 'DOING')).toBe('DONE')
  expect(nextState(states, 'WAITING')).toBe('DONE')
  // After the last one the cycle starts again at the first; an unknown keyword starts at the first.
  expect(nextState(states, 'DONE')).toBe('TODO')
  expect(nextState(states, 'CANCELED')).toBe('TODO')
  expect(nextState(states, 'NOPE')).toBe('TODO')
  // Only with no state in the cycle is there none.
  expect(nextState([st('LATER', false)], null)).toBeNull()
  expect(nextState([st('LATER', false)], 'LATER')).toBeNull()
})

const key = (k: string, m: Partial<{ shift: boolean; alt: boolean; ctrl: boolean; meta: boolean }> = {}) => ({
  key: k,
  shift: false,
  alt: false,
  ctrl: false,
  meta: false,
  ...m,
})

test('keys in selection mode', () => {
  const pc = (k: string, m = {}) => selectionAction(key(k, m), false)
  expect(pc('ArrowUp', { shift: true })).toBe('extendUp')
  expect(pc('ArrowDown', { shift: true })).toBe('extendDown')
  expect(pc('Tab')).toBe('indent')
  expect(pc('Tab', { shift: true })).toBe('outdent')
  expect(pc('ArrowUp', { alt: true })).toBe('moveUp')
  expect(pc('ArrowDown', { alt: true })).toBe('moveDown')
  expect(pc('Backspace')).toBe('delete')
  expect(pc('Delete')).toBe('delete')
  expect(pc('Enter', { ctrl: true })).toBe('cycleState')
  expect(pc('z', { ctrl: true })).toBe('undo')
  expect(pc('Z', { ctrl: true, shift: true })).toBe('redo')
  expect(pc('y', { ctrl: true })).toBe('redo')
  expect(pc('Escape')).toBe('clear')
  expect(pc('ArrowDown')).toBeNull()
  expect(pc('a')).toBeNull()
  expect(pc('Enter')).toBeNull()
  expect(pc('Enter', { meta: true })).toBeNull()
  expect(selectionAction(key('Enter', { meta: true }), true)).toBe('cycleState')
  expect(selectionAction(key('z', { ctrl: true }), true)).toBeNull()
})

test('mod shift enter removes the state of selected blocks', () => {
  expect(selectionAction(key('Enter', { ctrl: true, shift: true }), false)).toBe('removeState')
  expect(selectionAction(key('Enter', { meta: true, shift: true }), true)).toBe('removeState')
  expect(selectionAction(key('Enter', { ctrl: true, shift: true, alt: true }), false)).toBeNull()
})

test('Ctrl Shift K deletes the selected blocks', () => {
  expect(selectionAction(key('K', { ctrl: true, shift: true }), false)).toBe('delete')
  expect(selectionAction(key('K', { meta: true, shift: true }), true)).toBe('delete')
  expect(selectionAction(key('k', { ctrl: true }), false)).toBeNull()
  expect(selectionAction(key('K', { ctrl: true, shift: true, alt: true }), false)).toBeNull()
})
