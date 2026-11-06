import { describe, expect, test } from 'vitest'
import type { GraphNode, GraphView } from './types'
import {
  DEFAULT_FILTERS,
  countText,
  dotClass,
  dotSize,
  findMatches,
  findStep,
  graphKey,
  limitOptions,
  limitValid,
  limitValue,
  lines,
  moveChoice,
  neighbours,
  parseLimit,
  shownLines,
  shownNodes,
  type Limit,
  canRearrange,
} from './graph'

function node(key: string, over: Partial<GraphNode> = {}): GraphNode {
  return { key, name: key, title: key, kind: 'page', folder: '', linkedFrom: 0, exists: true, tag: false, tagOnly: false, ...over }
}

const view: GraphView = {
  nodes: [
    node('2026-10-27', { kind: 'journal', exists: false }),
    node('anna'),
    node('ben', { folder: 'Projects' }),
    node('deep', { folder: 'Projects/Old' }),
    node('infra', { tag: true, tagOnly: true, exists: false }),
    node('lonely'),
    node('x', { exists: false }),
  ],
  edges: [[0, 1], [1, 2], [2, 1], [1, 4], [3, 2], [1, 6]],
  positions: [null, null, null, null, null, null, null],
}
const all = (v: GraphView) => v.nodes.map(() => true)
const idx = (b: boolean[]) => b.flatMap((x, i) => (x ? [i] : []))

describe('graph logic', () => {
  test('lines merges both directions', () => {
    expect(lines(view)).toEqual([[0, 1], [1, 2], [1, 4], [1, 6], [2, 3]])
  })
  test('neighbours', () => {
    const n = neighbours(7, lines(view))
    expect(n[1]).toEqual([0, 2, 4, 6])
    expect(n[5]).toEqual([])
  })
  test('dotClass', () => {
    expect([0, 1, 4, 6].map((i) => dotClass(view.nodes[i]))).toEqual(['journal', 'page', 'tag', 'missing'])
  })
  test('shownNodes defaults hide journals only', () => {
    expect(shownNodes(view, DEFAULT_FILTERS)).toEqual([false, true, true, true, true, true, true])
  })
  test('hide tag-only', () => {
    expect(shownNodes(view, { ...DEFAULT_FILTERS, hideTagOnly: true })[4]).toBe(false)
  })
  test('folder limit takes sub-folders', () => {
    expect(idx(shownNodes(view, { ...DEFAULT_FILTERS, limit: { kind: 'folder', folder: 'Projects' } }))).toEqual([2, 3])
    expect(idx(shownNodes(view, { ...DEFAULT_FILTERS, limit: { kind: 'folder', folder: 'Projects/Old' } }))).toEqual([3])
  })
  test('tag limit is the tag and the pages linking to it', () => {
    expect(idx(shownNodes(view, { ...DEFAULT_FILTERS, limit: { kind: 'tag', key: 'infra' } }))).toEqual([1, 4])
  })
  test('a filter that hides everything', () => {
    const shown = shownNodes(view, { ...DEFAULT_FILTERS, limit: { kind: 'folder', folder: 'Nowhere' } })
    expect(shown.every((b) => !b)).toBe(true)
    expect(shownLines(lines(view), shown)).toEqual([])
    expect(countText(0, 0)).toBe('0 pages · 0 links')
    const empty: GraphView = { nodes: [], edges: [], positions: [] }
    expect(shownNodes(empty, DEFAULT_FILTERS)).toEqual([])
    expect(lines(empty)).toEqual([])
  })
  test('shownLines needs both ends', () => {
    const shown = shownNodes(view, DEFAULT_FILTERS)
    expect(shownLines(lines(view), shown)).toEqual([[1, 2], [1, 4], [1, 6], [2, 3]])
  })
  test('limitOptions', () => {
    expect(limitOptions(view)).toEqual({ folders: ['Projects', 'Projects/Old'], tags: [{ key: 'infra', title: 'infra' }] })
  })
  test('limitValid and the select values round-trip', () => {
    expect(limitValid(view, { kind: 'folder', folder: 'Gone' })).toBe(false)
    expect(limitValid(view, { kind: 'folder', folder: 'Projects' })).toBe(true)
    expect(limitValid(view, { kind: 'tag', key: 'infra' })).toBe(true)
    expect(limitValid(view, { kind: 'tag', key: 'anna' })).toBe(false)
    expect(limitValid(view, null)).toBe(true)
    const ls: (Limit | null)[] = [null, { kind: 'folder', folder: 'Projects/Old' }, { kind: 'tag', key: 'infra' }]
    for (const l of ls) expect(parseLimit(limitValue(l))).toEqual(l)
    expect(limitValue(null)).toBe('all')
    expect(parseLimit('junk')).toBeNull()
  })
  test('dotSize', () => {
    expect([0, 1, 4, 100, 400].map(dotSize)).toEqual([3, 4.5, 6, 18, 18])
  })
  test('countText', () => {
    expect(countText(1, 0)).toBe('1 page · 0 links')
    expect(countText(2, 1)).toBe('2 pages · 1 link')
    expect(countText(5000, 50000)).toBe('5,000 pages · 50,000 links')
  })
  test('findMatches puts prefixes first and skips hidden dots', () => {
    const shown = shownNodes(view, DEFAULT_FILTERS)
    expect(findMatches(view, shown, 'n')).toEqual([1, 2, 4, 5])
    expect(findMatches(view, shown, 'in')).toEqual([4])
    expect(findMatches(view, shown, 'L')).toEqual([5])
    expect(findMatches(view, shown, '2026')).toEqual([])
    expect(findMatches(view, all(view), '2026')).toEqual([0])
    expect(findMatches(view, shown, '')).toEqual([])
    expect(findMatches(view, shown, 'n', 2)).toEqual([1, 2])
    const v2: GraphView = { ...view, nodes: view.nodes.map((n) => (n.key === 'ben' ? { ...n, linkedFrom: 3 } : n)) }
    expect(findMatches(v2, shown, 'n')).toEqual([2, 1, 4, 5])
  })
  test('findStep: Enter focuses, Enter again on the same text and choice opens', () => {
    expect(findStep(null, 'hub', 'hub')).toBe('focus')
    expect(findStep({ text: 'hub', chosen: 'hub' }, 'hub', 'hub')).toBe('open')
    expect(findStep({ text: 'hu', chosen: 'hub' }, 'hub', 'hub')).toBe('focus')
    expect(findStep({ text: 'hub', chosen: 'hub' }, 'hub', 'hubcap')).toBe('focus')
    expect(findStep({ text: 'x', chosen: null }, 'x', null)).toBe('focus')
  })
  test('moveChoice stays within the list', () => {
    expect(moveChoice(0, 3, 1)).toBe(1)
    expect(moveChoice(2, 3, 1)).toBe(2)
    expect(moveChoice(0, 3, -1)).toBe(0)
    expect(moveChoice(1, 3, -1)).toBe(0)
    expect(moveChoice(-1, 0, 1)).toBe(-1)
    expect(moveChoice(5, 2, -1)).toBe(1)
  })
  test('graphKey: arrows pan, + / = / - zoom, 0 fits, anything else or a modifier is not taken', () => {
    const k = (key: string, mod: Partial<{ ctrlKey: boolean; altKey: boolean; metaKey: boolean }> = {}) =>
      graphKey({ key, ctrlKey: false, altKey: false, metaKey: false, ...mod })
    expect(k('ArrowLeft')).toEqual({ kind: 'pan', dx: -1, dy: 0 })
    expect(k('ArrowRight')).toEqual({ kind: 'pan', dx: 1, dy: 0 })
    expect(k('ArrowUp')).toEqual({ kind: 'pan', dx: 0, dy: -1 })
    expect(k('ArrowDown')).toEqual({ kind: 'pan', dx: 0, dy: 1 })
    expect(k('+')).toEqual({ kind: 'zoom', factor: 1.5 })
    expect(k('=')).toEqual({ kind: 'zoom', factor: 1.5 })
    expect(k('-')).toEqual({ kind: 'zoom', factor: 1 / 1.5 })
    expect(k('0')).toEqual({ kind: 'fit' })
    expect(k('a')).toBeNull()
    expect(k('Enter')).toBeNull()
    expect(k('0', { ctrlKey: true })).toBeNull()
    expect(k('ArrowLeft', { altKey: true })).toBeNull()
    expect(k('+', { metaKey: true })).toBeNull()
  })
})

describe('graph edge guards', () => {
  test('a page linking to itself draws no line', () => {
    const selfLinked: GraphView = { ...view, edges: [...view.edges, [5, 5]] }
    expect(lines(selfLinked)).toEqual(lines(view))
  })
  test('a folder limit stops at a "/": a sibling folder with the same start is not under it', () => {
    const v: GraphView = {
      nodes: [node('a', { folder: 'Projects' }), node('b', { folder: 'ProjectsX' }), node('c', { folder: 'Projects2/Sub' })],
      edges: [],
      positions: [null, null, null],
    }
    expect(idx(shownNodes(v, { ...DEFAULT_FILTERS, limit: { kind: 'folder', folder: 'Projects' } }))).toEqual([0])
  })
  test('a folder limit leaves out journal pages in that folder, even with journals shown', () => {
    const v: GraphView = {
      nodes: [node('a', { folder: 'Projects' }), node('2026-10-30', { kind: 'journal', folder: 'Projects' })],
      edges: [],
      positions: [null, null],
    }
    const f = { hideJournals: false, hideTagOnly: false, limit: { kind: 'folder', folder: 'Projects' } as Limit }
    expect(idx(shownNodes(v, f))).toEqual([0])
  })
  test('Re-arrange needs the picture, a still layout and at least one dot shown', () => {
    expect(canRearrange(true, 'settled', 3)).toBe(true)
    expect(canRearrange(true, 'saved', 1)).toBe(true)
    expect(canRearrange(true, 'capped', 3)).toBe(true)
    expect(canRearrange(false, 'settled', 3)).toBe(false)
    expect(canRearrange(true, 'none', 3)).toBe(false)
    expect(canRearrange(true, 'running', 3)).toBe(false)
    expect(canRearrange(true, 'saved', 0)).toBe(false)
  })
})
