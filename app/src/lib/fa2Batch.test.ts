import { expect, test } from 'vitest'
import Graph from 'graphology'
import { applyPositions, fa2Settings, runBatch, toArrays } from './fa2Batch'

const small = () => {
  const g = new Graph({ type: 'undirected' })
  g.addNode('a', { x: 0, y: 0, size: 3 })
  g.addNode('b', { x: 5, y: 1, size: 3 })
  g.addNode('c', { x: -4, y: 6, size: 3 })
  g.addEdge('a', 'b')
  g.addEdge('b', 'c')
  return g
}

test('runBatch moves a small graph and keeps numbers finite', () => {
  const g = small()
  const { nodes, edges } = toArrays(g)
  let t = 0
  const n = runBatch(fa2Settings(g), nodes, edges, 5, () => (t += 1))
  expect(n).toBeGreaterThanOrEqual(1)
  applyPositions(g, nodes)
  const start: Record<string, number> = { a: 0, b: 5, c: -4 }
  expect(['a', 'b', 'c'].some((k) => g.getNodeAttribute(k, 'x') !== start[k])).toBe(true)
  for (const k of ['a', 'b', 'c']) {
    expect(Number.isFinite(g.getNodeAttribute(k, 'x'))).toBe(true)
    expect(Number.isFinite(g.getNodeAttribute(k, 'y'))).toBe(true)
  }
})

test('runBatch runs at least once on a zero budget', () => {
  const g = small()
  const { nodes, edges } = toArrays(g)
  expect(runBatch(fa2Settings(g), nodes, edges, 0, () => 0)).toBe(1)
})

test('fa2Settings: inferred settings with slowDown 5', () => {
  const s = fa2Settings(small())
  expect(s).toMatchObject({ strongGravityMode: true, gravity: 0.05, scalingRatio: 10, slowDown: 5, barnesHutOptimize: false })
  expect(s.linLogMode).toBe(false)
})
