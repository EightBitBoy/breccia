// Pure geometry and colour choice for the hero's assembly (hero.js). No DOM here, so the tests can run in Node.

/** The 25 page colours of the app, in its order (site.css has a --pc-<name> for each). */
export const COLORS = [
  'crimson', 'red', 'coral', 'orange', 'amber', 'yellow', 'olive', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky',
  'blue', 'indigo', 'violet', 'purple', 'magenta', 'pink', 'rose', 'brown', 'tan', 'sand', 'slate', 'grey',
]

/** mulberry32: a small seeded generator. Same seed, same sequence; values in [0, 1). */
export function rng(seed) {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A generator for item i of a seeded set, so each item's values do not depend on how many came before. */
function stream(i, seed) {
  return rng(Math.imul(seed >>> 0, 0x9e3779b1) ^ Math.imul(i + 1, 0x85ebca6b))
}

/**
 * cols x rows quads covering a 100 x 100 box, from one jittered grid of (cols + 1) x (rows + 1) points.
 * Border points slide along the border only, inner points move by at most `jitter` of a cell, so neighbouring
 * quads share corners exactly. Each quad is [top-left, top-right, bottom-right, bottom-left], row by row.
 */
export function tiles(cols, rows, jitter, seed) {
  const next = rng(seed)
  const cw = 100 / cols
  const ch = 100 / rows
  const shift = () => (next() * 2 - 1) * jitter
  const pts = []
  for (let r = 0; r <= rows; r++) {
    const line = []
    for (let c = 0; c <= cols; c++) {
      let x = c * cw
      let y = r * ch
      const dx = shift() * cw
      const dy = shift() * ch
      if (c > 0 && c < cols) x += dx
      if (r > 0 && r < rows) y += dy
      line.push([x, y])
    }
    pts.push(line)
  }
  const out = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) out.push([pts[r][c], pts[r][c + 1], pts[r + 1][c + 1], pts[r + 1][c]])
  }
  return out
}

/**
 * The start offset of shard i of n: x and y in viewport fractions within [-1.2, 1.2], at least 0.4 from the
 * place, and a rotation r in degrees within [-120, 120]. The directions go round the circle with i, so the
 * shards come from all sides.
 */
export function scatter(i, n, seed) {
  const next = stream(i, seed)
  const angle = ((i + next() * 0.8) / Math.max(1, n)) * Math.PI * 2 + next() * 0.6
  const len = 0.42 + next() * 0.5
  const clamp = (v) => Math.max(-1.2, Math.min(1.2, v))
  const x = clamp(Math.cos(angle) * len)
  const y = clamp(Math.sin(angle) * len)
  const r = (next() * 2 - 1) * 120
  return { x, y, r }
}

/** Pointer at (px, py) in a w x h box: (0, 0) at the centre, +-max * depth at the edges, clamped beyond them. */
export function parallax(px, py, w, h, depth, max) {
  const unit = (v, size) => Math.max(-1, Math.min(1, (v - size / 2) / (size / 2)))
  return { x: unit(px, w) * max * depth || 0, y: unit(py, h) * max * depth || 0 }
}

/** The page colour name for shard i: one of the 25, never the same as for i - 1. */
export function colorFor(i, seed) {
  let k = Math.floor(stream(0, seed)() * COLORS.length)
  for (let j = 1; j <= i; j++) k = (k + 1 + Math.floor(stream(j, seed)() * (COLORS.length - 1))) % COLORS.length
  return COLORS[k]
}

/**
 * A convex quad in percent of a w x h px box, with every edge moved inwards by `gap` px. Used for the seams
 * between the tiles while they fly; the seams close when the tiles snap together.
 */
export function inset(quad, w, h, gap) {
  const p = quad.map(([x, y]) => [(x / 100) * w, (y / 100) * h])
  const n = p.length
  let signed = 0
  for (let i = 0; i < n; i++) signed += p[i][0] * p[(i + 1) % n][1] - p[(i + 1) % n][0] * p[i][1]
  const s = signed >= 0 ? 1 : -1
  // each edge as a point moved inwards and a unit direction
  const edges = p.map((a, i) => {
    const b = p[(i + 1) % n]
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
    const d = [(b[0] - a[0]) / len, (b[1] - a[1]) / len]
    const nrm = [-d[1] * s, d[0] * s]
    return { o: [a[0] + nrm[0] * gap, a[1] + nrm[1] * gap], d }
  })
  return p.map((_, i) => {
    const e1 = edges[(i + n - 1) % n]
    const e2 = edges[i]
    const cross = e1.d[0] * e2.d[1] - e1.d[1] * e2.d[0]
    let x
    let y
    if (Math.abs(cross) < 1e-9) {
      x = e2.o[0]
      y = e2.o[1]
    } else {
      const t = ((e2.o[0] - e1.o[0]) * e2.d[1] - (e2.o[1] - e1.o[1]) * e2.d[0]) / cross
      x = e1.o[0] + e1.d[0] * t
      y = e1.o[1] + e1.d[1] * t
    }
    return [(x / w) * 100, (y / h) * 100]
  })
}
