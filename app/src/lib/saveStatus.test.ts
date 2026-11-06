import { expect, test } from 'vitest'
import { saveItem } from './saveStatus'

test('nothing is shown without an open folder', () => {
  expect(saveItem({ folder: false, unsaved: false, failed: 0 })).toBeNull()
})

test('everything written shows the calm text', () => {
  expect(saveItem({ folder: true, unsaved: false, failed: 0 })).toMatchObject({ id: 'save', text: 'All changes saved', tone: 'normal' })
})

test('text on its way shows Saving', () => {
  expect(saveItem({ folder: true, unsaved: true, failed: 0 })?.text).toBe('Saving…')
})

test('a failed save is a warning and wins over Saving', () => {
  const i = saveItem({ folder: true, unsaved: true, failed: 2 })
  expect(i).toMatchObject({ text: '2 pages not saved', tone: 'warning' })
  expect(saveItem({ folder: true, unsaved: false, failed: 1 })?.text).toBe('1 page not saved')
})
