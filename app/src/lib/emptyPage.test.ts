import { expect, test } from 'vitest'
import { emptyPageText } from './emptyPage'

test('a page with a file but no blocks says it is empty', () => {
  expect(emptyPageText(true)).toBe('💡 Empty page. Start writing…')
})

test('a page without a file says that typing creates it', () => {
  expect(emptyPageText(false)).toBe('💡 No file exists yet. Start writing to create it…')
})
