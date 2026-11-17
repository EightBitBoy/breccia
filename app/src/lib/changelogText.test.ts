import { expect, test } from 'vitest'
import text from 'virtual:changelog'
import disk from '../../../CHANGELOG.md?raw'
import { bulletCount, versionsOf } from './changelog'

test('the built-in changelog is CHANGELOG.md', () => {
  expect(text).toBe(disk)
  expect(text.startsWith('# Changelog')).toBe(true)
})

// e2e step 134 (app/e2e/smoke.mjs) counts versions and bullets with a copy of these rules; keep the two in step.
test('every "## [" line is a version and every bullet line is counted', () => {
  const lines = disk.split(/\r?\n/)
  expect(versionsOf(disk)).toHaveLength(lines.filter((l) => /^## \[/.test(l)).length)
  expect(versionsOf(disk).length).toBeGreaterThan(0)
  expect(bulletCount(disk)).toBe(lines.filter((l) => /^\s*[-*+]\s/.test(l)).length)
  expect(bulletCount(disk)).toBeGreaterThan(0)
})
