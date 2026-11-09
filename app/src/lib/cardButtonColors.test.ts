import { expect, test } from 'vitest'
import tokensCss from '../styles/tokens.css?raw'

const SELECTORS = [
  ':root, [data-theme="light"]',
  '[data-theme="dark"]',
  '[data-theme="violet"]',
  '[data-theme="graphite"]',
  '[data-theme="teal"]',
  '[data-theme="taupe"]',
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

// The buttons on a hovered board card (the arrow and the "..." menu) have their own background. Their glyphs use
// --text, at rest and when hovered or open.
test.each(SELECTORS)('card button colors in %s', (s) => {
  const b = block(s)
  const rest = b['--card-btn']
  const hover = b['--card-btn-hover']
  expect(rest, 'rest token').toMatch(/^#[0-9a-f]{6}$/i)
  expect(hover, 'hover token').toMatch(/^#[0-9a-f]{6}$/i)
  expect(ratio(rest, b['--card']), 'rest differs from the card').toBeGreaterThanOrEqual(1.25)
  expect(ratio(hover, rest), 'hover differs from rest').toBeGreaterThanOrEqual(1.15)
  expect(ratio(b['--text'], rest), 'glyph at rest').toBeGreaterThanOrEqual(3)
  expect(ratio(b['--text'], hover), 'glyph on hover').toBeGreaterThanOrEqual(3)
})
