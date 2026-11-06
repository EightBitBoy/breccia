// ForceAtlas2 off the main thread. A module worker built by Vite and loaded from 'self' (the CSP forbids blob: workers).
import { runBatch } from './fa2Batch'
import type { FromWorker, ToWorker } from './layoutProtocol'

let active = -1

onmessage = (e: MessageEvent<ToWorker>) => {
  const m = e.data
  if (m.type === 'stop') {
    if (m.run === active) active = -1
    return
  }
  const { run, nodes, edges, settings } = m
  active = run
  const step = () => {
    if (active !== run) return
    runBatch(settings, nodes, edges, 25, () => performance.now())
    const copy = nodes.slice()
    const out: FromWorker = { run, nodes: copy }
    postMessage(out, { transfer: [copy.buffer] })
    // Yield so a 'stop' or a new 'start' gets through between batches.
    setTimeout(step, 0)
  }
  step()
}
