import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import text from 'virtual:changelog'

test('the built-in changelog is CHANGELOG.md', () => {
  const disk = readFileSync(new URL('../../../CHANGELOG.md', import.meta.url), 'utf8')
  expect(text).toBe(disk)
  expect(text.startsWith('# Changelog')).toBe(true)
})
