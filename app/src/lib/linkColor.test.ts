import { expect, test } from 'vitest'
import { colorTarget, linkMenuAction, pickingColor } from './linkColor'
import type { TargetView } from './types'

const targets: TargetView[] = [
  { raw: 'hiring', kind: 'link', key: 'hiring', name: 'Hiring', color: 'blue' },
  { raw: 'k8s', kind: 'tag', key: 'kubernetes', name: 'Kubernetes', color: 'teal' },
  { raw: 'garden', kind: 'tag', key: 'garden', name: 'garden' },
]

test('a link anchor finds its link entry', () => {
  expect(colorTarget({ className: 'link', dataPage: 'hiring' }, targets)).toBe(targets[0])
})

test('a tag anchor finds its tag entry', () => {
  expect(colorTarget({ className: 'tag', dataPage: 'k8s' }, targets)).toBe(targets[1])
})

test('a link anchor never takes a tag entry of the same key', () => {
  expect(colorTarget({ className: 'link', dataPage: 'k8s' }, targets)).toBeNull()
  expect(colorTarget({ className: 'tag', dataPage: 'hiring' }, targets)).toBeNull()
})

test('external links, unknown keys and anchors without a key give nothing', () => {
  expect(colorTarget({ className: 'ext', dataPage: 'hiring' }, targets)).toBeNull()
  expect(colorTarget({ className: 'link', dataPage: 'missing' }, targets)).toBeNull()
  expect(colorTarget({ className: 'link', dataPage: null }, targets)).toBeNull()
  expect(colorTarget({ className: '', dataPage: 'hiring' }, targets)).toBeNull()
})

test('a right-click in the block editor keeps the native menu', () => {
  const anchor = { className: 'link', dataPage: 'hiring' }
  expect(linkMenuAction({ inEditor: true, onSelection: false, anchor }, targets)).toEqual({ kind: 'native' })
})

test('a right-click on a colorable link opens the menu, even inside a selection', () => {
  const anchor = { className: 'tag', dataPage: 'garden' }
  expect(linkMenuAction({ inEditor: false, onSelection: true, anchor }, targets)).toEqual({
    kind: 'menu',
    target: targets[2],
  })
})

test('a right-click on selected text keeps the native menu', () => {
  expect(linkMenuAction({ inEditor: false, onSelection: true, anchor: null }, targets)).toEqual({ kind: 'native' })
})

test('a right-click elsewhere shows no menu at all', () => {
  expect(linkMenuAction({ inEditor: false, onSelection: false, anchor: null }, targets)).toEqual({ kind: 'none' })
  const missing = { className: 'link', dataPage: 'missing' }
  expect(linkMenuAction({ inEditor: false, onSelection: false, anchor: missing }, targets)).toEqual({ kind: 'none' })
})

test('the open picker marks the color the list holds now for its page', () => {
  const picking = targets[0]
  expect(pickingColor(targets, picking)).toBe('blue')
  const saved = targets.map((t) => (t.key === 'hiring' ? { ...t, color: 'hue 212' } : t))
  expect(pickingColor(saved, picking)).toBe('hue 212')
  const removed = targets.map((t) => (t.key === 'hiring' ? { ...t, color: undefined } : t))
  expect(pickingColor(removed, picking)).toBeNull()
})

test('a page the list no longer holds keeps the color it had when the picker opened', () => {
  expect(pickingColor([], targets[1])).toBe('teal')
  expect(pickingColor([], targets[2])).toBeNull()
})
