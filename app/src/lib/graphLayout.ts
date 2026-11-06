// Placement, graph building and the "still" check of the network view (spec §7.11). No DOM, no sigma.
import Graph from 'graphology'
import { dotClass, dotSize, lines, neighbours } from './graph'
import type { GraphView, NodePosition } from './types'

type Point = [number, number]

/** FNV-1a 32 over the key's UTF-16 code units, split into two numbers in [-50, 50]. */
export function seedPosition(key: string): Point {
  let h = 0x811c9dc5
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  const lo = h & 0xffff
  const hi = h >>> 16
  return [(lo / 0xffff) * 100 - 50, (hi / 0xffff) * 100 - 50]
}

function bounds(points: Point[]): { cx: number; cy: number; extent: number } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of points) {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, extent: Math.max(maxX - minX, maxY - minY) }
}

/** A known key keeps its point; an unknown one goes near its known neighbours, or around the known centre. ForceAtlas2
 *  never separates coincident dots, so every offset is non-zero. */
export function placeNodes(keys: string[], nbrs: number[][], known: Map<string, Point>): Point[] {
  const knownPoints = [...known.values()]
  const hasKnown = knownPoints.length > 0
  const { cx, cy, extent } = hasKnown ? bounds(knownPoints) : { cx: 0, cy: 0, extent: 0 }
  const scale = Math.max(extent, 1)
  return keys.map((key, i) => {
    const p = known.get(key)
    if (p) return p
    const [sx, sy] = seedPosition(key)
    const near = nbrs[i].map((j) => known.get(keys[j])).filter((q): q is Point => q !== undefined)
    if (near.length > 0) {
      const mx = near.reduce((s, q) => s + q[0], 0) / near.length
      const my = near.reduce((s, q) => s + q[1], 0) / near.length
      return [mx + (sx / 50) * 0.01 * scale, my + (sy / 50) * 0.01 * scale]
    }
    if (!hasKnown) return [sx, sy]
    return [cx + ((sx / 50) * scale) / 2, cy + ((sy / 50) * scale) / 2]
  })
}

const edgeKey = (a: string, b: string) => `${a}\u0001${b}`

function nodeAttrs(view: GraphView, i: number) {
  const n = view.nodes[i]
  return { size: dotSize(n.linkedFrom), label: n.title, name: n.name, cls: dotClass(n) }
}

export function buildGraph(view: GraphView, known: Map<string, Point>): { graph: Graph; placed: number } {
  const merged = new Map(known)
  let placed = 0
  view.nodes.forEach((n, i) => {
    if (merged.has(n.key)) return
    const p = view.positions[i]
    if (p) merged.set(n.key, p)
    else placed++
  })
  const ls = lines(view)
  const keys = view.nodes.map((n) => n.key)
  const points = placeNodes(keys, neighbours(keys.length, ls), merged)
  const graph = new Graph({ type: 'undirected' })
  view.nodes.forEach((n, i) => graph.addNode(n.key, { x: points[i][0], y: points[i][1], ...nodeAttrs(view, i) }))
  for (const [a, b] of ls) graph.addEdgeWithKey(edgeKey(keys[a], keys[b]), keys[a], keys[b])
  return { graph, placed }
}

/** Whether opening the graph runs the layout: only when more than half of its `order` dots had no saved
 *  position (`placed`). Otherwise the saved map is kept and the new dots stay where `placeNodes` put them, as live
 *  updates do. */
export function needsLayout(placed: number, order: number): boolean {
  return placed > order / 2
}

/** Brings `graph` in line with `view`; existing dots keep their x and y. Returns how many dots were added. */
export function updateGraph(graph: Graph, view: GraphView): number {
  const keys = view.nodes.map((n) => n.key)
  const live = new Set(keys)
  for (const k of graph.nodes()) if (!live.has(k)) graph.dropNode(k)
  const ls = lines(view)
  const wanted = new Set(ls.map(([a, b]) => edgeKey(keys[a], keys[b])))
  for (const e of graph.edges()) if (!wanted.has(e)) graph.dropEdge(e)
  const known = new Map<string, Point>()
  graph.forEachNode((k, attr) => known.set(k, [attr.x, attr.y]))
  const points = placeNodes(keys, neighbours(keys.length, ls), known)
  let added = 0
  view.nodes.forEach((n, i) => {
    if (graph.hasNode(n.key)) graph.mergeNodeAttributes(n.key, nodeAttrs(view, i))
    else {
      graph.addNode(n.key, { x: points[i][0], y: points[i][1], ...nodeAttrs(view, i) })
      added++
    }
  })
  for (const [a, b] of ls) {
    const k = edgeKey(keys[a], keys[b])
    if (!graph.hasEdge(k)) graph.addEdgeWithKey(k, keys[a], keys[b])
  }
  return added
}

/** Positions to save. `JSON.stringify(NaN)` is `null`, which serde would refuse, so non-finite ones are skipped. */
export function readPositions(graph: Graph): NodePosition[] {
  const out: NodePosition[] = []
  graph.forEachNode((key, attr) => {
    if (Number.isFinite(attr.x) && Number.isFinite(attr.y)) out.push({ key, x: attr.x, y: attr.y })
  })
  return out
}

/** Judges frames of positions (`x0, y0, x1, y1, …`): still for `windowMs` is settled, `capMs` after the start is capped. */
export class LayoutWatch {
  private readonly windowMs: number
  private readonly ratio: number
  private readonly capMs: number
  private history: { t: number; xy: Float64Array }[] = []

  constructor(
    private readonly startMs: number,
    opts: { windowMs?: number; ratio?: number; capMs?: number } = {},
  ) {
    this.windowMs = opts.windowMs ?? 500
    this.ratio = opts.ratio ?? 0.01
    this.capMs = opts.capMs ?? 10_000
  }

  feed(xy: Float64Array | Float32Array, nowMs: number): 'running' | 'settled' | 'capped' {
    const cur = Float64Array.from(xy)
    this.history.push({ t: nowMs, xy: cur })
    // The newest frame that is at least windowMs old is the reference; older ones are never needed again.
    let ref = -1
    for (let i = 0; i < this.history.length; i++) if (this.history[i].t <= nowMs - this.windowMs) ref = i
    if (ref > 0) this.history = this.history.slice(ref)
    if (ref >= 0) {
      const old = this.history[0].xy
      if (old.length === cur.length && this.displacement(old, cur) < this.ratio * this.extent(cur)) return 'settled'
    }
    return nowMs - this.startMs >= this.capMs ? 'capped' : 'running'
  }

  private extent(xy: Float64Array): number {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (let i = 0; i + 1 < xy.length; i += 2) {
      minX = Math.min(minX, xy[i])
      maxX = Math.max(maxX, xy[i])
      minY = Math.min(minY, xy[i + 1])
      maxY = Math.max(maxY, xy[i + 1])
    }
    return Math.max(maxX - minX, maxY - minY, 1)
  }

  private displacement(a: Float64Array, b: Float64Array): number {
    const n = b.length / 2
    if (n === 0) return 0
    let sum = 0
    for (let i = 0; i < b.length; i += 2) sum += Math.hypot(b[i] - a[i], b[i + 1] - a[i + 1])
    return sum / n
  }
}
