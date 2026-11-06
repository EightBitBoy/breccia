// The network view's picture: sigma 4 on a graphology graph (spec §7.11). Loaded with one dynamic `import()` by
// NetworkView when the graph first opens, so sigma, graphology and ForceAtlas2 stay out of the main bundle.
import type Graph from 'graphology'
import Sigma from 'sigma'
import type { EdgeDisplayData, NodeDisplayData } from 'sigma/types'
import type { DotClass } from './graph'
import type { GraphColours } from './graphColours'
import { HoverGate } from './hoverGate'
import type { WorkerLike } from './layoutRunner'

export { buildGraph, needsLayout, updateGraph, readPositions } from './graphLayout'
export { LayoutRunner } from './layoutRunner'
export { fa2Settings } from './fa2Batch'

/** The layout worker: a module worker Vite builds into its own file, loaded from 'self'. */
export function layoutWorker(): WorkerLike {
  return new Worker(new URL('./layout.worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike
}

export interface RendererHooks {
  onClick(key: string): void
  onHover(key: string | null): void
  /** The first sigma `afterRender` after `load` (NetworkView sets `data-drawn="1"`). */
  onDrawn(): void
}

export interface NetworkRenderer {
  /** Shows `graph` (positions in its x/y attributes). */
  load(graph: Graph): void
  setHidden(shown: (key: string) => boolean): void
  setColours(c: GraphColours): void
  /** Highlights `key` and its neighbours as hover does; null clears. */
  highlight(key: string | null): void
  /** Positions changed in the graph (layout frames): redraw. */
  redraw(): void
  /** The graph's nodes or lines changed (a live update): draw it again; a hovered dot that is gone is let go. */
  update(): void
  /** True keeps the picture's frame where it is, so dots that did not move stay put on screen when others come or go;
   *  false lets the frame follow the dots (while the layout runs). */
  holdFrame(on: boolean): void
  /** Centres the camera on the dot and zooms to a ratio of at most 0.25, without animation, then draws at once so an
   *  immediate hover picks the right dot. */
  focus(key: string): void
  /** Pans by a tenth of the view per step: `dx` right, `dy` down. */
  pan(dx: number, dy: number): void
  /** Zooms in by `factor` (below 1 zooms out). */
  zoom(factor: number): void
  /** Shows every dot. */
  fit(): void
  resize(): void
  kill(): void
}

// Sigma 4's settings: sizes in pixels, no throw before the container has a height, no rotation.
const SETTINGS = {
  renderEdgeLabels: false,
  enableEdgeEvents: false,
  itemSizesReference: 'screen',
  allowInvalidContainer: true,
  enableCameraRotation: false,
  enableCameraMouseRotation: false,
} as const

export function createRenderer(container: HTMLElement, colours: GraphColours, hooks: RendererHooks): NetworkRenderer {
  let sigma: Sigma | null = null
  let c = colours
  let font = getComputedStyle(document.body).fontFamily
  let shown: (key: string) => boolean = () => true
  let hovered: string | null = null
  let highlighted: string | null = null
  /** The hovered or highlighted dot and its neighbours; null when neither. */
  let focus: { key: string; near: Set<string> } | null = null
  let drawPending = false
  let restylePending = false
  let holding = false

  /** Shows `key` as the hovered dot (or none); a dot that is gone or hidden counts as none. */
  function setHover(key: string | null): void {
    const graph = sigma?.getGraph()
    const k = key !== null && graph?.hasNode(key) && shown(key) ? key : null
    if (k === hovered) return
    hovered = k
    restyle()
    hooks.onHover(k)
  }
  // Hovers wait while the picture moves: each would restyle every dot and line.
  const gate = new HoverGate(setHover)
  const press = () => gate.press()
  const release = () => gate.release()
  const moved = () => gate.moved()
  container.addEventListener('mousedown', press, true)
  container.addEventListener('wheel', moved, { capture: true, passive: true })
  window.addEventListener('mouseup', release, true)

  // Every colour sigma draws comes from the theme: dots, names, the hover box (no shadow), lines.
  const nodeReducer = (key: string, _d: NodeDisplayData, attrs: Record<string, unknown>): Partial<NodeDisplayData> => {
    const out: Partial<NodeDisplayData> = {
      color: c[attrs.cls as DotClass] ?? c.page,
      labelColor: c.label,
      labelFont: font,
      backdropColor: c.backdrop,
      backdropShadowColor: c.backdrop,
      backdropShadowBlur: 0,
      backdropBorderColor: c.backdrop,
      cursor: 'pointer',
    }
    if (!shown(key)) {
      out.visibility = 'hidden'
      out.labelVisibility = 'hidden'
      return out
    }
    if (focus) {
      if (key === focus.key || focus.near.has(key)) {
        out.labelVisibility = 'visible'
        out.depth = 'topNodes'
        out.labelDepth = 'topNodes'
        out.zIndex = key === focus.key ? 2 : 1
      } else {
        out.color = c.faded
        out.labelVisibility = 'hidden'
      }
    }
    return out
  }

  // The reducers also run inside sigma's constructor, so the graph comes from their arguments, not from `sigma`.
  const edgeReducer = (
    key: string,
    _d: EdgeDisplayData,
    _attrs: Record<string, unknown>,
    _state: unknown,
    _graphState: unknown,
    graph: Graph,
  ): Partial<EdgeDisplayData> => {
    const a = graph.source(key)
    const b = graph.target(key)
    if (!shown(a) || !shown(b)) return { visibility: 'hidden', color: c.line }
    if (focus && (a === focus.key || b === focus.key)) return { color: c.lineLit, depth: 'topEdges', zIndex: 1 }
    return { color: focus ? c.faded : c.line }
  }

  /** Recomputes the focus and redraws every dot and line once, however many changes came in this task. */
  function restyle(): void {
    const graph = sigma?.getGraph()
    // A hovered dot that is gone or hidden is let go; sigma sends no `leaveNode` for it.
    if (hovered !== null && !(graph?.hasNode(hovered) && shown(hovered))) {
      hovered = null
      hooks.onHover(null)
    }
    const key = hovered ?? highlighted
    focus = key !== null && graph?.hasNode(key) ? { key, near: new Set(graph.neighbors(key)) } : null
    if (restylePending) return
    restylePending = true
    queueMicrotask(() => {
      restylePending = false
      sigma?.scheduleRefresh()
    })
  }

  function create(graph: Graph): Sigma {
    const s = new Sigma(graph, container, { settings: SETTINGS, nodeReducer, edgeReducer })
    s.on('clickNode', ({ node }) => hooks.onClick(node))
    s.on('enterNode', ({ node }) => gate.hover(node))
    s.on('leaveNode', () => gate.hover(null))
    s.getCamera().on('updated', moved)
    s.on('afterRender', () => {
      // Held: keep the frame sigma fitted to the dots for this drawing. Not from an unsized container.
      if (holding && !s.getCustomBBox()) {
        const { width, height } = s.getDimensions()
        if (width > 0 && height > 0) s.setCustomBBox(s.getBBox())
      }
      if (!drawPending) return
      drawPending = false
      hooks.onDrawn()
    })
    return s
  }

  return {
    load(graph) {
      hovered = null
      highlighted = null
      focus = null
      gate.reset()
      drawPending = true
      if (sigma) sigma.setGraph(graph)
      else sigma = create(graph)
      // The constructor draws before the listener exists; the next frame is the first one `onDrawn` sees.
      sigma.scheduleRender()
    },
    setHidden(fn) {
      shown = fn
      restyle()
    },
    setColours(next) {
      c = next
      font = getComputedStyle(document.body).fontFamily
      restyle()
    },
    highlight(key) {
      highlighted = key
      restyle()
    },
    redraw() {
      sigma?.scheduleRender()
    },
    resize() {
      sigma?.resize()
      // Held: fit the frame to the new size; the next frame drawn keeps it again (afterRender).
      if (holding) sigma?.setCustomBBox(null)
      sigma?.scheduleRender()
    },
    update() {
      restyle()
    },
    holdFrame(on) {
      holding = on
      // On: the next frame drawn keeps its frame (afterRender). Off: the next layout frame refits.
      if (!on) sigma?.setCustomBBox(null)
      else sigma?.scheduleRender()
    },
    focus(key) {
      const s = sigma
      if (!s) return
      s.refresh()
      const d = s.getNodeDisplayData(key)
      if (!d) return
      const camera = s.getCamera()
      camera.setState({ x: d.x, y: d.y, ratio: Math.min(camera.ratio, 0.25) })
    },
    pan(dx, dy) {
      const s = sigma
      if (!s) return
      const { width, height } = s.getDimensions()
      const to = s.viewportToFramedGraph({ x: width / 2 + (dx * width) / 10, y: height / 2 + (dy * height) / 10 })
      s.getCamera().setState({ x: to.x, y: to.y })
    },
    zoom(factor) {
      const camera = sigma?.getCamera()
      camera?.setState({ ratio: camera.getBoundedRatio(camera.ratio / factor) })
    },
    fit() {
      // Frame the dots as they are now; when held, the next frame drawn keeps that frame again (afterRender).
      sigma?.setCustomBBox(null)
      sigma?.getCamera().setState({ x: 0.5, y: 0.5, ratio: 1, angle: 0 })
      sigma?.scheduleRefresh()
    },
    kill() {
      gate.dispose()
      container.removeEventListener('mousedown', press, true)
      container.removeEventListener('wheel', moved, true)
      window.removeEventListener('mouseup', release, true)
      sigma?.kill()
      sigma = null
    },
  }
}
