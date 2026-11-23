import { expect, test } from 'vitest'
import { THEMES } from './theme'
import tokensCss from '../styles/tokens.css?raw'

const SELECTORS = [
  ...THEMES.map((t) => (t === 'light' ? ':root, [data-theme="light"]' : `[data-theme="${t}"]`)),
  ':root:not([data-theme])',
]

function block(selector: string): Record<string, string> {
  const start = tokensCss.indexOf(selector + ' {')
  expect(start, selector).toBeGreaterThanOrEqual(0)
  const open = tokensCss.indexOf('{', start)
  const out: Record<string, string> = {}
  for (const m of tokensCss.slice(open + 1, tokensCss.indexOf('}', open)).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g))
    out[m[1]] = m[2].trim()
  return out
}

/** The token's colour, following a `var(--other)` reference within the theme's block. */
function resolve(b: Record<string, string>, name: string): string {
  let v = b[name]
  for (let i = 0; i < 3 && v?.startsWith('var('); i++) v = b[v.slice(4, -1).trim()]
  return v
}

function lum(hex: string): number {
  const c = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
function ratio(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

// The soon and overdue due chips take their text and border colour from these tokens.
test.each(SELECTORS)('due chip colors in %s', (s) => {
  const b = block(s)
  for (const name of ['--due-soon', '--due-overdue']) {
    const c = resolve(b, name)
    expect(c, name).toMatch(/^#[0-9a-f]{6}$/i)
    expect(ratio(c, b['--bg']), `${name} on bg`).toBeGreaterThanOrEqual(3)
    expect(ratio(c, b['--card']), `${name} on card`).toBeGreaterThanOrEqual(3)
  }
})
