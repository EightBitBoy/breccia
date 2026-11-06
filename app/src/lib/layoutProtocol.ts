// The messages between LayoutRunner and the layout worker (types only). Runs are numbered so a frame of an old run is
// dropped.

/** To the worker: start a run on these arrays (fa2Batch's layout), or stop one. */
export type ToWorker =
  | { type: 'start'; run: number; nodes: Float32Array; edges: Float32Array; settings: Record<string, unknown> }
  | { type: 'stop'; run: number }

/** From the worker: one batch's node matrix (fa2Batch's PPN numbers per node) for run `run`. */
export interface FromWorker {
  run: number
  nodes: Float32Array
}
