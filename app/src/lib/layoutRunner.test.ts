import { expect, test } from 'vitest'
import Graph from 'graphology'
import type { FromWorker, ToWorker } from './layoutProtocol'
import { LayoutRunner, type WorkerLike } from './layoutRunner'

class FakeWorker implements WorkerLike {
  posts: ToWorker[] = []
  onmessage: ((e: { data: FromWorker }) => void) | null = null
  terminated = false
  postMessage(m: ToWorker) {
    this.posts.push(m)
  }
  terminate() {
    this.terminated = true
  }
  push(data: FromWorker) {
    this.onmessage?.({ data })
  }
}

const graph = () => {
  const g = new Graph({ type: 'undirected' })
  g.addNode('a', { x: 0, y: 0, size: 3 })
  g.addNode('b', { x: 5, y: 5, size: 3 })
  g.addEdge('a', 'b')
  return g
}
const matrix = (a: [number, number], b: [number, number]) => {
  const m = new Float32Array(20)
  m[0] = a[0]
  m[1] = a[1]
  m[10] = b[0]
  m[11] = b[1]
  return m
}

test('LayoutRunner does not start on an empty graph', () => {
  let made = 0
  const r = new LayoutRunner(
    () => {
      made++
      return new FakeWorker()
    },
    () => 0,
  )
  r.start(new Graph(), () => {})
  expect(made).toBe(0)
  expect(r.running).toBe(false)
})

test('start posts the matrices and reuses one worker', () => {
  const w = new FakeWorker()
  let made = 0
  const r = new LayoutRunner(
    () => {
      made++
      return w
    },
    () => 0,
  )
  r.start(graph(), () => {})
  r.start(graph(), () => {})
  expect(made).toBe(1)
  expect(w.posts.map((p) => p.type)).toEqual(['start', 'start'])
  expect(w.posts[1].run).toBe(w.posts[0].run + 1)
  const first = w.posts[0]
  expect(first.type === 'start' && first.nodes.length).toBe(20)
  expect(r.running).toBe(true)
})

test('messages of an old run are ignored', () => {
  const w = new FakeWorker()
  const r = new LayoutRunner(() => w, () => 0)
  const g = graph()
  const frames: string[] = []
  r.start(g, (s) => frames.push(s))
  const first = w.posts[0].run
  r.start(g, (s) => frames.push(s))
  w.push({ run: first, nodes: matrix([100, 100], [200, 200]) })
  expect(g.getNodeAttribute('a', 'x')).toBe(0)
  expect(frames).toEqual([])
})

test('it stops itself when settled and writes positions into the graph', () => {
  const w = new FakeWorker()
  let t = 0
  const r = new LayoutRunner(() => w, () => t)
  const g = graph()
  const frames: string[] = []
  r.start(g, (s) => frames.push(s))
  const run = w.posts[0].run
  w.push({ run, nodes: matrix([1, 2], [6, 7]) })
  expect(g.getNodeAttribute('a', 'x')).toBe(1)
  expect(g.getNodeAttribute('b', 'y')).toBe(7)
  t = 600
  w.push({ run, nodes: matrix([1, 2], [6, 7]) })
  expect(frames).toEqual(['running', 'settled'])
  expect(w.posts.at(-1)).toEqual({ type: 'stop', run })
  expect(r.running).toBe(false)
  w.push({ run, nodes: matrix([50, 50], [60, 70]) })
  expect(g.getNodeAttribute('a', 'x')).toBe(1)
})

test('dispose terminates the worker', () => {
  const w = new FakeWorker()
  const r = new LayoutRunner(() => w, () => 0)
  r.start(graph(), () => {})
  r.dispose()
  expect(w.terminated).toBe(true)
  expect(r.running).toBe(false)
})
