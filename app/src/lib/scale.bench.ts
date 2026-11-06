// Scale measurement (spec §8): the pure functions behind the journal feed and
// the All pages table at 3,000 days / 5,000 rows. Measures only. Bar: each mean <= 8 ms (half a frame).
// Run: npx vitest bench --run src/lib/scale.bench.ts
import { test } from 'vitest'
import { dayOfBlock, feedBlocks, withPages, type Feed } from './feed'
import { DEFAULT_SORT, shownRows } from './allPages'
import { DEFAULT_FILTERS, findMatches, lines, shownNodes } from './graph'
import { buildGraph, updateGraph } from './graphLayout'
import type { BlockView, GraphNode, GraphView, PageRowView, PageView } from './types'

const DAYS = 3000
const BLOCKS = 20

function day(k: number): string {
  const d = new Date(Date.UTC(2026, 9, 29) - k * 86_400_000)
  return d.toISOString().slice(0, 10)
}

let nextId = 1
function dayPage(key: string): PageView {
  const blocks: BlockView[] = Array.from({ length: BLOCKS }, (_, b) => {
    const text = `Block ${b} links [[Page ${b * 7}]]`
    return { id: nextId++, text, html: text, depth: 0 } as unknown as BlockView
  })
  return { key, name: key, title: key, blocks } as unknown as PageView
}

const days = Array.from({ length: DAYS }, (_, k) => ({ key: day(k), title: day(k) }))
const loaded: Record<string, PageView> = {}
for (const d of days) loaded[d.key] = dayPage(d.key)
const feed = { today: days[0].key, days, loaded } as unknown as Feed
const lastId = loaded[days[DAYS - 1].key].blocks[BLOCKS - 1].id
const oneDay = dayPage(days[1500].key)
const none = new Set<number>()

const ROWS = 5000
const rows: PageRowView[] = Array.from({ length: ROWS }, (_, i) => {
  const journal = i >= 2000
  const name = journal ? day(i - 2000) : `Page ${i}`
  return {
    key: journal ? name : `page ${i}`,
    name,
    title: journal ? `Day ${name}` : name,
    kind: journal ? 'journal' : 'page',
    folder: journal ? '' : `F${i % 50}`,
    created: 1_700_000_000_000 + i * 1000,
    edited: 1_700_000_000_000 + ((i * 7919) % ROWS) * 1000,
    linkedFrom: i % 13,
    linksOut: i % 7,
  } as PageRowView
})

// Vitest 5 hands `bench` to a test through its context (as echo.bench.ts does).
test('feed and table at scale', async ({ bench }) => {
  await bench
    .compare(
      bench('withPages(feed of 3,000 days, [one day])', () => {
        withPages(feed, [oneDay])
      }),
      bench('feedBlocks(feed of 3,000 days x 20 blocks, no folds)', () => {
        feedBlocks(feed, none)
      }),
      bench('dayOfBlock(feed, last block)', () => {
        dayOfBlock(feed, lastId)
      }),
      bench('shownRows(5,000 rows) sorted by name', () => {
        shownRows(rows, { filter: '', journals: true, sort: DEFAULT_SORT })
      }),
      bench('shownRows(5,000 rows) sorted by edited', () => {
        shownRows(rows, { filter: '', journals: true, sort: { key: 'edited', dir: 'desc' } })
      }),
      bench('shownRows(5,000 rows) filter "page 1"', () => {
        shownRows(rows, { filter: 'page 1', journals: true, sort: DEFAULT_SORT })
      }),
    )
})

// The network view: 5,000 nodes (2,000 pages in 50 folders, 3,000 journals) and
// 50,000 distinct lines. Bars: lines, shownNodes, findMatches each 8 ms; buildGraph, updateGraph 100 ms.
const GN = 5000
const graphNodes: GraphNode[] = Array.from({ length: GN }, (_, i) => {
  const journal = i >= 2000
  const name = journal ? day(i - 2000) : `Page ${i}`
  return {
    key: journal ? name : `page ${i}`,
    name,
    title: name,
    kind: journal ? 'journal' : 'page',
    folder: journal ? '' : `F${i % 50}`,
    linkedFrom: i % 13,
    exists: true,
    tag: false,
    tagOnly: false,
  }
})
// 50,000 distinct unordered pairs, each written once in a random direction (a fixed pseudo-random walk).
const pairSeen = new Set<number>()
const graphEdges: [number, number][] = []
let rng = 12345
const rand = (n: number) => {
  rng = (Math.imul(rng, 1103515245) + 12345) >>> 0
  return rng % n
}
while (graphEdges.length < 50_000) {
  const a = rand(GN)
  const b = rand(GN)
  const id = Math.min(a, b) * GN + Math.max(a, b)
  if (a === b || pairSeen.has(id)) continue
  pairSeen.add(id)
  graphEdges.push([a, b])
}
graphEdges.sort((p, q) => p[0] - q[0] || p[1] - q[1])
const graphView: GraphView = { nodes: graphNodes, edges: graphEdges, positions: graphNodes.map(() => null) }
const graphShown = shownNodes(graphView, { ...DEFAULT_FILTERS, hideJournals: false })
const folderLimit = { ...DEFAULT_FILTERS, limit: { kind: 'folder' as const, folder: 'F7' } }
const built = buildGraph(graphView, new Map())
const withOneMore: GraphView = {
  nodes: [...graphNodes, { ...graphNodes[0], key: 'zz new', name: 'zz new', title: 'zz new', linkedFrom: 0 }],
  edges: [...graphEdges, [0, GN]],
  positions: [...graphView.positions, null],
}

test('network view at scale', async ({ bench }) => {
  await bench
    .compare(
      bench('lines(50,000 links)', () => {
        lines(graphView)
      }),
      bench('shownNodes(5,000 nodes) defaults', () => {
        shownNodes(graphView, DEFAULT_FILTERS)
      }),
      bench('shownNodes(5,000 nodes) folder limit', () => {
        shownNodes(graphView, folderLimit)
      }),
      bench("findMatches('page 1')", () => {
        findMatches(graphView, graphShown, 'page 1')
      }),
      bench('buildGraph(5,000 nodes, 50,000 lines)', () => {
        buildGraph(graphView, new Map())
      }),
      bench('updateGraph(one node added)', () => {
        const g = built.graph.copy()
        updateGraph(g, withOneMore)
      }),
    )
})
