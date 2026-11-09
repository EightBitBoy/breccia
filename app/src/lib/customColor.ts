// Custom page colors: a hue the user picked becomes a shade and a wash for the current theme.
// The theme gives lightness, chroma scale and wash strength (tokens); only the hue is the user's.
// Everything is computed here at runtime, so no theme colour is written down in this file.
import { DEFAULT_VIVID, MAX_VIVID, MIN_VIVID, PAGE_COLORS, VIVID_STEP, parseCustom } from './pageColors'

export interface ThemeTokens {
  bg: string
  text: string
  link: string
  tag: string
  /** The theme's wash strength, 0..1. */
  wash: number
  l: number
  cs: number
  ds: number
}

/** Chroma and lightness offset of a custom hue, between the fixed colors' ranges. */
export const CUSTOM_CHROMA = 0.13
export const CUSTOM_DL = 0

const HEX = /^#[0-9a-f]{6}$/i

function number(name: string, raw: string): number {
  const v = raw.trim() === '' ? NaN : Number(raw)
  if (!Number.isFinite(v)) throw new Error(`theme token ${name} is missing or not a number: "${raw}"`)
  return v
}

function hexToken(name: string, raw: string): string {
  const v = raw.trim()
  if (!HEX.test(v)) throw new Error(`theme token ${name} is missing or not a #rrggbb value: "${raw}"`)
  return v.toLowerCase()
}

/** Reads the theme's tokens through `get` (a custom property name to its value). */
export function readThemeTokens(get: (name: string) => string): ThemeTokens {
  const pct = /^(\d+(?:\.\d+)?)%$/.exec(get('--pc-wash').trim())
  if (pct === null) throw new Error(`theme token --pc-wash is missing or not a percentage: "${get('--pc-wash')}"`)
  return {
    bg: hexToken('--bg', get('--bg')),
    text: hexToken('--text', get('--text')),
    link: hexToken('--link', get('--link')),
    tag: hexToken('--tag', get('--tag')),
    wash: Number(pct[1]) / 100,
    l: number('--pc-l', get('--pc-l')),
    cs: number('--pc-cs', get('--pc-cs')),
    ds: number('--pc-ds', get('--pc-ds')),
  }
}

const GAMUT_EPS = 0.0001
const CHROMA_GAMUT_STEP = 0.002
const CHROMA_READ_STEP = 0.01

/** Linear sRGB of an OKLab triple (Ottosson). */
function toLinear(l: number, a: number, b: number): number[] {
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ]
}

function toSrgb(lin: number): number {
  const v = Math.min(1, Math.max(0, lin))
  return v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055
}

function hex2(v: number): string {
  return Math.round(v).toString(16).padStart(2, '0')
}

/** A shade for lightness, chroma and hue (degrees): chroma is lowered until the colour fits the sRGB gamut. */
export function ruleShade(l: number, c: number, h: number): { hex: string; chroma: number } {
  const rad = (h * Math.PI) / 180
  for (let n = 0; ; n++) {
    const chroma = Math.max(0, c - n * CHROMA_GAMUT_STEP)
    const lin = toLinear(l, chroma * Math.cos(rad), chroma * Math.sin(rad))
    if (chroma === 0 || lin.every((v) => v >= -GAMUT_EPS && v <= 1 + GAMUT_EPS)) {
      return { hex: '#' + lin.map((v) => hex2(toSrgb(v) * 255)).join(''), chroma }
    }
  }
}

function rgbOf(hex: string): number[] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
}

/** A straight sRGB blend of `fg` over `bg` at `alpha`, per channel rounded. */
function blend(fg: string, bg: string, alpha: number): string {
  const f = rgbOf(fg)
  const b = rgbOf(bg)
  return '#' + f.map((v, i) => hex2(v * alpha + b[i] * (1 - alpha))).join('')
}

function luminance(hex: string): number {
  const [r, g, b] = rgbOf(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

function readable(t: ThemeTokens, wash: string): boolean {
  return contrast(t.text, wash) >= 4.5 && contrast(t.link, wash) >= 3 && contrast(t.tag, wash) >= 3
}

export interface CustomShade {
  shade: string
  wash: string
  strength: number
  chroma: number
  /** True when readability (or nothing else) forced less than the strength and chroma the vividness asked for. */
  limited: boolean
}

const cache = new WeakMap<ThemeTokens, Map<number, CustomShade>>()

/**
 * The shade and wash of a custom hue in a theme at a vividness (50..200, 100 is the plain look). The wash
 * starts at the theme's strength scaled by the vividness and steps down to half of it, then loses chroma,
 * until text, links and tags stay readable; if nothing helps the wash is the bare background (strength 0).
 */
export function customShade(hue: number, t: ThemeTokens, vivid: number = DEFAULT_VIVID): CustomShade {
  let perTheme = cache.get(t)
  if (perTheme === undefined) cache.set(t, (perTheme = new Map()))
  const key = hue * 1000 + vivid
  const known = perTheme.get(key)
  if (known !== undefined) return known
  const result = compute(hue, t, vivid)
  perTheme.set(key, result)
  return result
}

function compute(hue: number, t: ThemeTokens, vivid: number): CustomShade {
  const l = t.l + CUSTOM_DL * t.ds
  const base = ruleShade(l, (CUSTOM_CHROMA * t.cs * vivid) / 100, hue)
  const plain = Math.round(t.wash * 100)
  const full = Math.round((plain * vivid) / 100)
  const floor = Math.ceil(Math.min(full, plain) / 2)
  for (let p = full; p >= floor; p--) {
    const wash = blend(base.hex, t.bg, p / 100)
    if (readable(t, wash)) return { shade: base.hex, wash, strength: p / 100, chroma: base.chroma, limited: p !== full }
  }
  for (let c = base.chroma - CHROMA_READ_STEP; c > 0; c -= CHROMA_READ_STEP) {
    const s = ruleShade(l, c, hue)
    const wash = blend(s.hex, t.bg, floor / 100)
    if (readable(t, wash)) return { shade: s.hex, wash, strength: floor / 100, chroma: s.chroma, limited: true }
  }
  const grey = ruleShade(l, 0, hue)
  const wash = blend(grey.hex, t.bg, floor / 100)
  if (readable(t, wash)) return { shade: grey.hex, wash, strength: floor / 100, chroma: 0, limited: true }
  return { shade: grey.hex, wash: t.bg, strength: 0, chroma: 0, limited: true }
}

/** The background of a row or page with this color: a variable for a name, a computed colour for a hue. */
export function washValue(color: string, t: ThemeTokens | null): string | undefined {
  if (PAGE_COLORS.includes(color)) return `var(--pc-${color}-wash)`
  const c = parseCustom(color)
  return c === null || t === null ? undefined : customShade(c.hue, t, c.vivid).wash
}

/** The swatch colour of a color: a variable for a name, a computed colour for a hue. */
export function swatchValue(color: string, t: ThemeTokens | null): string | undefined {
  if (PAGE_COLORS.includes(color)) return `var(--pc-${color})`
  const c = parseCustom(color)
  return c === null || t === null ? undefined : customShade(c.hue, t, c.vivid).shade
}

/** The hue slider's track: the shades at hues 0, 30, ... 330 and 359, at a vividness. */
export function hueTrack(t: ThemeTokens, vivid: number = DEFAULT_VIVID): string {
  const hues = [...Array.from({ length: 12 }, (_, i) => i * 30), 359]
  return `linear-gradient(to right, ${hues.map((h) => customShade(h, t, vivid).shade).join(', ')})`
}

/** The vividness slider's track: the washes of a hue at vividness 50, 75, ... 200. */
export function vividTrack(hue: number, t: ThemeTokens): string {
  const stops = []
  for (let v = MIN_VIVID; v <= MAX_VIVID; v += 5 * VIVID_STEP) stops.push(customShade(hue, t, v).wash)
  return `linear-gradient(to right, ${stops.join(', ')})`
}
