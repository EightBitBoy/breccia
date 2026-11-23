import { expect, test } from 'vitest'
import { colorTarget, linkMenuAction, pickingColor, pointInBoxes, taskOf } from './linkColor'
import type { BlockView, TargetView } from './types'

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
  expect(linkMenuAction({ inEditor: true, onSelection: false, anchor, task: null }, targets)).toEqual({ kind: 'native' })
})

test('a right-click on a colorable link opens the menu, even inside a selection', () => {
  const anchor = { className: 'tag', dataPage: 'garden' }
  expect(linkMenuAction({ inEditor: false, onSelection: true, anchor, task: null }, targets)).toEqual({
    kind: 'menu',
    target: targets[2],
  })
})

test('a right-click on selected text keeps the native menu', () => {
  expect(linkMenuAction({ inEditor: false, onSelection: true, anchor: null, task: null }, targets)).toEqual({ kind: 'native' })
})

test('a right-click elsewhere shows no menu at all', () => {
  expect(linkMenuAction({ inEditor: false, onSelection: false, anchor: null, task: null }, targets)).toEqual({ kind: 'none' })
  const missing = { className: 'link', dataPage: 'missing' }
  expect(linkMenuAction({ inEditor: false, onSelection: false, anchor: missing, task: null }, targets)).toEqual({ kind: 'none' })
})

test('a point inside a box is in the boxes', () => {
  expect(pointInBoxes(5, 5, [{ left: 0, top: 0, right: 10, bottom: 10 }])).toBe(true)
})

test('a point on a box edge is in the boxes', () => {
  expect(pointInBoxes(10, 10, [{ left: 0, top: 0, right: 10, bottom: 10 }])).toBe(true)
  expect(pointInBoxes(0, 0, [{ left: 0, top: 0, right: 10, bottom: 10 }])).toBe(true)
})

test('a point beside every box, or with no boxes, is not in them', () => {
  expect(pointInBoxes(11, 5, [{ left: 0, top: 0, right: 10, bottom: 10 }])).toBe(false)
  expect(pointInBoxes(5, -1, [{ left: 0, top: 0, right: 10, bottom: 10 }])).toBe(false)
  expect(pointInBoxes(5, 5, [])).toBe(false)
})

test('a point in the second of two boxes is in the boxes', () => {
  const boxes = [
    { left: 0, top: 0, right: 10, bottom: 10 },
    { left: 20, top: 20, right: 30, bottom: 30 },
  ]
  expect(pointInBoxes(25, 25, boxes)).toBe(true)
  expect(pointInBoxes(15, 15, boxes)).toBe(false)
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

test('a right-click on a web address opens the menu with its address to copy, even inside a selection', () => {
  const web = { className: 'ext', dataPage: null, href: 'https://x.com/a?b=1&c=2' }
  expect(linkMenuAction({ inEditor: false, onSelection: true, anchor: web, task: null }, targets)).toEqual({
    kind: 'copy',
    url: 'https://x.com/a?b=1&c=2',
  })
  const mail = { className: 'ext', dataPage: null, href: 'mailto:me@x.com' }
  expect(linkMenuAction({ inEditor: false, onSelection: false, anchor: mail, task: null }, targets)).toEqual({
    kind: 'copy',
    url: 'me@x.com',
  })
})

test('a web address in the block editor keeps the native menu', () => {
  const web = { className: 'ext', dataPage: null, href: 'https://x.com/a' }
  expect(linkMenuAction({ inEditor: true, onSelection: false, anchor: web, task: null }, targets)).toEqual({ kind: 'native' })
})

const task = { id: 7, due: '2026-11-30' }

test('a right-click on a task row away from its links opens the task menu', () => {
  expect(linkMenuAction({ inEditor: false, onSelection: false, anchor: null, task }, targets)).toEqual({
    kind: 'task',
    id: 7,
    due: '2026-11-30',
  })
  const none = { id: 8, due: null }
  expect(linkMenuAction({ inEditor: false, onSelection: false, anchor: null, task: none }, targets)).toEqual({
    kind: 'task',
    id: 8,
    due: null,
  })
})

test('a link or tag in a task row keeps its own menu', () => {
  const tag = { className: 'tag', dataPage: 'garden' }
  expect(linkMenuAction({ inEditor: false, onSelection: false, anchor: tag, task }, targets)).toEqual({
    kind: 'menu',
    target: targets[2],
  })
  const web = { className: 'ext', dataPage: null, href: 'https://x.com/a' }
  expect(linkMenuAction({ inEditor: false, onSelection: false, anchor: web, task }, targets)).toEqual({
    kind: 'copy',
    url: 'https://x.com/a',
  })
  const missing = { className: 'link', dataPage: 'missing' }
  expect(linkMenuAction({ inEditor: false, onSelection: false, anchor: missing, task }, targets)).toEqual({ kind: 'none' })
})

test('a task row in the block editor or on selected text keeps the native menu', () => {
  expect(linkMenuAction({ inEditor: true, onSelection: false, anchor: null, task }, targets)).toEqual({ kind: 'native' })
  expect(linkMenuAction({ inEditor: false, onSelection: true, anchor: null, task }, targets)).toEqual({ kind: 'native' })
})

function row(id: number, state: string | null, due?: string): BlockView {
  return { id, depth: 0, text: '', html: '', state, finished: false, due, hasChildren: false } as BlockView
}

test('a row is a task when its block has a state, with its due date or none', () => {
  const blocks = [row(1, null), row(2, 'TODO', '2026-12-01'), row(3, 'DONE')]
  expect(taskOf(2, blocks)).toEqual({ id: 2, due: '2026-12-01' })
  expect(taskOf(3, blocks)).toEqual({ id: 3, due: null })
})

test('a row that is not a task, or not among the blocks, gives no task', () => {
  const blocks = [row(1, null), row(2, 'TODO')]
  expect(taskOf(1, blocks)).toBeNull()
  expect(taskOf(9, blocks)).toBeNull()
})
