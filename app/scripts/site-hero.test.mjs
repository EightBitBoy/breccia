// The hero's pure geometry and colour choice (site/shards.js).
import { describe, expect, it } from 'vitest'
import { colorFor, inset, parallax, rng, scatter, tiles } from '../../site/shards.js'

const NAMES = [
  'crimson', 'red', 'coral', 'orange', 'amber', 'yellow', 'olive', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky',
  'blue', 'indigo', 'violet', 'purple', 'magenta', 'pink', 'rose', 'brown', 'tan', 'sand', 'slate', 'grey',
]

const area = (q) => {
  let s = 0
  for (let i = 0; i < q.length; i++) {
    const [x1, y1] = q[i]
    const [x2, y2] = q[(i + 1) % q.length]
    s += x1 * y2 - x2 * y1
  }
  return Math.abs(s) / 2
}

describe('shards', () => {
  it('rng_is_deterministic_and_in_range', () => {
    const a = rng(42)
    const b = rng(42)
    const c = rng(43)
    const xs = Array.from({ length: 1000 }, () => a())
    const ys = Array.from({ length: 1000 }, () => b())
    const zs = Array.from({ length: 1000 }, () => c())
    expect(xs).toEqual(ys)
    expect(xs).not.toEqual(zs)
    for (const x of xs) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(1)
    }
    expect(new Set(xs).size).toBeGreaterThan(990)
  })

  it('tiles_cover_the_box_and_share_corners', () => {
    for (const seed of [1, 7, 2026]) {
      const qs = tiles(6, 4, 0.35, seed)
      expect(qs).toHaveLength(24)
      const uses = new Map()
      for (const q of qs) {
        expect(q).toHaveLength(4)
        for (const [x, y] of q) {
          expect(x).toBeGreaterThanOrEqual(0)
          expect(x).toBeLessThanOrEqual(100)
          expect(y).toBeGreaterThanOrEqual(0)
          expect(y).toBeLessThanOrEqual(100)
          const key = `${x},${y}`
          uses.set(key, (uses.get(key) ?? 0) + 1)
        }
      }
      // 7 x 5 grid points: 35 distinct corners, the 4 box corners used once
      expect(uses.size).toBe(35)
      let inner = 0
      for (const [key, n] of uses) {
        const [x, y] = key.split(',').map(Number)
        const onX = x === 0 || x === 100
        const onY = y === 0 || y === 100
        if (onX && onY) expect(n).toBe(1)
        else if (onX || onY) expect(n).toBe(2)
        else {
          expect(n).toBe(4)
          inner++
        }
      }
      expect(inner).toBe(15)
      const total = qs.reduce((s, q) => s + area(q), 0)
      expect(Math.abs(total - 10000)).toBeLessThan(1e-6)
    }
  })

  it('tiles_jitter_is_bounded', () => {
    const cols = 6
    const rows = 4
    const cw = 100 / cols
    const ch = 100 / rows
    let moved = 0
    for (const seed of [1, 7, 2026]) {
      const qs = tiles(cols, rows, 0.35, seed)
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          // quad corners in order: top-left, top-right, bottom-right, bottom-left
          const q = qs[r * cols + c]
          const grid = [[c, r], [c + 1, r], [c + 1, r + 1], [c, r + 1]]
          q.forEach(([x, y], k) => {
            const [gc, gr] = grid[k]
            expect(Math.abs(x - gc * cw)).toBeLessThanOrEqual(0.35 * cw + 1e-9)
            expect(Math.abs(y - gr * ch)).toBeLessThanOrEqual(0.35 * ch + 1e-9)
            if (x !== gc * cw || y !== gr * ch) moved++
          })
        }
      }
    }
    expect(moved).toBeGreaterThan(0)
  })

  it('scatter_starts_every_shard_away_and_in_bounds', () => {
    const n = 40
    const all = Array.from({ length: n }, (_, i) => scatter(i, n, 9))
    for (const s of all) {
      expect(Math.hypot(s.x, s.y)).toBeGreaterThanOrEqual(0.4)
      expect(Math.abs(s.x)).toBeLessThanOrEqual(1.2)
      expect(Math.abs(s.y)).toBeLessThanOrEqual(1.2)
      expect(Math.abs(s.r)).toBeLessThanOrEqual(120)
    }
    expect(Array.from({ length: n }, (_, i) => scatter(i, n, 9))).toEqual(all)
    expect(new Set(all.map((s) => `${s.x},${s.y}`)).size).toBe(n)
  })

  it('parallax_is_zero_at_the_centre_and_clamped', () => {
    expect(parallax(50, 30, 100, 60, 0.5, 8)).toEqual({ x: 0, y: 0 })
    expect(parallax(0, 0, 100, 60, 0.5, 8)).toEqual({ x: -4, y: -4 })
    expect(parallax(100, 60, 100, 60, 0.5, 8)).toEqual({ x: 4, y: 4 })
    expect(parallax(-500, -900, 100, 60, 0.5, 8)).toEqual({ x: -4, y: -4 })
    expect(parallax(900, 900, 100, 60, 1, 8)).toEqual({ x: 8, y: 8 })
    expect(parallax(75, 30, 100, 60, 1, 8)).toEqual({ x: 4, y: 0 })
  })

  it('colorFor_uses_page_colors_and_never_repeats', () => {
    for (const seed of [1, 5, 77]) {
      const cs = Array.from({ length: 200 }, (_, i) => colorFor(i, seed))
      for (const c of cs) expect(NAMES).toContain(c)
      for (let i = 1; i < cs.length; i++) expect(cs[i]).not.toBe(cs[i - 1])
      expect(new Set(cs).size).toBeGreaterThan(15)
    }
  })

  it('inset_moves_every_edge_inwards_by_the_gap', () => {
    // a 100 x 100 percent quad drawn in a 200 x 100 px box, inset by 2 px
    const q = [[0, 0], [100, 0], [100, 100], [0, 100]]
    const out = inset(q, 200, 100, 2)
    expect(out).toHaveLength(4)
    const px = out.map(([x, y]) => [(x / 100) * 200, (y / 100) * 100])
    expect(px[0][0]).toBeCloseTo(2, 9)
    expect(px[0][1]).toBeCloseTo(2, 9)
    expect(px[2][0]).toBeCloseTo(198, 9)
    expect(px[2][1]).toBeCloseTo(98, 9)
    // a jittered quad shrinks but keeps its corner order and stays inside the original
    const j = tiles(6, 4, 0.35, 3)[8]
    const ji = inset(j, 930, 580, 1.5)
    expect(area(ji)).toBeLessThan(area(j))
    expect(area(ji)).toBeGreaterThan(area(j) * 0.8)
  })
})
