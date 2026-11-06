// Drives the layout worker: one worker, one run at a time, stops itself when the layout is still.
import type Graph from 'graphology'
import { PPN, applyPositions, fa2Settings, toArrays } from './fa2Batch'
import { LayoutWatch } from './graphLayout'
import type { FromWorker, ToWorker } from './layoutProtocol'

export interface WorkerLike {
  postMessage(m: ToWorker, transfer?: Transferable[]): void
  onmessage: ((e: { data: FromWorker }) => void) | null
  terminate(): void
}

export type LayoutState = 'running' | 'settled' | 'capped'

export class LayoutRunner {
  private worker: WorkerLike | null = null
  private run = 0
  private graph: Graph | null = null
  private watch: LayoutWatch | null = null
  private onFrame: ((s: LayoutState) => void) | null = null
  running = false

  constructor(
    private readonly make: () => WorkerLike,
    private readonly now: () => number,
  ) {}

  /** Starts on `graph`; each message of this run writes x/y into the graph, feeds the watch and calls `onFrame`. On
   *  'settled' or 'capped' it stops itself. No-op on an empty graph. */
  start(graph: Graph, onFrame: (s: LayoutState) => void): void {
    if (graph.order === 0) return
    if (!this.worker) {
      this.worker = this.make()
      this.worker.onmessage = (e) => this.onMessage(e.data)
    }
    this.run++
    this.graph = graph
    this.onFrame = onFrame
    this.watch = new LayoutWatch(this.now())
    this.running = true
    const { nodes, edges } = toArrays(graph)
    this.worker.postMessage({ type: 'start', run: this.run, nodes, edges, settings: fa2Settings(graph) }, [nodes.buffer, edges.buffer])
  }

  stop(): void {
    if (!this.running) return
    this.running = false
    this.worker?.postMessage({ type: 'stop', run: this.run })
  }

  dispose(): void {
    this.running = false
    this.worker?.terminate()
    this.worker = null
  }

  private onMessage(m: FromWorker): void {
    const graph = this.graph
    if (m.run !== this.run || !this.running || !graph || !this.watch || m.nodes.length !== graph.order * PPN) return
    applyPositions(graph, m.nodes)
    const xy = new Float64Array(graph.order * 2)
    for (let i = 0; i < graph.order; i++) {
      xy[i * 2] = m.nodes[i * PPN]
      xy[i * 2 + 1] = m.nodes[i * PPN + 1]
    }
    const state = this.watch.feed(xy, this.now())
    if (state !== 'running') this.stop()
    this.onFrame?.(state)
  }
}
