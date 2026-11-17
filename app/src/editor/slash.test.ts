import { expect, test } from 'vitest'
import { slashSource } from './slash'
import type { SlashItem } from '../lib/slash'

const source = slashSource({ states: () => [{ keyword: 'TODO' }], setState: () => {}, pickDate: () => {} })

function item(label: string): SlashItem {
  const found = source.items({ start: 0, end: 1, key: '' }).find((i) => i.label === label)
  if (found === undefined) throw new Error(`no slash item ${label}`)
  return found
}

test('the date items show the calendar icon, a state none', () => {
  expect(source.icon?.(item('Today'))).toBe('calendar')
  expect(source.icon?.(item('Yesterday'))).toBe('calendar')
  expect(source.icon?.(item('Date…'))).toBe('calendar')
  expect(source.icon?.(item('TODO'))).toBeNull()
  expect(source.icon?.(item('Link to page'))).toBeNull()
})
