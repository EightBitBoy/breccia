import { expect, test } from 'vitest'
import { THEMES } from './theme'
import tokensCss from '../styles/tokens.css?raw'

const selectorOf = (t: string): string => (t === 'light' ? ':root, [data-theme="light"]' : `[data-theme="${t}"]`)
const SELECTORS = [...THEMES.map(selectorOf), ':root:not([data-theme])']

function block(selector: string): Record<string, string> {
  const start = tokensCss.indexOf(selector + ' {')
  expect(start, selector).toBeGreaterThanOrEqual(0)
  const open = tokensCss.indexOf('{', start)
  const out: Record<string, string> = {}
  for (const m of tokensCss.slice(open + 1, tokensCss.indexOf('}', open)).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g))
    out[m[1]] = m[2].trim()
  return out
}

function lum(hex: string): number {
  const c = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
function contrast(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

// [foreground, background, least contrast]
const PAIRS: [string, string, number][] = [
  ...['--bg', '--side', '--card', '--hover', '--edit', '--select'].map((bg): [string, string, number] => ['--text', bg, 4.5]),
  ...['--link', '--tag'].flatMap((fg): [string, string, number][] => [
    [fg, '--bg', 3],
    [fg, '--hover', 3],
    [fg, '--select', 3],
  ]),
  ['--muted', '--bg', 3],
  ['--accent', '--bg', 3],
  ['--on-accent', '--accent', 4.5],
  ['--hover', '--bg', 1.1],
  ['--select', '--bg', 1.2],
  ['--select', '--edit', 1.14], // a text selection in the edited block shows
]

test.each(SELECTORS)('plain surfaces are readable in %s', (s) => {
  const b = block(s)
  for (const [fg, bg, least] of PAIRS) {
    expect(contrast(b[fg], b[bg]), `${s} ${fg} on ${bg}`).toBeGreaterThanOrEqual(least)
  }
  for (const name of Object.keys(b).filter((n) => n.startsWith('--c-') && n !== '--c-dim')) {
    expect(contrast(b[name], b['--bg']), `${s} ${name} on --bg`).toBeGreaterThanOrEqual(3)
  }
})
