import { expect, test } from 'vitest'
import text from 'virtual:changelog'
import disk from '../../../CHANGELOG.md?raw'

test('the built-in changelog is CHANGELOG.md', () => {
  expect(text).toBe(disk)
  expect(text.startsWith('# Changelog')).toBe(true)
})
