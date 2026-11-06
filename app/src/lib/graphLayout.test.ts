import { describe, expect, test } from 'vitest'
import Graph from 'graphology'
import type { GraphNode, GraphView } from './types'
import { dotClass, dotSize, lines } from './graph'
import { LayoutWatch, buildGraph, needsLayout, placeNodes, readPositions, seedPosition, updateGraph } from './graphLayout'

const node = (key: string, linkedFrom = 0, over: Partial<GraphNode> = {}): GraphNode => ({
  key,
  name: key,
  title: key.toUpperCase(),
  kind: 'page',
  folder: '',
  linkedFrom,
  exists: true,
  tag: false,
  tagOnly: false,
  ...over,
})

describe('seedPosition', () => {
  test('is stable and in range', () => {
    expect(seedPosition('anna')).toEqual(seedPosition('anna'))
    const pts = Array.from({ length: 200 }, (_, i) => seedPosition(`key-${i}`))
    for (const [x, y] of pts) {
      expect(x).toBeGreaterThanOrEqual(-50)
      expect(x).toBeLessThanOrEqual(50)
      expect(y).toBeGreaterThanOrEqual(-50)
      expect(y).toBeLessThanOrEqual(50)
    }
    expect(new Set(pts.map((p) => p.join(','))).size).toBeGreaterThan(150)
  })
})

describe('placeNodes', () => {
  test('keeps known points and puts new ones near their neighbours', () => {
    const known = new Map<string, [number, number]>([
      ['a', [0, 0]],
      ['b', [10, 0]],
    ])
    const out = placeNodes(['a', 'b', 'c', 'd'], [[], [], [0, 1], []], known)
    expect(out[0]).toEqual([0, 0])
    expect(out[1]).toEqual([10, 0])
    expect(Math.abs(out[2][0] - 5)).toBeLessThanOrEqual(0.1)
    expect(Math.abs(out[2][1])).toBeLessThanOrEqual(0.1)
    const [sx, sy] = seedPosition('d')
    expect(out[3][0]).toBeCloseTo(5 + (sx / 50) * (10 / 2))
    expect(out[3][1]).toBeCloseTo(0 + (sy / 50) * (10 / 2))
  })
  test('two new dots linked only to one known dot get different points, neither on it', () => {
    const known = new Map<string, [number, number]>([['a', [0, 0]]])
    const out = placeNodes(['a', 'e', 'f'], [[1, 2], [0], [0]], known)
    expect(out[1]).not.toEqual(out[2])
    expect(out[1]).not.toEqual([0, 0])
    expect(out[2]).not.toEqual([0, 0])
  })
  test('with one known point the offset is seed/50 x 0.01 x 1', () => {
    const known = new Map<string, [number, number]>([['a', [3, 4]]])
    const out = placeNodes(['a', 'e'], [[1], [0]], known)
    const [sx, sy] = seedPosition('e')
    expect(out[1][0]).toBeCloseTo(3 + (sx / 50) * 0.01)
    expect(out[1][1]).toBeCloseTo(4 + (sy / 50) * 0.01)
  })
  test('with nothing known a dot goes to its raw seed point', () => {
    expect(placeNodes(['q'], [[]], new Map())[0]).toEqual(seedPosition('q'))
  })
})

describe('readPositions', () => {
  test('skips non-finite entries', () => {
    const g = new Graph()
    g.addNode('a', { x: 1, y: 2 })
    g.addNode('b', { x: NaN, y: 2 })
    g.addNode('c', { x: 1, y: Infinity })
    expect(readPositions(g)).toEqual([{ key: 'a', x: 1, y: 2 }])
  })
})

const view = (): GraphView => ({
  nodes: [node('anna', 2), node('ben', 0), node('lonely', 0)],
  edges: [
    [1, 0],
    [0, 1],
    [2, 0],
  ],
  positions: [[1, 2], null, [9, 9]],
})

describe('buildGraph', () => {
  test('uses known positions and places the rest', () => {
    const v = view()
    v.positions = [[1, 2], null, null]
    const { graph, placed } = buildGraph(v, new Map())
    expect(graph.getNodeAttribute('anna', 'x')).toBe(1)
    expect(graph.getNodeAttribute('anna', 'y')).toBe(2)
    expect(placed).toBe(2)
    expect(graph.size).toBe(lines(v).length)
    expect(graph.type).toBe('undirected')
    expect(graph.getNodeAttribute('anna', 'size')).toBe(dotSize(2))
    expect(graph.getNodeAttribute('anna', 'cls')).toBe(dotClass(v.nodes[0]))
    expect(graph.getNodeAttribute('anna', 'label')).toBe('ANNA')
    expect(graph.getNodeAttribute('anna', 'name')).toBe('anna')
  })
  test('known wins over the view positions', () => {
    const { graph } = buildGraph(view(), new Map([['anna', [5, 5]]]))
    expect(graph.getNodeAttribute('anna', 'x')).toBe(5)
    expect(graph.getNodeAttribute('lonely', 'x')).toBe(9)
  })
})

describe('needsLayout', () => {
  test('a first view, with no saved position, is arranged', () => {
    expect(needsLayout(1, 1)).toBe(true)
    expect(needsLayout(5000, 5000)).toBe(true)
  })
  test('a saved map with a few new dots is kept', () => {
    expect(needsLayout(0, 10)).toBe(false)
    expect(needsLayout(1, 5000)).toBe(false)
    expect(needsLayout(5, 10)).toBe(false)
  })
  test('a mostly unknown view is arranged', () => {
    expect(needsLayout(6, 10)).toBe(true)
  })
  test('an empty view needs nothing', () => {
    expect(needsLayout(0, 0)).toBe(false)
  })
})

describe('updateGraph', () => {
  test('keeps positions and places new dots', () => {
    const { graph } = buildGraph(view(), new Map())
    graph.setNodeAttribute('anna', 'x', 7)
    graph.setNodeAttribute('anna', 'y', 7)
    const next: GraphView = {
      nodes: [node('anna', 1, { title: 'Anna!' }), node('ben', 0), node('zed', 0)],
      edges: [
        [0, 1],
        [2, 0],
      ],
      positions: [null, null, null],
    }
    const added = updateGraph(graph, next)
    expect(added).toBe(1)
    expect(graph.getNodeAttribute('anna', 'x')).toBe(7)
    expect(graph.getNodeAttribute('anna', 'y')).toBe(7)
    expect(graph.getNodeAttribute('anna', 'label')).toBe('Anna!')
    expect(graph.getNodeAttribute('anna', 'size')).toBe(dotSize(1))
    expect(graph.hasNode('lonely')).toBe(false)
    expect(graph.size).toBe(2)
    expect(Math.abs(graph.getNodeAttribute('zed', 'x') - 7)).toBeLessThan(1)
    expect(Math.abs(graph.getNodeAttribute('zed', 'y') - 7)).toBeLessThan(1)
  })
})

describe('LayoutWatch', () => {
  test('settles when still', () => {
    const w = new LayoutWatch(0)
    const xy = new Float64Array([0, 0, 10, 0])
    expect(w.feed(xy, 0)).toBe('running')
    expect(w.feed(xy, 300)).toBe('running')
    expect(w.feed(xy, 600)).toBe('settled')
  })
  test('caps at 10 s when still moving', () => {
    const w = new LayoutWatch(0)
    let t = 0
    let state = 'running'
    while (t < 10_000) {
      t += 100
      // extent stays 10; the third dot jumps by the whole extent every frame
      const xy = new Float64Array([0, 0, 10, 0, 0, (t / 100) % 2 === 0 ? 10 : 0])
      state = w.feed(xy, t)
      if (t < 10_000) expect(state).toBe('running')
    }
    expect(state).toBe('capped')
  })
  test('one dot settles (extent at least 1)', () => {
    const w = new LayoutWatch(0)
    const xy = new Float64Array([3, 3])
    w.feed(xy, 0)
    expect(w.feed(xy, 500)).toBe('settled')
  })
})
