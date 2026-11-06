import { beforeEach, expect, test } from 'vitest'
import type { BlockView, Command, StateView } from '../lib/types'
import { MultiSelect, type SelectionHost } from './multiSelect.svelte'

function block(id: number, depth: number, state: string | null = null): BlockView {
  return { id, depth, text: `b${id}`, html: '', state, finished: false, hasChildren: false }
}

const [a, b, c] = [1, 2, 3]
const states: StateView[] = [
  { keyword: 'TODO', color: 'grey', finished: false, inCycle: true },
  { keyword: 'DOING', color: 'amber', finished: false, inCycle: true },
  { keyword: 'DONE', color: 'green', finished: true, inCycle: true },
]

let page: { key: string; blocks: BlockView[] }
let editing: boolean
let ran: Command[]
let notes: string[]
let shown: StateView[]
let sel: MultiSelect

function host(): SelectionHost {
  return {
    order: () => page.blocks.map((x) => x.id),
    page: () => page,
    states: () => shown,
    editing: () => editing,
    leave: () => {},
    run: (cmd) => ran.push(cmd),
    notify: (message) => notes.push(message),
  }
}

/** A keydown with the given modifiers; `defaultPrevented` records `preventDefault`. */
function key(k: string, mods: { shift?: boolean; ctrl?: boolean; alt?: boolean } = {}) {
  const e = {
    key: k,
    shiftKey: mods.shift ?? false,
    ctrlKey: mods.ctrl ?? false,
    altKey: mods.alt ?? false,
    metaKey: false,
    isComposing: false,
    defaultPrevented: false,
    preventDefault: () => (e.defaultPrevented = true),
  }
  return e as unknown as KeyboardEvent
}

beforeEach(() => {
  page = { key: 'p', blocks: [block(a, 0, 'TODO'), block(b, 1), block(c, 0)] }
  editing = false
  ran = []
  notes = []
  shown = states
  sel = new MultiSelect(host(), false)
})

test('Tab indents the selected blocks in document order', () => {
  sel.select(b, a)
  sel.onKey(key('Tab'))
  expect(ran).toEqual([{ type: 'blocks.indent', ids: [a, b] }])
})

test('Shift+ArrowDown extends from the anchor', () => {
  sel.select(a, a)
  const e = key('ArrowDown', { shift: true })
  sel.onKey(e)
  expect(sel.ids).toEqual([a, b])
  expect(e.defaultPrevented).toBe(true)
  expect(ran).toEqual([])
})

test('Mod+Enter sets the next in-cycle state of the first block', () => {
  sel.select(a, b)
  sel.onKey(key('Enter', { ctrl: true }))
  expect(ran).toEqual([{ type: 'blocks.setState', ids: [a, b], keyword: 'DOING' }])
})

test('after a delete, undo still acts on the page', () => {
  sel.select(a, b)
  page = { key: 'p', blocks: [block(c, 0)] }
  sel.onKey(key('z', { ctrl: true }))
  expect(ran).toEqual([{ type: 'history.undo', page: 'p' }])
  expect(sel.ids).toEqual([a, b])
})

test('after a delete, other keys clear the selection', () => {
  sel.select(a, b)
  page = { key: 'p', blocks: [block(c, 0)] }
  const e = key('Delete')
  sel.onKey(e)
  expect(ran).toEqual([])
  expect(sel.ids).toEqual([])
  expect(e.defaultPrevented).toBe(false)
})

test('keys are ignored while editing', () => {
  sel.select(a, b)
  editing = true
  sel.onKey(key('Tab'))
  sel.onKey(key('z', { ctrl: true }))
  expect(ran).toEqual([])
})

// The cycle wraps and never removes the state; with no state in it, a note says so.

test('Mod+Enter wraps when the first block is at the end of the cycle', () => {
  page = { key: 'p', blocks: [block(a, 0, 'DONE'), block(b, 0, 'TODO'), block(c, 0)] }
  sel.select(a, b)
  sel.onKey(key('Enter', { ctrl: true }))
  expect(ran).toEqual([{ type: 'blocks.setState', ids: [a, b], keyword: 'TODO' }])
})

test('Mod+Enter with no state in the cycle sends nothing and shows a note', () => {
  shown = states.map((s) => ({ ...s, inCycle: false }))
  sel.select(a, b)
  const e = key('Enter', { ctrl: true })
  sel.onKey(e)
  expect(ran).toEqual([])
  expect(e.defaultPrevented).toBe(true)
  expect(notes).toEqual(['No state is in the cycle (Settings → States)'])
})

test('Mod+Shift+Enter removes the state of every selected block', () => {
  sel.select(a, b)
  const e = key('Enter', { ctrl: true, shift: true })
  sel.onKey(e)
  expect(ran).toEqual([{ type: 'blocks.setState', ids: [a, b], keyword: null }])
  expect(e.defaultPrevented).toBe(true)
})
