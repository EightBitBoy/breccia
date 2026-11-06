import { expect, test } from 'vitest'
import { isNewFolder } from './folder'

test('only a change of generation after the first is a new notes folder', () => {
  expect(isNewFolder(null, 1)).toBe(false) // the first folder: nothing old to forget
  expect(isNewFolder(1, 1)).toBe(false)
  expect(isNewFolder(1, 2)).toBe(true)
  expect(isNewFolder(2, 1)).toBe(true)
})
