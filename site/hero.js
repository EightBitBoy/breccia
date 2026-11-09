// The hero: shards of the page colours drift in from all sides, snap together into one stone, and the stone
// resolves into the journal screenshot. Then the frame shards follow the pointer a little. Nothing moves with
// reduced motion; without JavaScript the page shows the assembled stone (site.css).
import { colorFor, inset, parallax, scatter, tiles } from './shards.js'

const SEED = 665
const COLS = 6
const ROWS = 4
const JITTER = 0.35
const FLY = 900 // ms, each shard's flight
const STAGGER = 300 // ms, from the first shard's start to the last's
const SETTLE = 150 // ms, from the last landing to the fade
const FADE = 500 // ms, mosaic out, screenshot in
const SWEEP = 200 // ms of the fade that sweeps across the mosaic, top-left first
const SEAM = 2 // px, the dark seams between the tiles: the cement of the stone
const EASE = 'cubic-bezier(.2, 1.3, .4, 1)'
const PULL = 8 // px, the most a frame shard follows the pointer

const root = document.documentElement
const hero = document.querySelector('.hero')
const stone = hero && hero.querySelector('.stone')
const img = stone && stone.querySelector('img.shot')
const shards = stone ? [...stone.querySelectorAll('.frame .shard')] : []
const still = matchMedia('(prefers-reduced-motion: reduce)').matches

const polygon = (q) => `polygon(${q.map(([x, y]) => `${x.toFixed(3)}% ${y.toFixed(3)}%`).join(', ')})`

/** The CSS fallback that shows the screenshot after 2.5 s (site.css, hero-reveal). */
function reveal() {
  return img.getAnimations ? img.getAnimations().find((a) => a.animationName === 'hero-reveal') : undefined
}

function assemble() {
  stone.classList.add('assembling')
  const layer = document.createElement('div')
  layer.className = 'tiles'
  layer.setAttribute('aria-hidden', 'true')
  stone.append(layer)
  const box = layer.getBoundingClientRect()
  const centre = stone.getBoundingClientRect()
  const cx0 = centre.left + centre.width / 2
  const cy0 = centre.top + centre.height / 2

  const items = []
  tiles(COLS, ROWS, JITTER, SEED).forEach((q, i) => {
    const el = document.createElement('span')
    const cx = q.reduce((s, p) => s + p[0], 0) / q.length
    const cy = q.reduce((s, p) => s + p[1], 0) / q.length
    el.style.setProperty('--c', `var(--pc-${colorFor(i, SEED)})`)
    el.style.setProperty('--a', `${Math.round(100 + ((i * 47) % 90))}deg`)
    el.style.transformOrigin = `${cx}% ${cy}%`
    el.style.clipPath = polygon(inset(q, box.width, box.height, SEAM / 2))
    layer.append(el)
    const x = box.left + (cx / 100) * box.width
    const y = box.top + (cy / 100) * box.height
    items.push({ el, tile: true, x, y, sweep: (cx + cy) / 200 })
  })
  for (const el of shards) {
    const r = el.getBoundingClientRect()
    items.push({ el, x: r.left + r.width / 2, y: r.top + r.height / 2 })
  }

  // Each shard comes from its own side of the stone: rank by the angle around the stone's centre.
  const angle = (it) => (Math.atan2(it.y - cy0, it.x - cx0) + Math.PI * 2) % (Math.PI * 2)
  const ranked = [...items].sort((a, b) => angle(a) - angle(b))
  const n = ranked.length
  ranked.forEach((it, k) => {
    const s = scatter(k, n, SEED)
    it.el.style.transform = `translate(${(s.x * innerWidth).toFixed(1)}px, ${(s.y * innerHeight).toFixed(1)}px) rotate(${s.r.toFixed(1)}deg)`
    it.el.style.opacity = '0'
  })
  // Start order: a seeded shuffle, spread evenly over STAGGER.
  const order = items.map((it, i) => ({ it, key: scatter(i, n, SEED + 1).r }))
  order.sort((a, b) => a.key - b.key)
  order.forEach(({ it }, k) => {
    it.delay = Math.round((k / Math.max(1, n - 1)) * STAGGER)
  })

  root.classList.remove('hero-intro')
  void stone.offsetWidth // the start state is computed before the transitions are set
  const fallback = reveal()
  if (fallback) fallback.currentTime = 0 // the 2.5 s fallback counts from here

  requestAnimationFrame(() => {
    for (const it of items) {
      const d = `${it.delay}ms`
      it.el.style.transition =
        `transform ${FLY}ms ${EASE} ${d}, opacity ${Math.round(FLY * 0.45)}ms ease-out ${d}`
      it.el.style.transform = it.tile ? 'none' : ''
      it.el.style.opacity = ''
    }
    const landed = STAGGER + FLY
    // The snap: as the last shards settle into their places, the stone gives a small jolt and a glint.
    setTimeout(() => {
      if (!layer.animate) return
      layer.animate(
        [
          { transform: 'scale(1)', filter: 'brightness(1)' },
          { transform: 'scale(1.012)', filter: 'brightness(1.16)', offset: 0.3 },
          { transform: 'scale(1)', filter: 'brightness(1)' },
        ],
        { duration: 360, easing: 'ease-out' },
      )
    }, STAGGER + Math.round(FLY * 0.55))
    // The stone resolves into the journal: the mosaic fades in a sweep while the screenshot fades in.
    setTimeout(() => {
      stone.classList.add('resolving')
      for (const it of items) {
        if (!it.tile) continue
        const d = Math.round(it.sweep * SWEEP)
        it.el.style.transition = `opacity ${FADE - SWEEP}ms ease-in-out ${d}ms`
        it.el.style.opacity = '0'
      }
    }, landed + SETTLE)
    setTimeout(() => {
      layer.remove()
      stone.classList.remove('assembling', 'resolving')
      for (const el of shards) {
        el.style.transition = ''
        el.style.transform = ''
        el.style.opacity = ''
      }
    }, landed + SETTLE + FADE)
  })
}

/** Frame shards lean toward the pointer, the deeper ones (--d) more. Never the screenshot. */
function follow() {
  const depth = shards.map((el) => parseFloat(el.style.getPropertyValue('--d')) || 0.5)
  let last = null
  let frame = 0
  const apply = () => {
    frame = 0
    if (stone.classList.contains('assembling')) return
    const r = hero.getBoundingClientRect()
    shards.forEach((el, i) => {
      const p = last ? parallax(last.x - r.left, last.y - r.top, r.width, r.height, depth[i], PULL) : { x: 0, y: 0 }
      el.style.transition = 'transform 450ms cubic-bezier(.2, .8, .3, 1)'
      el.style.transform = p.x || p.y ? `translate(${p.x.toFixed(2)}px, ${p.y.toFixed(2)}px)` : ''
    })
  }
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(apply)
  }
  hero.addEventListener('pointermove', (e) => {
    last = { x: e.clientX, y: e.clientY }
    schedule()
  })
  hero.addEventListener('pointerleave', () => {
    last = null
    schedule()
  })
}

if (stone && img && !still) {
  const fallback = reveal()
  // Too late (the fallback is about to show the stone, or did): skip the assembly.
  if (fallback && fallback.currentTime !== null && fallback.currentTime > 1800) root.classList.remove('hero-intro')
  else assemble()
  if (matchMedia('(pointer: fine)').matches) follow()
} else {
  root.classList.remove('hero-intro')
}
