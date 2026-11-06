// ForceAtlas2 helpers. The package's own worker supervisor builds a blob: worker, which the CSP blocks, so the matrices
// are built here and only `iterate.js` (pure) is used for the maths.
import type Graph from 'graphology'
import forceAtlas2 from 'graphology-layout-forceatlas2'
import defaults from 'graphology-layout-forceatlas2/defaults.js'
import iterate from 'graphology-layout-forceatlas2/iterate.js'

/** Floats per node (x, y, dx, dy, old dx, old dy, mass, convergence, size, fixed) and per edge (source, target, weight). */
export const PPN = 10
const PPE = 3

export function fa2Settings(graph: Graph): Record<string, unknown> {
  return { ...defaults, ...forceAtlas2.inferSettings(graph), slowDown: 5 }
}

export function toArrays(graph: Graph): { nodes: Float32Array; edges: Float32Array } {
  const nodes = new Float32Array(graph.order * PPN)
  const edges = new Float32Array(graph.size * PPE)
  const index = new Map<string, number>()
  let j = 0
  graph.forEachNode((key, attr) => {
    index.set(key, j)
    nodes[j] = attr.x
    nodes[j + 1] = attr.y
    nodes[j + 6] = 1 // mass, grows with the degree below
    nodes[j + 7] = 1 // convergence
    nodes[j + 8] = attr.size || 1
    nodes[j + 9] = attr.fixed ? 1 : 0
    j += PPN
  })
  j = 0
  graph.forEachEdge((_edge, _attr, source, target) => {
    const s = index.get(source)!
    const t = index.get(target)!
    nodes[s + 6] += 1
    nodes[t + 6] += 1
    edges[j] = s
    edges[j + 1] = t
    edges[j + 2] = 1
    j += PPE
  })
  return { nodes, edges }
}

/** Writes x and y of a node matrix back, in the graph's node order. */
export function applyPositions(graph: Graph, nodes: Float32Array): void {
  let i = 0
  graph.updateEachNodeAttributes((_key, attr) => {
    attr.x = nodes[i]
    attr.y = nodes[i + 1]
    i += PPN
    return attr
  })
}

/** Iterates until `budgetMs` is used (at least once); returns the number of iterations. */
export function runBatch(
  settings: Record<string, unknown>,
  nodes: Float32Array,
  edges: Float32Array,
  budgetMs: number,
  now: () => number,
): number {
  const start = now()
  let count = 0
  do {
    iterate(settings, nodes, edges)
    count++
  } while (now() - start < budgetMs)
  return count
}
