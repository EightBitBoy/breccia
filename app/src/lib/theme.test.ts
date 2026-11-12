import { expect, test } from 'vitest'
import { THEMES, THEME_CHOICES, applyTheme, parseTheme, storedTheme, windowTheme } from './theme'
import { DEFAULT_VIVID, MAX_VIVID, MIN_VIVID, PAGE_COLORS, PAGE_COLOR_ROWS } from './pageColors'
import {
  CUSTOM_CHROMA,
  customShade,
  hueTrack,
  readThemeTokens,
  ruleShade,
  swatchValue,
  vividTrack,
  washValue,
  type ThemeTokens,
} from './customColor'

import tokensCss from '../styles/tokens.css?raw'

const css = tokensCss

/** Custom properties of a block, in a name -> value map. */
function props(body: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim()
  return out
}
function block(selector: string): Record<string, string> {
  const start = css.indexOf(selector + ' {')
  expect(start, selector).toBeGreaterThanOrEqual(0)
  const open = css.indexOf('{', start)
  return props(css.slice(open + 1, css.indexOf('}', open)))
}

const selectorOf = (t: string): string => (t === 'light' ? ':root, [data-theme="light"]' : `[data-theme="${t}"]`)

test('every theme defines every token', () => {
  const light = block(':root, [data-theme="light"]')
  const names = Object.keys(light).sort()
  expect(names.length).toBeGreaterThan(20)
  for (const t of THEMES) {
    expect(Object.keys(block(selectorOf(t))).sort(), t).toEqual(names)
  }
  const media = block(':root:not([data-theme])')
  expect(media).toEqual(block('[data-theme="dark"]'))
  expect(block('[data-theme="violet"]')['--bg']).toBe('#1e1a2c')
  expect(block('[data-theme="violet"]')['--c-violet']).toBe('#8fd0ff')
  expect(block('[data-theme="graphite"]')['--bg']).toBe('#2c2f33')
  // the teal theme's two surfaces: the main view and the sidebar
  expect(block('[data-theme="teal"]')['--bg']).toBe('#002b36')
  expect(block('[data-theme="teal"]')['--side']).toBe('#023643')
})

function luminance(hex: string): number {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`not a #rrggbb colour: ${hex}`)
  const ch = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}

test('luminance rejects short colours', () => {
  expect(() => luminance('#fff')).toThrow()
})

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

test('faded is visible but quieter than text in every theme', () => {
  const sels = [...THEMES.map(selectorOf), ':root:not([data-theme])']
  for (const s of sels) {
    const b = block(s)
    const faded = contrast(b['--faded'], b['--bg'])
    expect(faded, s).toBeGreaterThan(1.7)
    expect(faded, s).toBeLessThan(2.4)
    expect(faded, s).toBeGreaterThan(contrast(b['--line'], b['--bg']))
  }
})

const sources = import.meta.glob('/src/**/*.{css,svelte,ts}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

test('no colour literals outside tokens', () => {
  const funcs = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\(/
  const hex = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/
  // a named colour as a value of a colour property
  const named =
    /\b(?:color|background(?:-color)?|border(?:-[a-z]+)?|fill|stroke|outline(?:-color)?)\s*:\s*(?:[^;{}]*\s)?(?:white|black|red|blue|green|gray|grey)\b(?!-)/
  const files = Object.entries(sources).filter(
    ([p]) => !/\.(test|bench)\.ts$/.test(p) && !p.endsWith('/styles/tokens.css'),
  )
  expect(files.length).toBeGreaterThan(20)
  const hits: string[] = []
  for (const [p, text] of files) {
    text.split('\n').forEach((l, i) => {
      if (hex.test(l) || funcs.test(l) || named.test(l)) hits.push(`${p}:${i + 1}: ${l.trim()}`)
    })
  }
  expect(hits).toEqual([])
})

test('parseTheme', () => {
  expect(parseTheme('violet')).toBe('violet')
  expect(parseTheme('ember')).toBe('ember')
  expect(parseTheme('pink')).toBe('system')
  expect(parseTheme(null)).toBe('system')
  expect(parseTheme(3)).toBe('system')
})

test('light themes come first in the list', () => {
  const kinds = THEMES.map((t) => windowTheme(t))
  expect(kinds.indexOf('dark')).toBe(kinds.filter((k) => k === 'light').length)
  expect(kinds.lastIndexOf('light')).toBeLessThan(kinds.indexOf('dark'))
})

test('THEME_CHOICES is System then every theme', () => {
  expect(THEME_CHOICES).toEqual(['system', ...THEMES])
})

test('windowTheme and storedTheme', () => {
  const light = THEMES.filter((t) => windowTheme(t) === 'light')
  expect(light).toEqual(['light', 'taupe', 'parchment'])
  for (const t of THEMES) expect(['light', 'dark'], t).toContain(windowTheme(t))
  expect(windowTheme('system')).toBeNull()
  expect(storedTheme('system')).toBeNull()
  expect(storedTheme('taupe')).toBe('taupe')
})

test('applyTheme sets or clears the attribute and the window theme', async () => {
  const root: { dataset: DOMStringMap } = { dataset: {} }
  const calls: unknown[] = []
  applyTheme('taupe', root, async (t) => void calls.push(t))
  expect(root.dataset.theme).toBe('taupe')
  applyTheme('system', root, async (t) => void calls.push(t))
  expect('theme' in root.dataset).toBe(false)
  expect(calls).toEqual(['light', null])
  const errs: unknown[] = []
  const orig = console.error
  console.error = (...a: unknown[]) => void errs.push(a)
  try {
    expect(() => applyTheme('dark', root, () => Promise.reject(new Error('x')))).not.toThrow()
    await new Promise((r) => setTimeout(r, 0))
  } finally {
    console.error = orig
  }
  expect(errs.length).toBe(1)
})

// ---- page colors ----

const THEME_SELECTORS = [...THEMES.map(selectorOf), ':root:not([data-theme])']

function rgb(hex: string): number[] {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`not a #rrggbb colour: ${hex}`)
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
}

/** A straight sRGB alpha blend of `fg` over `bg`, rounded to #rrggbb. */
function over(fg: string, bg: string, alpha: number): string {
  const f = rgb(fg)
  const b = rgb(bg)
  return '#' + f.map((v, i) => Math.round(v * alpha + b[i] * (1 - alpha)).toString(16).padStart(2, '0')).join('')
}

function oklab(hex: string): number[] {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

function distance(a: string, b: string): number {
  const [x, y] = [oklab(a), oklab(b)]
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2])
}

test('page colors have a shade in every theme', () => {
  for (const s of THEME_SELECTORS) {
    const b = block(s)
    expect(b['--pc-wash'], s).toMatch(/^\d+%$/)
    const shades = PAGE_COLORS.map((n) => {
      expect(b[`--pc-${n}`], `${s} ${n}`).toMatch(/^#[0-9a-f]{6}$/)
      return b[`--pc-${n}`]
    })
    expect(new Set(shades).size, s).toBe(PAGE_COLORS.length)
  }
  for (const n of PAGE_COLORS) {
    expect(css, n).toContain(`--pc-${n}-wash: color-mix(in srgb, var(--pc-${n}) var(--pc-wash), var(--bg));`)
  }
})

/** The wash of a page color over the theme's background. */
function washes(s: string): Record<string, string> {
  const b = block(s)
  const alpha = parseInt(b['--pc-wash'], 10) / 100
  return Object.fromEntries(PAGE_COLORS.map((n) => [n, over(b[`--pc-${n}`], b['--bg'], alpha)]))
}

test('page color washes keep text readable', () => {
  for (const s of THEME_SELECTORS) {
    const b = block(s)
    for (const [n, w] of Object.entries(washes(s))) {
      expect(contrast(b['--text'], w), `${s} ${n} text`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(b['--link'], w), `${s} ${n} link`).toBeGreaterThanOrEqual(3)
      expect(contrast(b['--tag'], w), `${s} ${n} tag`).toBeGreaterThanOrEqual(3)
    }
  }
})

test('neighbouring page colors differ', () => {
  for (const s of THEME_SELECTORS) {
    const b = block(s)
    const w = washes(s)
    PAGE_COLOR_ROWS.forEach((row, y) =>
      row.forEach((n, x) => {
        const neighbours = [PAGE_COLOR_ROWS[y][x + 1], PAGE_COLOR_ROWS[y + 1]?.[x]].filter(Boolean)
        for (const o of neighbours) {
          expect(distance(w[n], w[o]), `${s} wash ${n}/${o}`).toBeGreaterThanOrEqual(0.008)
          expect(distance(b[`--pc-${n}`], b[`--pc-${o}`]), `${s} shade ${n}/${o}`).toBeGreaterThanOrEqual(0.025)
        }
      }),
    )
  }
})

// ---- custom page colors ----

const PARAMS: Record<string, [number, number, number]> = {
  ':root, [data-theme="light"]': [0.66, 1, 1],
  '[data-theme="taupe"]': [0.71, 0.8, 0.8],
  '[data-theme="parchment"]': [0.71, 0.8, 0.8],
  '[data-theme="ember"]': [0.64, 0.85, 0.6],
  '[data-theme="oxblood"]': [0.64, 0.85, 0.6],
  '[data-theme="fjord"]': [0.62, 0.7, 0.6],
  '[data-theme="vampire"]': [0.66, 0.95, 0.6],
  '[data-theme="dark"]': [0.66, 0.9, 0.6],
  '[data-theme="violet"]': [0.68, 0.9, 0.6],
  '[data-theme="graphite"]': [0.62, 0.75, 0.6],
  '[data-theme="teal"]': [0.43, 0.9, 0.4],
  ':root:not([data-theme])': [0.66, 0.9, 0.6],
}

function tokensOf(s: string): ThemeTokens {
  const b = block(s)
  return readThemeTokens((n) => b[n] ?? '')
}

/** [L, C, h in degrees] of a #rrggbb colour. */
function lchOf(hex: string): [number, number, number] {
  const [l, a, b] = oklab(hex)
  return [l, Math.hypot(a, b), ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360]
}

function near(a: string, b: string, tol = 1): boolean {
  const [x, y] = [rgb(a), rgb(b)]
  return x.every((v, i) => Math.abs(v - y[i]) <= tol)
}

test('theme blocks carry the shade parameters', () => {
  expect(Object.keys(PARAMS).sort()).toEqual([...THEME_SELECTORS].sort())
  for (const s of THEME_SELECTORS) {
    const b = block(s)
    expect([b['--pc-l'], b['--pc-cs'], b['--pc-ds']].map(Number), s).toEqual(PARAMS[s])
  }
})

test('the shade rule reproduces the 25 fixed shades', () => {
  const light = block(THEME_SELECTORS[0])
  for (const s of THEME_SELECTORS) {
    const t = tokensOf(s)
    const b = block(s)
    for (const n of PAGE_COLORS) {
      const [l, c, h] = lchOf(light[`--pc-${n}`])
      const dl = l - 0.66
      const got = ruleShade(t.l + dl * t.ds, c * t.cs, h).hex
      expect(near(got, b[`--pc-${n}`]), `${s} ${n}: ${got} vs ${b[`--pc-${n}`]}`).toBe(true)
    }
  }
})

test('custom shades: pinned values', () => {
  const light = tokensOf(THEME_SELECTORS[0])
  const teal = tokensOf('[data-theme="teal"]')
  const dark = tokensOf('[data-theme="dark"]')
  const pins: [ThemeTokens, number, string, string][] = [
    [light, 212, '#08a4bb', '#b7e2e7'],
    [light, 0, '#d16e8f', '#efd3db'],
    [teal, 212, '#005a68', '#003945'],
    [dark, 100, '#a39332', '#494424'],
  ]
  for (const [t, h, shade, wash] of pins) {
    const r = customShade(h, t)
    expect(near(r.shade, shade), `hue ${h} shade ${r.shade}`).toBe(true)
    expect(near(r.wash, wash), `hue ${h} wash ${r.wash}`).toBe(true)
  }
})

test('every custom hue is readable in every theme', () => {
  const lowest: string[] = []
  for (const s of THEME_SELECTORS) {
    const t = tokensOf(s)
    let min = t.wash
    for (let h = 0; h < 360; h++) {
      const r = customShade(h, t)
      expect(r.shade, `${s} hue ${h}`).toMatch(/^#[0-9a-f]{6}$/)
      expect(r.wash, `${s} hue ${h} wash`).toBe(r.strength === 0 ? t.bg : over(r.shade, t.bg, r.strength))
      expect(contrast(t.text, r.wash), `${s} hue ${h} text`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(t.link, r.wash), `${s} hue ${h} link`).toBeGreaterThanOrEqual(3)
      expect(contrast(t.tag, r.wash), `${s} hue ${h} tag`).toBeGreaterThanOrEqual(3)
      expect(r.strength, `${s} hue ${h} strength`).toBeLessThanOrEqual(t.wash)
      min = Math.min(min, r.strength)
    }
    lowest.push(`${Math.round(min * 100)}/${Math.round(t.wash * 100)}`)
  }
  // lowest wash strength needed / the theme's strength, in theme order (for re-tuning; no bar)
  console.info(`custom hue lowest wash strength per theme: ${lowest.join(' ')}`)
})

test('custom shades step down only when needed', () => {
  const light = tokensOf(THEME_SELECTORS[0])
  const white = { ...light, bg: '#ffffff' }
  const plain = customShade(212, light)
  expect(plain.strength).toBe(0.28)
  expect(plain.chroma).toBe(ruleShade(0.66, 0.13, 212).chroma)
  const stepped = customShade(212, { ...white, text: '#686868' })
  expect(stepped.strength).toBe(0.2)
  expect(stepped.chroma).toBe(plain.chroma)
  for (const text of ['#767676', '#787878']) {
    // 4.54:1 and 4.42:1 on white: no wash can help, the bare background is the answer
    const r = customShade(212, { ...white, text })
    expect(r.strength, text).toBe(0)
    expect(r.wash, text).toBe('#ffffff')
  }
})

test('vivid shades: pinned values', () => {
  const light = tokensOf(THEME_SELECTORS[0])
  const teal = tokensOf('[data-theme="teal"]')
  const dark = tokensOf('[data-theme="dark"]')
  const pins: [ThemeTokens, number, number, string, string, number, boolean][] = [
    [light, 212, 50, '#619da9', '#e5eded', 0.14, false],
    [light, 212, 100, '#08a4bb', '#b7e2e7', 0.28, false],
    [light, 212, 150, '#00a4bb', '#92d6de', 0.42, false],
    [light, 212, 200, '#08a4bb', '#95d6de', 0.42, true],
    [dark, 100, 200, '#a69306', '#695e10', 0.56, true],
    [teal, 212, 150, '#055a67', '#023c48', 0.37, true],
  ]
  for (const [t, h, v, shade, wash, strength, limited] of pins) {
    const r = customShade(h, t, v)
    expect(near(r.shade, shade), `hue ${h} vivid ${v} shade ${r.shade}`).toBe(true)
    expect(near(r.wash, wash), `hue ${h} vivid ${v} wash ${r.wash}`).toBe(true)
    expect(r.strength, `hue ${h} vivid ${v} strength`).toBe(strength)
    expect(r.limited, `hue ${h} vivid ${v} limited`).toBe(limited)
  }
})

/** FNV-1a of a string, as hex. */
function fnv(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16)
}

/** Digest of customShade(h, t, vivid) for hues 0..359; a fresh token object bypasses the memo. */
function shadeDigest(s: string, vivid?: number): string {
  const t = { ...tokensOf(s) }
  let all = ''
  for (let h = 0; h < 360; h++) {
    const r = vivid === undefined ? customShade(h, t) : customShade(h, t, vivid)
    all += `${h}:${r.shade}${r.wash}${r.strength}:${r.chroma};`
  }
  return fnv(all)
}

// Digests of plan 2's customShade(h, t) per theme block, taken before vividness existed (plan 3, R4).
const TODAYS_SHADES: Record<string, string> = {
  ':root, [data-theme="light"]': '3c5fa875',
  '[data-theme="dark"]': 'd47bf017',
  '[data-theme="violet"]': 'c5f5959a',
  '[data-theme="graphite"]': 'ebb31daa',
  '[data-theme="taupe"]': '83a5b0a9',
  '[data-theme="parchment"]': '93d51a9d',
  '[data-theme="ember"]': '69a10b74',
  '[data-theme="oxblood"]': '4126c6ef',
  '[data-theme="fjord"]': '84005bd8',
  '[data-theme="vampire"]': 'dfd317f',
  '[data-theme="teal"]': 'd7f75c44',
  ':root:not([data-theme])': 'd47bf017',
}

test("vividness 100 is today's look", () => {
  expect(Object.keys(TODAYS_SHADES).sort()).toEqual([...THEME_SELECTORS].sort())
  THEME_SELECTORS.forEach((s) => {
    expect(shadeDigest(s, 100), `${s} explicit 100`).toBe(TODAYS_SHADES[s])
    expect(shadeDigest(s), `${s} default`).toBe(TODAYS_SHADES[s])
    const t = tokensOf(s)
    for (let h = 0; h < 360; h++) {
      expect(customShade(h, t, 100), `${s} hue ${h}`).toEqual(customShade(h, t))
      expect(customShade(h, t, 100).limited, `${s} hue ${h} limited`).toBe(false)
    }
  })
})

test('every vividness is readable in every theme', () => {
  for (const s of THEME_SELECTORS) {
    const t = tokensOf(s)
    const P = Math.round(t.wash * 100)
    for (let v = MIN_VIVID; v <= MAX_VIVID; v += 5) {
      const T = Math.round((P * v) / 100) / 100
      for (let h = 0; h < 360; h++) {
        const r = customShade(h, t, v)
        const at = `${s} hue ${h} vivid ${v}`
        if (r.strength !== 0) expect(r.wash, `${at} wash`).toBe(over(r.shade, t.bg, r.strength))
        expect(contrast(t.text, r.wash), `${at} text`).toBeGreaterThanOrEqual(4.5)
        expect(contrast(t.link, r.wash), `${at} link`).toBeGreaterThanOrEqual(3)
        expect(contrast(t.tag, r.wash), `${at} tag`).toBeGreaterThanOrEqual(3)
        expect(r.strength, `${at} strength`).toBeLessThanOrEqual(T)
        const gamut = ruleShade(t.l, CUSTOM_CHROMA * t.cs * (v / DEFAULT_VIVID), h).chroma
        expect(r.limited, `${at} limited`).toBe(r.strength < T || r.chroma < gamut)
        if (v <= 100) expect(r.limited, `${at} limited at or below 100`).toBe(false)
      }
    }
  }
  // Over 200,000 shades: about 2 s alone, over 5 s while the whole suite runs in parallel.
}, 60_000)

test('the readability guard is reported as limited', () => {
  const light = tokensOf(THEME_SELECTORS[0])
  expect(customShade(212, light, 100).limited).toBe(false)
  const r = customShade(212, { ...light, bg: '#ffffff', text: '#686868' }, 100)
  expect(r.limited).toBe(true)
  expect(r.strength).toBe(0.2)
})

test('washValue and swatchValue with a vividness', () => {
  const light = tokensOf(THEME_SELECTORS[0])
  expect(near(washValue('hue 212 vivid 150', light) ?? '', '#92d6de')).toBe(true)
  expect(swatchValue('hue 212 vivid 50', light)).toBe(customShade(212, light, 50).shade)
  expect(washValue('hue 212 vivid 300', light)).toBeUndefined()
  expect(DEFAULT_VIVID).toBe(100)
})

test('tracks', () => {
  const light = tokensOf(THEME_SELECTORS[0])
  const v = vividTrack(212, light)
  expect(v.startsWith('linear-gradient(to right, ')).toBe(true)
  expect(v.match(/#/g)?.length).toBe(7)
  expect(v.slice('linear-gradient(to right, '.length).startsWith(customShade(212, light, 50).wash)).toBe(true)
  expect(hueTrack(light, 50)).not.toBe(hueTrack(light))
  expect(hueTrack(light, 100)).toBe(hueTrack(light))
})

test('readThemeTokens', () => {
  const t = tokensOf(THEME_SELECTORS[0])
  expect(t.bg).toBe('#fbfaf8')
  expect(t.wash).toBe(0.28)
  expect(t.l).toBe(0.66)
  const b = block(THEME_SELECTORS[0])
  expect(() => readThemeTokens((n) => (n === '--pc-l' ? '' : b[n]))).toThrow('--pc-l')
})

test('washValue and swatchValue', () => {
  const light = tokensOf(THEME_SELECTORS[0])
  expect(washValue('red', null)).toBe('var(--pc-red-wash)')
  expect(swatchValue('red', null)).toBe('var(--pc-red)')
  expect(washValue('hue 212', null)).toBeUndefined()
  expect(washValue('hue 212', light)).toBe('#b7e2e7')
  expect(washValue('banana', light)).toBeUndefined()
  const track = hueTrack(light)
  expect(track.startsWith('linear-gradient(to right, ')).toBe(true)
  expect(track.match(/#/g)?.length).toBe(13)
})

test('the literal scan still covers the shade code', () => {
  expect(Object.keys(sources)).toContain('/src/lib/customColor.ts')
})
